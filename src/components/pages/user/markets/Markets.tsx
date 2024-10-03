import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import Avatar from "@/components/elements/base/avatar/Avatar";
import Input from "@/components/elements/form/input/Input";
import Select from "@/components/elements/form/select//Select";
import HeadCell from "./HeadCell";
import IconButton from "@/components/elements/base/button-icon/IconButton";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDashboardStore } from "@/stores/dashboard";
import { useTranslation } from "next-i18next";
import useMarketStore from "@/stores/trade/market";
import { debounce } from "lodash";
import WebSocketManager from "@/utils/ws";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { formatLargeNumber } from "@/utils/market";
const MarketsBase = () => {
  const { t } = useTranslation();
  const {
    marketData,
    fetchData,
    setSearchQuery,
    getPrecisionBySymbol,
    setWithEco,
  } = useMarketStore();
  const [items, setItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(5);
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState(10);
  const [sorted, setSorted] = useState<{
    field: string;
    rule: "asc" | "desc";
  }>({
    field: "",
    rule: "asc",
  });
  const [pagination, setPagination] = useState({
    total: 0,
    lastPage: 0,
    perPage: 10,
    currentPage: 1,
    from: 1,
    to: 10,
  });
  const startIndex = (currentPage - 1) * view;
  const endIndex = startIndex + view;
  const pageItems = items.slice(startIndex, endIndex);
  const router = useRouter();
  const { profile, isDark, hasExtension } = useDashboardStore();
  const wsManagerMarket = useRef<WebSocketManager | null>(null);
  const wsManagerEcosystem = useRef<WebSocketManager | null>(null);
  const debouncedFetchData = debounce(fetchData, 100);
  useEffect(() => {
    if (router.isReady) {
      setWithEco(hasExtension("ecosystem"));
      debouncedFetchData();
    }
  }, [router.isReady]);
  useEffect(() => {
    setItems(marketData);
    setPagination((p) => ({
      ...p,
      total: marketData.length,
      lastPage: Math.ceil(marketData.length / view),
    }));
    setPages(calculatePages(marketData.length));
  }, [marketData, view]);

  const updateItem = (existingItem, update) => {
    const precision = getPrecisionBySymbol(existingItem.symbol);

    const parseToNumber = (value) => {
      const parsedValue = typeof value === "number" ? value : parseFloat(value);
      return isNaN(parsedValue) ? 0 : parsedValue;
    };

    return {
      ...existingItem,
      price:
        update.last !== undefined
          ? parseToNumber(update.last).toFixed(precision.price)
          : parseToNumber(existingItem.price).toFixed(precision.price),
      change:
        update.change !== undefined
          ? parseToNumber(update.change).toFixed(2)
          : parseToNumber(existingItem.change).toFixed(2),
      baseVolume:
        update.baseVolume !== undefined
          ? formatLargeNumber(update.baseVolume, precision.amount)
          : formatLargeNumber(existingItem.baseVolume, precision.amount),
      quoteVolume:
        update.quoteVolume !== undefined
          ? formatLargeNumber(update.quoteVolume, precision.price)
          : formatLargeNumber(existingItem.quoteVolume, precision.price),
      high: update.high !== undefined ? update.high : existingItem.high,
      low: update.low !== undefined ? update.low : existingItem.low,
      percentage:
        update.percentage !== undefined
          ? update.percentage
          : existingItem.percentage,
    };
  };

  const debouncedUpdateItems = useCallback(
    debounce((newData) => {
      setItems((prevItems) => {
        const updatedItems = prevItems.map((item) => {
          const update = newData[item.symbol];
          return update ? updateItem(item, update) : item;
        });

        return updatedItems;
      });
    }, 100),
    [getPrecisionBySymbol]
  );

  useEffect(() => {
    if (router.isReady) {
      // Market WebSocket
      if (!wsManagerMarket.current) {
        wsManagerMarket.current = new WebSocketManager(
          `/api/exchange/ticker${profile?.id ? `?userId=${profile.id}` : ""}`
        );
        wsManagerMarket.current.connect();
        wsManagerMarket.current.on("open", () => {
          wsManagerMarket.current?.send({
            action: "SUBSCRIBE",
            payload: { type: "tickers" },
          });
        });
        wsManagerMarket.current.on("message", (msg: any) => {
          if (msg.stream !== "tickers") return;
          debouncedUpdateItems(msg.data);
        });
      } else {
        wsManagerMarket.current.send({
          action: "SUBSCRIBE",
          payload: { type: "tickers" },
        });
      }
      // Ecosystem WebSocket
      if (hasExtension("ecosystem")) {
        if (!wsManagerEcosystem.current) {
          wsManagerEcosystem.current = new WebSocketManager(
            `/api/ext/ecosystem/ticker${
              profile?.id ? `?userId=${profile.id}` : ""
            }`
          );
          wsManagerEcosystem.current.connect();
          wsManagerEcosystem.current.on("open", () => {
            wsManagerEcosystem.current?.send({
              action: "SUBSCRIBE",
              payload: { type: "tickers" },
            });
          });
          wsManagerEcosystem.current.on("message", (msg: any) => {
            if (msg.stream !== "tickers") return;
            debouncedUpdateItems(msg.data);
          });
        } else {
          wsManagerEcosystem.current.send({
            action: "SUBSCRIBE",
            payload: { type: "tickers" },
          });
        }
      }
    }
    return () => {
      if (wsManagerMarket.current) {
        wsManagerMarket.current.send({
          action: "UNSUBSCRIBE",
          payload: { type: "tickers" },
        });
      }
      if (wsManagerEcosystem.current) {
        wsManagerEcosystem.current.send({
          action: "UNSUBSCRIBE",
          payload: { type: "tickers" },
        });
      }
    };
  }, [router.isReady, debouncedUpdateItems]);
  const calculatePages = (totalItems: number): number[] => {
    const totalPages = Math.ceil(totalItems / view);
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  };
  const changePage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= pagination.lastPage) {
        setCurrentPage(page);
        const newFrom = (page - 1) * view + 1;
        const newTo = page * view;
        setPagination((p) => ({
          ...p,
          currentPage: page,
          from: newFrom,
          to: newTo,
        }));
        setPages(calculatePages(items.length));
      }
    },
    [pagination.lastPage, view, items.length]
  );
  useEffect(() => {
    changePage(currentPage);
  }, [changePage, currentPage]);
  function compareOnKey(key: string, rule: "asc" | "desc") {
    return function (a: any, b: any) {
      if (typeof a[key] === "string" && typeof b[key] === "string") {
        return rule === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      }
      if (Array.isArray(a[key]) && Array.isArray(b[key])) {
        return rule === "asc"
          ? a[key].length - b[key].length
          : b[key].length - a[key].length;
      }
      return rule === "asc" ? a[key] - b[key] : b[key] - a[key];
    };
  }
  const showPages = useCallback(() => {
    const _pages: number[] = [];
    let from = pagination.currentPage - Math.ceil(offset / 2);
    if (from < 1) {
      from = 1;
    }
    let to = from + offset - 1;
    if (to > pagination.lastPage) {
      to = pagination.lastPage;
    }
    while (from <= to) {
      _pages.push(from);
      from++;
    }
    setPages(_pages);
  }, [offset, pagination.currentPage, pagination.lastPage]);
  function sort(field: string, rule: "asc" | "desc") {
    const copy = [...items];
    copy.sort(compareOnKey(field, rule));
    setSorted({ field, rule });
  }
  function search(value: string) {
    setSearchQuery(value);
    changePage(1);
    showPages();
  }
  return (
    <main id="datatable">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <h2 className="font-sans text-2xl font-light text-muted-700 dark:text-muted-200">
            {t("Markets Overview")}
          </h2>
        </div>
        <div className="flex items-center justify-end gap-3">
          <div className="hidden w-full md:block md:w-auto">
            <Input
              icon="lucide:search"
              color="contrast"
              placeholder={t("Search...")}
              onChange={(e) => search(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col overflow-x-auto lg:overflow-x-visible ltablet:overflow-x-visible">
        <table className="border border-muted-200 bg-white font-sans dark:border-muted-800 dark:bg-muted-950">
          <thead className="border-b border-fade-grey-2 dark:border-muted-800">
            <tr className=" divide-x divide-muted-200 dark:divide-muted-800">
              <th className="w-[30%] p-4">
                <HeadCell
                  label={t("Name")}
                  sortFn={sort}
                  sortField="symbol"
                  sorted={sorted}
                />
              </th>
              <th className="w-[20%] p-4">
                <HeadCell
                  label={t("Price")}
                  sortFn={sort}
                  sortField="price"
                  sorted={sorted}
                />
              </th>
              <th className="w-[20%] p-4">
                <HeadCell
                  label={t("Change")}
                  sortFn={sort}
                  sortField="change"
                  sorted={sorted}
                />
              </th>
              <th className="w-[25%] p-4">
                <HeadCell
                  label={t("24h Volume")}
                  sortFn={sort}
                  sortField="baseVolume"
                  sorted={sorted}
                />
              </th>
              <th className="w-[5%] text-end"></th>
            </tr>
          </thead>

          <tbody>
            {pageItems.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-muted-200 transition-colors duration-300 last:border-none 
                  hover:bg-muted-200/40 dark:border-muted-800 dark:hover:bg-muted-900/60 cursor-pointer`}
                onClick={() =>
                  router.push(`/trade/${item.symbol.replace("/", "_")}`)
                }
              >
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    {/* //TODO support eco images */}
                    <Avatar
                      size="xxs"
                      src={`/img/crypto/${item.currency.toLowerCase()}.webp`}
                      className="dark:invert"
                    />
                    <span className="line-clamp-1 text-md text-muted-700 dark:text-muted-200">
                      {item.symbol}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span className="line-clamp-1 text-md text-muted-700 dark:text-muted-200">
                    {item.price || (
                      <Skeleton
                        width={40}
                        height={10}
                        baseColor={isDark ? "#27272a" : "#f7fafc"}
                        highlightColor={isDark ? "#3a3a3e" : "#edf2f7"}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <span
                    className={`line-clamp-1 text-md text-${
                      item.change >= 0
                        ? item.change === 0
                          ? "muted"
                          : "success"
                        : "danger"
                    }-500`}
                  >
                    {item.change ? (
                      `${item.change}%`
                    ) : (
                      <Skeleton
                        width={40}
                        height={10}
                        baseColor={isDark ? "#27272a" : "#f7fafc"}
                        highlightColor={isDark ? "#3a3a3e" : "#edf2f7"}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div>
                    <span className="line-clamp-1 text-md text-muted-700 dark:text-muted-200">
                      {item.baseVolume || (
                        <Skeleton
                          width={40}
                          height={10}
                          baseColor={isDark ? "#27272a" : "#f7fafc"}
                          highlightColor={isDark ? "#3a3a3e" : "#edf2f7"}
                        />
                      )}{" "}
                      <span className=" text-muted-400 text-xs">
                        ({item.currency})
                      </span>
                    </span>
                    <span className="line-clamp-1 text-md text-muted-700 dark:text-muted-200">
                      {item.quoteVolume || (
                        <Skeleton
                          width={40}
                          height={10}
                          baseColor={isDark ? "#27272a" : "#f7fafc"}
                          highlightColor={isDark ? "#3a3a3e" : "#edf2f7"}
                        />
                      )}{" "}
                      <span className=" text-muted-400 text-xs">
                        ({item.pair})
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-end">
                  <Link href={`/trade/${item.symbol.replace("/", "_")}`}>
                    <IconButton color="contrast" variant="pastel" size="sm">
                      <Icon icon="akar-icons:arrow-right" width={16} />
                    </IconButton>
                  </Link>
                </td>
              </tr>
            ))}
            {pagination.total === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center">
                  <div className="py-32">
                    <Icon
                      icon="arcticons:samsung-finder"
                      className="mx-auto h-20 w-20 text-muted-400"
                    />
                    <h3 className="mb-2 font-sans text-xl text-muted-700 dark:text-muted-200">
                      {t("Nothing found")}
                    </h3>
                    <p className="mx-auto max-w-[280px] font-sans text-md text-muted-400">
                      {t(
                        "Sorry, looks like we couldn't find any matching records. Try different search terms."
                      )}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="hidden items-center gap-2 rounded-xl border border-muted-200 bg-white py-1 pe-3 ps-1 dark:border-muted-800 dark:bg-muted-950 md:flex">
            <Select
              color="contrast"
              value={pagination.perPage.toString()}
              onChange={(e) => {
                setView(+e.target.value);
              }}
              options={["5", "10", "25", "50", "100"]}
            />
            <p className="whitespace-nowrap font-sans text-md text-muted-400">
              {t("Per page")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end divide-x divide-muted-300 dark:divide-muted-800">
          <div className="flex items-center px-6">
            <button
              type="button"
              onClick={() => changePage(1)}
              className="cursor-pointer text-md text-muted-400 underline-offset-4 hover:text-primary-500 hover:underline"
            >
              <span>{t("First")}</span>
            </button>
            <span className="cursor-pointer px-2 text-md text-muted-400">
              ·
            </span>
            <button
              type="button"
              onClick={() => changePage(pagination.lastPage)}
              className="cursor-pointer text-md text-muted-400 underline-offset-4 hover:text-primary-500 hover:underline"
            >
              <span>{t("Last")}</span>
            </button>
          </div>
          <div className="flex items-center justify-end ps-6">
            <div className="flex items-center gap-1 rounded-full border border-muted-200 bg-white p-1 dark:border-muted-800 dark:bg-muted-950">
              <button
                type="button"
                onClick={() => changePage(currentPage - 1)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-muted-500 transition-all duration-300 hover:bg-muted-100 hover:text-muted-600 dark:hover:bg-muted-800 dark:hover:text-muted-100"
              >
                <Icon width={16} height={16} icon="lucide:chevron-left" />
              </button>
              {pages.map((page, i) => (
                <button
                  type="button"
                  key={i}
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none  p-0 transition-all duration-300 ${
                    currentPage == page
                      ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20"
                      : "bg-transparent text-muted-500 hover:bg-muted-100 hover:text-muted-600 dark:hover:bg-muted-800 dark:hover:text-muted-100"
                  }`}
                  onClick={() => changePage(page)}
                >
                  <span className="text-[.9rem]">{page}</span>
                </button>
              ))}
              <button
                onClick={() => changePage(currentPage + 1)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-muted-500 transition-all duration-300 hover:bg-muted-100 hover:text-muted-600 dark:hover:bg-muted-800 dark:hover:text-muted-100"
              >
                <Icon width={16} height={16} icon="lucide:chevron-right" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
const Markets = memo(MarketsBase);
export default Markets;
