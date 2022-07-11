import { useDispatch, useSelector } from "react-redux";
import { useContext, useEffect, useState } from "react";
import { SocketTx } from "socket-v2-sdk";
import { ChevronRight } from "react-feather";

// components
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { TxStepDetails } from "./TxStepDetails";
import { TokenDetail } from "../common/TokenDetail";
import { BridgingLoader } from "./BridgingLoader";

// actions
import { setActiveRoute, setError, setIsTxModalOpen } from "../../state/modals";
import { setTxDetails } from "../../state/txDetails";

// hooks
import { socket, useActiveRoutes } from "../../hooks/apis";
import { handleNetworkChange } from "../../utils";

import {
  USER_TX_LABELS,
  UserTxType,
  PrepareTxStatus,
  ButtonTexts,
} from "../../consts/";

import { Web3Context } from "../../providers/Web3Provider";

// The main modal that contains all the information related after clicking on review quote.
// Responsible for the progression of the route.
// Functions responsible for sending a transaction and checking the status of the route.
export const TxModal = () => {
  const dispatch = useDispatch();
  function closeTxModal() {
    dispatch(setIsTxModalOpen(false));
  }

  // When the tx modal is opened from the tx-history(pending) section, selectedRoute will be set to null & activeRoute will be truthy
  // If the tx modal is opened in the normal user flow, the selected route will be truthy and activeRoute will be null
  const selectedRoute = useSelector((state: any) => state.routes.selectedRoute);
  const activeRoute = useSelector((state: any) => state.modals.activeRoute);
  const allNetworks = useSelector((state: any) => state.networks.allNetworks);
  const txDetails = useSelector((state: any) => state.txDetails.txDetails);

  const web3Context = useContext(Web3Context);
  const {
    userAddress,
    signer,
    provider,
    networkId: activeChain,
  } = web3Context.web3Provider;

  const [initiating, setInitiating] = useState<boolean>(false);
  const [isApprovalRequired, setIsApprovalRequired] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [txInProgress, setTxInProgress] = useState<boolean>(false);
  const [bridging, setBridging] = useState<boolean>(false);
  const [txCompleted, setTxCompleted] = useState<boolean>(false);

  const [approvalTxData, setApprovalTxData] = useState<any>(null);
  const [userTx, setUserTx] = useState(null);
  const { mutate: mutateActiveRoutes } = useActiveRoutes();
  const [explorerParams, setExplorerParams] = useState({
    txHash: "",
    chainId: "",
  });

  // Function to switch the connected network.
  function switchNetwork() {
    const chain = allNetworks.filter((x) => x.chainId === userTx?.chainId)?.[0];
    handleNetworkChange(provider, chain);
  }

  function saveTxDetails(
    account: string,
    routeId: number,
    stepIndex: number,
    value: { hash: string; userTxType: string }
  ): void {
    const prevTxDetails = JSON.parse(localStorage.getItem("txData")) ?? {};
      const prevTxDetailsAccount = prevTxDetails[account];

      // // create account key if doesn't exist
      if (!prevTxDetailsAccount) prevTxDetails[account] = {};
      const prevTxDetailsRouteId =
        prevTxDetails[account][routeId];

      // // create route Id key if it doesn't exist
      if (prevTxDetailsRouteId) {
        prevTxDetails[account] = {
          ...prevTxDetails[account],
          [routeId]: {
            ...prevTxDetailsRouteId,
            [stepIndex]: value,
          },
        };
      } else {
        prevTxDetails[account] = {
          ...prevTxDetails[account],
          [routeId]: {
            [stepIndex]: value,
          },
        };
      }

      localStorage.setItem("txData", JSON.stringify(prevTxDetails));
      return prevTxDetails;
  }

  // Function that submits the approval transaction when approval is needed.
  async function submitApproval() {
    setIsApproving(true);
    try {
      const approvalTx = await signer.sendTransaction(approvalTxData);
      await approvalTx.wait();
      setIsApproving(false);
      setIsApprovalRequired(false); // Set to false when approval is done.
    } catch (e) {
      dispatch(setError(e.message));
    }
  }

  // Function that start the selected route.
  async function startRoute() {
    setInitiating(true);
    try {
      const execute = await socket.start(selectedRoute);
      await prepareNextTransaction(execute);
    } catch (e) {
      dispatch(setError(e.message));
    }
  }

  // Function that lets the user continue the route from the previous transaction when he reopens the widget.
  async function continueRoute(txHash?: string, _activeRouteId?: number) {
    setInitiating(true);
    // in normal flow, txType and activeRouteId  will be passed.
    // when continuing from tx history section, prevTxData from the localStorage will be fetched;
    const prevTxData = txDetails?.[userAddress]?.[activeRoute?.activeRouteId];
    const keysArr = prevTxData && Object.keys(prevTxData);
    const lastStep = prevTxData?.[keysArr?.[keysArr?.length - 1]];

    try {
      const execute = await socket.continue(
        activeRoute?.activeRouteId || _activeRouteId
      );
      await prepareNextTransaction(
        execute,
        txHash || lastStep?.hash,
        lastStep?.userTxType
      );
    } catch (e) {
      const err = e.message;
      if (err.match("is already complete")) {
        // the backend throws an error if we request a tx for a completed route.
        setTxCompleted(true);
      } else {
        dispatch(setError(err));
      }
      setInitiating(false);
      setBridging(false);
    }
  }

  // Function that checks the progress of the route and initiates the next transaction when ready.
  // Uses the same tx as init if the 1st tx isn't completed
  async function submitNextTx() {
    // Set the tx in progress.
    setTxInProgress(true);
    try {
      const sendTxData = await userTx.getSendTransaction();
      const sendTx = await signer.sendTransaction(sendTxData);

      // set data to local storage, txHash is in storage if the user leaves in the middle of the transaction.
      const value = { hash: sendTx.hash, userTxType: userTx.userTxType };
      const prevTxDetails = saveTxDetails(userAddress, userTx.activeRouteId, userTx.userTxIndex, value);
      dispatch(
        setTxDetails({
          prevTxDetails
        })
      );

      // Set Tx Progress as false when tx is included in the chain.
      await sendTx.wait();
      setTxInProgress(false);

      // if tx is of type fund-movr, set bridging loader to true
      if (userTx.userTxType === UserTxType.FUND_MOVR) {
        setExplorerParams({
          txHash: sendTx.hash,
          chainId: selectedRoute?.path?.fromToken?.chainId,
        });
        setBridging(true);
      }

      // This checks the status of the transaction. The status can be ready, completed and pending.
      const currentStatus = await userTx.submit(sendTx.hash);

      // If current status is completed mark route as completed else continue the route.
      if (currentStatus && currentStatus !== PrepareTxStatus.COMPLETED) {
        await continueRoute(userTx.hash, userTx.activeRouteId);
      } else if (currentStatus === PrepareTxStatus.COMPLETED) {
        setTxCompleted(true);
        setBridging(false);
        mutateActiveRoutes();
      }
    } catch (e) {
      dispatch(setError(e.message));
      setBridging(false);
      setTxInProgress(false);
    }
  }

  // Function that prepares the next transaction in the route.
  const prepareNextTransaction = async (
    execute: AsyncGenerator<SocketTx, void, string>,
    txHash?: string,
    txType?: string
  ) => {
    // If the tx is of type 'fund-movr', set bridging to true.
    if (!bridging && txType === UserTxType.FUND_MOVR) {
      setExplorerParams({
        txHash: txHash,
        chainId:
          selectedRoute?.path?.fromToken?.chainId || activeRoute?.fromChainId,
      });
      setBridging(true);
      setInitiating(false);
    }

    try {
      // If txHash is present, pass the txHash to execute else do not.
      const next = txHash ? await execute.next(txHash) : await execute.next();
      setBridging(false);

      // If next.done is false, then set the userTx to next.value.
      // If approval is needed, set approval required to true and set approval tx Data.
      if (!next.done && next.value) {
        const tx = next.value;
        setUserTx(tx); // used in doTransaction to get txData
        const _approvalTxData = await tx.getApproveTransaction();
        setInitiating(false);
        setApprovalTxData(_approvalTxData);
        if (_approvalTxData) setIsApprovalRequired(true);
      }

      // If next.done is true, set tx as completed.
      if (next.done) {
        setInitiating(false);
        setTxCompleted(true);
      }
    } catch (e) {
      dispatch(setError(e.message));
      setBridging(false);
      setInitiating(false);
    }
  };

  useEffect(() => {
    if (!activeRoute) startRoute();
    else continueRoute();

    return () => {
      dispatch(setActiveRoute(null));
    };
  }, []); // the activeRoute is set before the txModal is opened.

  const sourceTokenDetails = {
    token: selectedRoute?.path?.fromToken || activeRoute?.fromAsset,
    amount: selectedRoute?.amount || activeRoute?.fromAmount,
  };

  const destTokenDetails = {
    token: selectedRoute?.path?.toToken || activeRoute?.toAsset,
    amount: selectedRoute?.route?.toAmount || activeRoute?.toAmount,
  };

  return (
    <Modal
      title="Bridging transaction"
      closeModal={isApproving ? null : closeTxModal}
      disableClose={isApproving || txInProgress}
    >
      <div className="flex flex-col flex-1 overflow-hidden justify-between relative">
        <div className="flex-1 overflow-y-auto">
          <div className="flex justify-between mt-5 items-center px-3 mb-2.5">
            <TokenDetail
              token={sourceTokenDetails.token}
              amount={sourceTokenDetails.amount}
            />
            <ChevronRight className="w-4 h-4 text-widget-secondary" />
            <TokenDetail
              token={destTokenDetails.token}
              amount={destTokenDetails.amount}
              rtl
            />
          </div>

          <div className="px-3 py-3">
            <TxStepDetails
              activeRoute={activeRoute || selectedRoute?.route}
              // Setting currentTxIndex to 0 when the txModal is opened for the 'first time'.
              currentTxIndex={
                userTx?.userTxIndex || activeRoute?.currentUserTxIndex || 0
              }
              inProgress={txInProgress || bridging}
              completed={txCompleted}
            />
          </div>
        </div>

        <div className="p-3 shrink-0">
          {!txCompleted && (
            <>
              {userTx && activeChain !== userTx?.chainId ? (
                <Button onClick={switchNetwork} disabled={initiating}>
                  {initiating
                    ? ButtonTexts.INITIATING
                    : `Switch chain to ${
                        allNetworks.filter(
                          (x) => x.chainId === userTx?.chainId
                        )?.[0]?.name
                      }`}
                </Button>
              ) : isApprovalRequired ? (
                <Button
                  onClick={submitApproval}
                  disabled={!isApprovalRequired || isApproving}
                  isLoading={isApproving}
                >
                  {initiating
                    ? ButtonTexts.CHECKING_APPROVAL
                    : isApproving
                    ? ButtonTexts.APPROVING
                    : isApprovalRequired
                    ? ButtonTexts.APPROVE
                    : ButtonTexts.APPROVAL_DONE}
                </Button>
              ) : (
                <Button
                  onClick={submitNextTx}
                  disabled={
                    isApprovalRequired || txInProgress || initiating || bridging
                  }
                  isLoading={txInProgress}
                >
                  {bridging
                    ? ButtonTexts.BRIDGE_IN_PROGRESS
                    : initiating
                    ? ButtonTexts.INITIATING
                    : txInProgress
                    ? ButtonTexts.IN_PROGRESS
                    : USER_TX_LABELS?.[userTx?.userTxType]}
                </Button>
              )}
            </>
          )}
        </div>

        {bridging && !initiating && (
          <BridgingLoader
            source={sourceTokenDetails}
            dest={destTokenDetails}
            explorerParams={explorerParams}
          />
        )}
      </div>
    </Modal>
  );
};
