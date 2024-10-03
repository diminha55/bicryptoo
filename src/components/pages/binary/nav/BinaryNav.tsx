import React, { memo, useState, useEffect } from "react";
import { MarketTab } from "./MarketTab";
import { useRouter } from "next/router";
import useMarketStore from "@/stores/trade/market";
import { debounce } from "lodash";
import ThemeSwitcher from "@/components/widgets/ThemeSwitcher";
import { AccountDropdown } from "@/components/layouts/shared/AccountDropdown";
import Link from "next/link";
import LogoText from "@/components/vector/LogoText";
import { useBinaryOrderStore } from "@/stores/binary/order";
import Card from "@/components/elements/base/card/Card";
import { useTranslation } from "next-i18next";
import ButtonLink from "@/components/elements/base/button-link/ButtonLink";
import { SearchBar } from "../../trade/markets/SearchBar";
import { MarketList } from "../../trade/markets/MarketList";
import Dropdown from "@/components/elements/base/dropdown/Dropdown";
import { Icon } from "@iconify/react";
import IconButton from "@/components/elements/base/button-icon/IconButton";
import { useDashboardStore } from "@/stores/dashboard";
import useWebSocketStore from "@/stores/trade/ws";
const BinaryNavBase: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useDashboardStore();
  const { market, fetchData, setPriceChangeData, getPrecisionBySymbol } =
    useMarketStore();
  const [marketReady, setMarketReady] = useState(false);
  const {
    createConnection,
    removeConnection,
    addMessageHandler,
    removeMessageHandler,
    subscribe,
    unsubscribe,
    tickersConnection,
  } = useWebSocketStore();
  const router = useRouter();
  const [currency, setCurrency] = useState<string | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const getPrecision = (type) => Number(market?.precision?.[type] || 8);
  const { wallet, fetchWallet, getPracticeBalance } = useBinaryOrderStore();
  const isPractice = router.query.practice === "true";
  const debouncedFetchWallet = debounce(fetchWallet, 100);
  useEffect(() => {
    if (!isPractice && market && pair) {
      debouncedFetchWallet(pair);
    }
  }, [pair, market]);
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
  const debouncedFetchData = debounce(fetchData, 100);
  useEffect(() => {
    if (router.isReady && currency && pair) {
      debouncedFetchData(currency, pair);
    }
  }, [router.isReady, currency, pair]);
  useEffect(() => {
    if (router.isReady && market) {
      const path = `/api/exchange/market`;
      createConnection("tradesConnection", path);
      return () => {
        if (!router.query.symbol) {
          removeConnection("tradesConnection");
        }
      };
    }
  }, [router.isReady, market?.symbol]);
  useEffect(() => {
    if (market && !marketReady) {
      const path = `/api/exchange/ticker`;
      createConnection("tickersConnection", path);
      setMarketReady(true);
      return () => {
        removeConnection("tickersConnection");
      };
    }
  }, [market, createConnection, removeConnection]);
  useEffect(() => {
    if (tickersConnection?.isConnected) {
      subscribe("tickersConnection", "tickers");
      return () => {
        unsubscribe("tickersConnection", "tickers");
      };
    }
  }, [tickersConnection?.isConnected, subscribe, unsubscribe]);
  useEffect(() => {
    if (marketReady) {
      const messageFilter = (message) =>
        message.stream && message.stream === "tickers";
      addMessageHandler(
        "tickersConnection",
        handleTickerMessage,
        messageFilter
      );
      return () => {
        removeMessageHandler("tickersConnection", handleTickerMessage);
      };
    }
  }, [marketReady, addMessageHandler, removeMessageHandler]);
  const balance = isPractice ? getPracticeBalance() : wallet?.balance;
  return (
    <div className="h-full max-h-[120px] p-2 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Link
          className="relative flex flex-shrink-0 flex-grow-0 items-center rounded-[.52rem] px-3 py-2 no-underline transition-all duration-300"
          href="/"
        >
          <LogoText
            className={`max-w-[100px] text-muted-900 dark:text-white`}
          />
        </Link>
        <Link href={"/user"}>
          <IconButton shape="rounded" color="muted">
            <Icon icon="line-md:chevron-left" className="h-5 w-5" />
          </IconButton>
        </Link>
        <Dropdown
          title={t("Markets")}
          indicator={false}
          toggleButton={
            <>
              {currency}/{pair}
            </>
          }
          toggleClassNames="border-muted-200 dark:border-transparent shadow-lg shadow-muted-300/30 dark:shadow-muted-800/30 dark:hover:bg-muted-900 border dark:hover:border-muted-800 rounded-full"
          width={300}
          shape="straight"
          toggleShape="rounded"
        >
          <div className="w-full h-full min-h-[40vh] min-w-[300px]">
            <div className="flex w-full h-[40vh] gap-2">
              <div className="bg-muted-200 dark:bg-muted-800 h-full mt-1 max-h-[40vh] overflow-y-auto slimscroll">
                <MarketTab />
              </div>
              <div className="w-full h-full flex flex-col pe-2">
                <SearchBar />
                <div className="max-h-[40vh] overflow-y-auto slimscroll">
                  <MarketList type="binary" />
                </div>
              </div>
            </div>
          </div>
        </Dropdown>
        {/* <Ticker /> */}
      </div>
      <div className="flex items-center gap-2">
        <Card
          className={`p-[5px] px-3 text-lg ${
            isPractice ? "text-warning-500" : "text-success-500"
          }`}
          shape={"rounded"}
        >
          {balance?.toFixed(getPrecision("price")) || 0} {pair}
        </Card>
        <ButtonLink
          href={
            profile?.id
              ? "/user/wallet/deposit"
              : "/login?return=/user/wallet/deposit"
          }
          color="success"
          size="md"
          shape={"rounded"}
        >
          {t("Deposit")}
        </ButtonLink>
        <div>
          <ThemeSwitcher />
        </div>

        <AccountDropdown />
      </div>
    </div>
  );
};
export const BinaryNav = memo(BinaryNavBase);
