// /server/api/exchange/chart/historical.get.ts
import ExchangeManager from "@b/utils/exchange";

import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { baseChartDataPointSchema } from "./utils";

export const metadata: OperationObject = {
  summary: "Get Historical Chart Data",
  operationId: "getHistoricalChartData",
  tags: ["Chart", "Historical"],
  description: "Retrieves historical chart data for the authenticated user.",
  parameters: [
    {
      name: "symbol",
      in: "query",
      description: "Symbol to retrieve data for.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "interval",
      in: "query",
      description: "Interval to retrieve data for.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "from",
      in: "query",
      description: "Start timestamp to retrieve data from.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "to",
      in: "query",
      description: "End timestamp to retrieve data from.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "duration",
      in: "query",
      description: "Duration to retrieve data for.",
      required: true,
      schema: { type: "number" },
    },
  ],
  responses: {
    200: {
      description: "Historical chart data retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: baseChartDataPointSchema,
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Chart"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { query } = data;
  return getHistoricalOHLCV(
    query.symbol,
    query.interval,
    Number(query.from),
    Number(query.to),
    Number(query.duration)
  );
};

export async function getHistoricalOHLCV(
  symbol: any,
  interval: any,
  from: number,
  to: number,
  duration: number
) {
  let since, max;
  const exchange = await (ExchangeManager as any).startExchange();
  const provider = await (ExchangeManager as any).provider;

  switch (provider) {
    case "binance":
    case "okx":
      since = to - duration / 3;
      max = 500;
      break;
    case "kucoin":
      since = to - duration;
      max = 1500;
      break;
    case "bitget":
      since = to - duration / 1.5;
      max = 1000;
      break;
    default:
      since = to - duration;
      max = 1000;
      break;
  }

  try {
    const data = await exchange.fetchOHLCV(symbol, interval, since, max);

    return data;
  } catch (e) {
    if (e.constructor.name === "419") {
      const data = await exchange.fetchOHLCV(symbol, interval, since);
      return data;
    }
    throw new Error(e as any);
  }
}
