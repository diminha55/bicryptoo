import React, { useState, useEffect, memo } from "react";
import { formatLargeNumber } from "@/utils/market";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useDashboardStore } from "@/stores/dashboard";
import useMarketStore from "@/stores/trade/market";
import useWebSocketStore from "@/stores/trade/ws";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";

const exchange = process.env.NEXT_PUBLIC_EXCHANGE;
const TickerBase = () => {
  const { t } = useTranslation();
  const { isDark } = useDashboardStore();
  const { market } = useMarketStore();
  const {
    subscribe,
    unsubscribe,
    addMessageHandler,
    removeMessageHandler,
    tradesConnection,
  } = useWebSocketStore();
  const router = useRouter();

  const [ticker, setTicker] = useState<Ticker>();

  const getPrecision = (type: string) => Number(market?.precision?.[type] || 8);

  const handleTickerMessage = (message: any, exchange: string) => {
    if (message.stream !== "ticker") return;

    const { data } = message;
    if (!data || (exchange === "kuc" && data.symbol !== market.symbol)) return;

    const tickerData =
      exchange === "bin"
        ? { ...data }
        : {
            symbol: data.symbol,
            timestamp: data.timestamp,
            datetime: data.datetime,
            bid: data.bid,
            bidVolume: data.bidVolume,
            ask: data.ask,
            askVolume: data.askVolume,
            close: data.close,
            last: data.last,
          };

    setTicker(tickerData);
  };

  const resetTicker = () => setTicker(undefined);

  useEffect(() => {
    if (router.isReady && market && tradesConnection?.isConnected) {
      const handler = (message: any) =>
        handleTickerMessage(message, exchange as string);
      const messageFilter = (message: any) => message.stream === "ticker";

      addMessageHandler("tradesConnection", handler, messageFilter);
      subscribe("tradesConnection", "ticker", { symbol: market?.symbol });

      return () => {
        unsubscribe("tradesConnection", "ticker", { symbol: market?.symbol });
        removeMessageHandler("tradesConnection", handler);
        resetTicker();
      };
    }
  }, [router.isReady, market, tradesConnection?.isConnected]);

  const renderSkeleton = (width: number, height: number) => (
    <Skeleton
      width={width}
      height={height}
      baseColor={isDark ? "#27272a" : "#f7fafc"}
      highlightColor={isDark ? "#3a3a3e" : "#edf2f7"}
    />
  );

  return (
    <div className="flex gap-5 p-2 text-muted-800 dark:text-muted-200 items-center justify-center h-full">
      <div className="pe-5 border-r border-muted-300 dark:border-muted-700 hidden md:block">
        {ticker?.symbol || renderSkeleton(80, 16)}
      </div>
      <div className="flex w-full h-full">
        <div className="w-1/3 flex flex-col md:flex-row items-center h-full gap-1">
          <div className="w-full md:w-1/2 text-sm md:text-lg">
            <span className="block md:hidden">
              {ticker?.symbol || renderSkeleton(60, 12)}
            </span>
            <span>{ticker?.last?.toFixed(5) || renderSkeleton(40, 10)}</span>
          </div>
          {process.env.NEXT_PUBLIC_EXCHANGE === "bin" && (
            <div className="w-full md:w-1/2 text-xs md:text-sm">
              <span className="text-muted-600 dark:text-muted-400">
                {t("24h change")}
              </span>
              <div className="text-md flex gap-1 items-center">
                <span
                  className={
                    ticker && ticker.percentage && ticker.percentage >= 0
                      ? ticker?.percentage === 0
                        ? ""
                        : "text-success-500"
                      : "text-danger-500"
                  }
                >
                  {ticker?.change !== undefined
                    ? ticker.change.toFixed(2)
                    : renderSkeleton(40, 10)}
                </span>
                <span
                  className={`text-xs ${
                    ticker && ticker.percentage && ticker.percentage >= 0
                      ? ticker?.percentage === 0
                        ? ""
                        : "text-success-500"
                      : "text-danger-500"
                  }`}
                >
                  {ticker?.percentage !== undefined
                    ? `${ticker.percentage.toFixed(2)}%`
                    : renderSkeleton(30, 8)}
                </span>
              </div>
            </div>
          )}
        </div>
        {process.env.NEXT_PUBLIC_EXCHANGE === "bin" && (
          <>
            <div className="w-1/3 flex flex-col md:flex-row text-xs md:text-sm h-full items-center justify-between">
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("24h high")}
                </span>
                <div>{ticker?.high?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("24h low")}
                </span>
                <div>{ticker?.low?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
            </div>
            <div className="w-1/3 flex flex-col md:flex-row text-xs md:text-sm h-full items-center justify-between">
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("24h volume")} ({market?.currency})
                </span>
                <div>
                  {ticker?.baseVolume
                    ? formatLargeNumber(
                        ticker.baseVolume,
                        getPrecision("amount")
                      )
                    : renderSkeleton(40, 10)}
                </div>
              </div>
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("24h volume")} ({market?.pair})
                </span>
                <div>
                  {ticker?.quoteVolume
                    ? formatLargeNumber(
                        ticker.quoteVolume,
                        getPrecision("price")
                      )
                    : renderSkeleton(40, 10)}
                </div>
              </div>
            </div>
          </>
        )}
        {process.env.NEXT_PUBLIC_EXCHANGE === "kuc" && (
          <>
            <div className="w-1/2 flex flex-col md:flex-row text-xs md:text-sm h-full items-center justify-between">
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("Bid")}
                </span>
                <div>{ticker?.bid?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("Ask")}
                </span>
                <div>{ticker?.ask?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
            </div>
            <div className="w-1/2 flex flex-col md:flex-row text-xs md:text-sm h-full items-center justify-between">
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("Close")}
                </span>
                <div>{ticker?.close?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
              <div className="w-full md:w-1/2">
                <span className="text-muted-600 dark:text-muted-400">
                  {t("Last")}
                </span>
                <div>{ticker?.last?.toFixed(5) || renderSkeleton(40, 10)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const Ticker = memo(TickerBase);
