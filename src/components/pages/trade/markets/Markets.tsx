import React, { memo, useState, useEffect } from "react";
import { SearchBar } from "./SearchBar";
import { MarketList } from "./MarketList";
import { MarketTab } from "./MarketTab";
import { useRouter } from "next/router";
import useMarketStore from "@/stores/trade/market";
import useWebSocketStore from "@/stores/trade/ws";
import { debounce } from "lodash";

const MarketsBase: React.FC = () => {
  const {
    market,
    searchQuery,
    fetchData,
    setPriceChangeData,
    getPrecisionBySymbol,
  } = useMarketStore();
  const [currency, setCurrency] = useState<string | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const router = useRouter();
  const {
    createConnection,
    removeConnection,
    addMessageHandler,
    removeMessageHandler,
    subscribe,
    unsubscribe,
    tickersConnection,
    ecoTickersConnection,
  } = useWebSocketStore();

  useEffect(() => {
    if (router.query.symbol) {
      const [newCurrency, newPair] =
        typeof router.query.symbol === "string"
          ? router.query.symbol.split("_")
          : [];
      setCurrency(newCurrency);
      setPair(newPair);
    }
  }, [router.query.symbol]);

  const handleTickerMessage = (message) => {
    if (!message || message.stream !== "tickers") return;

    const updates = message.data;

    Object.keys(updates).forEach((symbol) => {
      const update = updates[symbol];
      if (update.last !== undefined && update.change !== undefined) {
        const precision = getPrecisionBySymbol(symbol);
        setPriceChangeData(
          symbol,
          update.last.toFixed(precision.price),
          update.change.toFixed(2)
        );
      }
    });
  };

  useEffect(() => {
    if (router.isReady && market) {
      const { isEco } = market;
      const path = isEco ? `/api/ext/ecosystem/market` : `/api/exchange/market`;

      createConnection("tradesConnection", path);

      return () => {
        if (!router.query.symbol) {
          removeConnection("tradesConnection");
        }
      };
    }
  }, [router.isReady, market?.symbol]);

  useEffect(() => {
    if (!router.isReady) return;

    const tickerPath = "/api/exchange/ticker";
    createConnection("tickersConnection", tickerPath);

    return () => {
      if (!router.query.symbol) {
        removeConnection("tickersConnection");
      }
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady || !market?.isEco) return;

    const ecoTickerPath = "/api/ext/ecosystem/ticker";
    createConnection("ecoTickersConnection", ecoTickerPath);

    return () => {
      if (!router.query.symbol) {
        removeConnection("ecoTickersConnection");
      }
    };
  }, [router.isReady, market?.isEco]);

  useEffect(() => {
    if (tickersConnection?.isConnected) {
      subscribe("tickersConnection", "tickers");
      addMessageHandler("tickersConnection", handleTickerMessage);

      return () => {
        unsubscribe("tickersConnection", "tickers");
        removeMessageHandler("tickersConnection", handleTickerMessage);
      };
    }
  }, [tickersConnection?.isConnected]);

  useEffect(() => {
    if (ecoTickersConnection?.isConnected && market?.isEco === true) {
      subscribe("ecoTickersConnection", "tickers");
      addMessageHandler("ecoTickersConnection", handleTickerMessage);

      return () => {
        unsubscribe("ecoTickersConnection", "tickers");
        removeMessageHandler("ecoTickersConnection", handleTickerMessage);
      };
    }
  }, [ecoTickersConnection?.isConnected, market?.isEco]);

  const debouncedFetchData = debounce(fetchData, 100);

  useEffect(() => {
    if (router.isReady && currency && pair) {
      debouncedFetchData(currency, pair);
    }
  }, [router.isReady, currency, pair]);

  return (
    <div className="h-full max-h-[50vh] p-2">
      <SearchBar />
      {searchQuery === "" && <MarketTab />}
      <MarketList />
    </div>
  );
};

export const Markets = memo(MarketsBase);
