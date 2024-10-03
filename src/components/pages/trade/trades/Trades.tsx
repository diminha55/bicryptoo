import React, { useState, useEffect, memo } from "react";
import { TradesTableHeader } from "./TradesTableHeader";
import { Trade } from "./Trades.types";
import { TradeRow } from "./TradeRow";
import useWebSocketStore from "@/stores/trade/ws";
import useMarketStore from "@/stores/trade/market";
import { formatDate } from "date-fns";
import { useTranslation } from "next-i18next";

const TradesBase = () => {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<Trade[]>([]);
  const { market } = useMarketStore();
  const {
    subscribe,
    unsubscribe,
    addMessageHandler,
    removeMessageHandler,
    tradesConnection,
  } = useWebSocketStore();
  useEffect(() => {
    if (market?.currency && market?.pair && tradesConnection?.isConnected) {
      const handleTradesMessage = (message: any) => {
        const { data } = message;
        if (!data) return;
        const newTrades = data.map((trade: any) => ({
          id: trade.id,
          price: trade.price,
          amount: trade.amount,
          time: formatDate(
            new Date(trade.datetime || trade.timestamp),
            "HH:mm:ss"
          ),
          side: trade.side.toLowerCase(),
        }));
        // Avoid duplicates
        setTrades((prevTrades) => {
          const uniqueTrades = newTrades.filter(
            (newTrade) =>
              !prevTrades.some((trade: any) => trade.id === newTrade.id)
          );
          return [...uniqueTrades, ...prevTrades.slice(0, 49)];
        });
      };
      const messageFilter = (message: any) => message.stream === "trades";
      addMessageHandler("tradesConnection", handleTradesMessage, messageFilter);
      subscribe("tradesConnection", "trades", {
        symbol: `${market?.currency}/${market?.pair}`,
      });
      return () => {
        unsubscribe("tradesConnection", "trades", {
          symbol: `${market?.currency}/${market?.pair}`,
        });
        removeMessageHandler("tradesConnection", handleTradesMessage);
        setTrades([]);
      };
    }
  }, [market?.currency, market?.pair, tradesConnection?.isConnected]);
  return (
    <>
      <TradesTableHeader />
      <div className="max-h-[50vh] m-2 overflow-y-auto">
        {(trades.length > 0 &&
          trades.map((trade, index) => (
            <TradeRow key={index} trade={trade} />
          ))) || (
          <div className="flex items-center justify-center h-full text-sm">
            <span className="text-muted-400 dark:text-muted-500">
              {t("No Trades")}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
export const Trades = memo(TradesBase);