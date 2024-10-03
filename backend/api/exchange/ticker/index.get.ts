// /server/api/exchange/markets/tickers/all.get.ts

import ExchangeManager from "@b/utils/exchange";
import { RedisSingleton } from "@b/utils/redis";

const redis = RedisSingleton.getInstance();

import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { baseTickerSchema } from "../utils";

export const metadata: OperationObject = {
  summary: "Get All Market Tickers",
  operationId: "getAllMarketTickers",
  tags: ["Exchange", "Markets"],
  description: "Retrieves ticker information for all available market pairs.",
  responses: {
    200: {
      description: "All market tickers information",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: baseTickerSchema,
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Ticker"),
    500: serverErrorResponse,
  },
};

interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  close: number;
  last: number;
  percentage: number;
  baseVolume: number;
  quoteVolume: number;
}

interface Tickers {
  [symbol: string]: Ticker;
}

export default async () => {
  // let marketsCache: any = [];

  // try {
  //   const cachedMarkets = await redis.get("exchangeMarkets");
  //   if (cachedMarkets) {
  //     marketsCache = JSON.parse(cachedMarkets);
  //   } else {
  //     await cacheExchangeMarkets();
  //     marketsCache = await getMarkets();
  //   }
  // } catch (err) {
  //   console.error("Redis error:", err);
  // }

  // if (marketsCache.length === 0) {
  //   console.error("No market data available");
  //   return {};
  // }

  const exchange = await ExchangeManager.startExchange();
  // const marketSymbols = marketsCache.map((market: any) => market.symbol);

  // TODO: Implement batch fetching for tickers
  // const tickers: Tickers = await exchange.fetchTickers([
  //   "ETH/USDT",
  //   "BNB/USDT",
  //   "EOS/USDT",
  //   "ADA/USDT",
  //   "ETH/BTC",
  //   "LTC/BTC",
  //   "BNB/BTC",
  //   "GAS/BTC",
  //   "QTUM/BTC",
  //   "KNC/BTC",
  //   "LINK/BTC",
  //   "MTL/BTC",
  //   "EOS/BTC",
  //   "ETC/BTC",
  //   "ZEC/BTC",
  //   "BNT/BTC",
  //   "DASH/BTC",
  //   "ENJ/BTC",
  //   "LSK/BTC",
  //   "ADA/BTC",
  //   "WAVES/BTC",
  //   "RLC/BTC",
  //   "ZEN/BTC",
  //   "THETA/BTC",
  //   "DCR/BTC",
  //   "MATIC/BTC",
  //   "ATOM/BTC",
  //   "PHB/BTC",
  //   "BAND/BTC",
  //   "XTZ/BTC",
  //   "STX/BTC",
  //   "KAVA/BTC",
  //   "BCH/BTC",
  //   "SOL/BTC",
  //   "COMP/BTC",
  //   "SXP/BTC",
  //   "SNX/BTC",
  //   "MKR/BTC",
  //   "RUNE/BTC",
  //   "AVA/BTC",
  //   "BAL/BTC",
  //   "YFI/BTC",
  //   "CRV/BTC",
  //   "NMR/BTC",
  //   "DOT/BTC",
  // ]);
  // console.log("🚀 ~ tickers:", tickers);

  const tickers = {
    "ETH/USDT": {
      symbol: "ETH/USDT",
      timestamp: 1714547756633,
      datetime: "2024-05-01T07:15:56.633Z",
      high: 3173.42,
      low: 2880,
      bid: 2897.59,
      bidVolume: 6.6949,
      ask: 2897.65,
      askVolume: 0.0019,
      vwap: 3005.29531633,
      open: 3172.01,
      close: 2897.6,
      last: 2897.6,
      previousClose: 3172.01,
      change: -274.41,
      percentage: -8.651,
      average: 3034.805,
      baseVolume: 595565.418,
      quoteVolume: 1789849961.283236,
      info: {
        symbol: "ETHUSDT",
        priceChange: "-274.41000000",
        priceChangePercent: "-8.651",
        weightedAvgPrice: "3005.29531633",
        prevClosePrice: "3172.01000000",
        lastPrice: "2897.60000000",
        lastQty: "0.17500000",
        bidPrice: "2897.59000000",
        bidQty: "6.69490000",
        askPrice: "2897.65000000",
        askQty: "0.00190000",
        openPrice: "3172.01000000",
        highPrice: "3173.42000000",
        lowPrice: "2880.00000000",
        volume: "595565.41800000",
        quoteVolume: "1789849961.28323600",
        openTime: "1714461356633",
        closeTime: "1714547756633",
        firstId: "1409565447",
        lastId: "1410928622",
        count: "1363176",
      },
    },
    "BNB/USDT": {
      symbol: "BNB/USDT",
      timestamp: 1714547756633,
      datetime: "2024-05-01T07:15:56.633Z",
      high: 3173.42,
      low: 2880,
      bid: 2897.59,
      bidVolume: 6.6949,
      ask: 2897.65,
      askVolume: 0.0019,
      vwap: 3005.29531633,
      open: 3172.01,
      close: 2897.6,
      last: 2897.6,
      previousClose: 3172.01,
      change: -274.41,
      percentage: -8.651,
      average: 3034.805,
      baseVolume: 595565.418,
      quoteVolume: 1789849961.283236,
      info: {
        symbol: "BNBUSDT",
        priceChange: "-274.41000000",
        priceChangePercent: "-8.651",
        weightedAvgPrice: "3005.29531633",
        prevClosePrice: "3172.01000000",
        lastPrice: "2897.60000000",
        lastQty: "0.17500000",
        bidPrice: "2897.59000000",
        bidQty: "6.69490000",
        askPrice: "2897.65000000",
        askQty: "0.00190000",
        openPrice: "3172.01000000",
        highPrice: "3173.42000000",
        lowPrice: "2880.00000000",
        volume: "595565.41800000",
        quoteVolume: "1789849961.28323600",
        openTime: "1714461356633",
        closeTime: "1714547756633",
        firstId: "1409565447",
        lastId: "1410928622",
        count: "1363176",
      },
    },
  };

  // Optimized transformation without an explicit loop
  return Object.entries(tickers).reduce(
    (
      acc,
      [symbol, { bid, ask, close, last, percentage, baseVolume, quoteVolume }]
    ) => {
      acc[symbol] = {
        symbol,
        bid,
        ask,
        close,
        last,
        change: percentage,
        baseVolume,
        quoteVolume,
      };
      return acc;
    },
    {}
  );
};
