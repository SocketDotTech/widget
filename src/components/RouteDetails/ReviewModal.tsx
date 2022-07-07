import { useDispatch, useSelector } from "react-redux";
import { useContext, useEffect, useState } from "react";
import { CustomizeContext } from "../CustomizeProvider";

// components
import { Button } from "../Button";
import { Modal } from "../Modal";
import { TokenDetail } from "../TokenDetail";
import { ChevronRight, ChevronUp } from "react-feather";
import { InnerCard } from "../common/InnerCard";

// actions
import { setIsTxModalOpen } from "../../state/modals";
import { setSelectedRoute } from "../../state/selectedRouteSlice";
import { TxStepDetails } from "../TxModal/TxStepDetails";

export const ReviewModal = ({ closeModal }: { closeModal: () => void }) => {
  const dispatch = useDispatch();
  const bestRoute = useSelector((state: any) => state.quotes.bestRoute);
  const selectedRoute = useSelector((state: any) => state.routes.selectedRoute);
  const [showTxDetails, setShowTxDetails] = useState<boolean>(false);
  const [quoteUpdated, setQuoteUpdated] = useState<boolean>(false);

  const customSettings = useContext(CustomizeContext);
  const { borderRadius } = customSettings.customization;

  function updateSelectedRoute() {
    dispatch(setSelectedRoute(bestRoute));
  }

  async function openTxModal() {
    dispatch(setIsTxModalOpen(true));
  }

  useEffect(() => {
    if (bestRoute !== selectedRoute) {
      setQuoteUpdated(true);
    } else setQuoteUpdated(false);
  }, [selectedRoute, bestRoute]);

  return (
    <Modal title="Review Quote" closeModal={closeModal}>
      <div className="flex flex-col justify-between flex-1 relative">
        <div>
          <div className="flex justify-between mt-5 items-center px-3">
            <TokenDetail
              token={selectedRoute?.path?.fromToken}
              amount={selectedRoute?.amount}
            />
            <ChevronRight className="w-4 h-4 text-widget-secondary" />
            <TokenDetail
              token={selectedRoute?.path?.toToken}
              amount={selectedRoute?.route?.toAmount}
              rtl
            />
          </div>

          <div className="p-3 flex flex-col gap-3 mt-5">
            <RouteDetailRow
              label="Bridge Name"
              value={selectedRoute?.route?.usedBridgeNames?.[0]}
            />
            <RouteDetailRow
              label="Total Gas Fee"
              value={selectedRoute?.route?.totalGasFeesInUsd?.toFixed(3)}
            />
          </div>
        </div>

        <InnerCard
          classNames={`absolute w-full flex bottom-0 flex-col justify-between transition-all	 ${
            showTxDetails ? `h-full max-h-full` : "h-auto max-h-min"
          }`}
        >
          <div className="flex-1 flex flex-col overflow-auto">
            <button
              className="flex items-center gap-1.5 text-sm text-widget-secondary mb-3"
              onClick={() => setShowTxDetails(!showTxDetails)}
            >
              <ChevronUp
                className={`w-4 h-4 text-widget-secondary transition-all ${
                  showTxDetails ? "rotate-180" : "rotate-0"
                }`}
              />{" "}
              See route details
            </button>

            {showTxDetails && (
              <div className="mb-3 flex-1 overflow-y-auto">
                <TxStepDetails activeRoute={selectedRoute?.route} />
              </div>
            )}
          </div>

          <div
            className={`h-14 transition-all duration-300 flex justify-between items-center border ${
              quoteUpdated
                ? "border-widget-outline p-1 pl-2"
                : "border-transparent"
            }`}
            style={{ borderRadius: `calc(0.875rem * ${borderRadius})` }}
          >
            {quoteUpdated && (
              <span className="whitespace-nowrap w-full text-widget-secondary text-sm">
                Quote updated
              </span>
            )}

            <Button
              onClick={quoteUpdated ? updateSelectedRoute : openTxModal}
              classNames={`${quoteUpdated ? "h-12" : ""}`}
            >
              {quoteUpdated ? "Accept" : "Confirm Bridge"}
            </Button>
          </div>
        </InnerCard>
      </div>
    </Modal>
  );
};

const RouteDetailRow = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="w-full flex justify-between text-sm text-widget-secondary">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
};