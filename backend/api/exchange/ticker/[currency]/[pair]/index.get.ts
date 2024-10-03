// /server/api/exchange/markets/:currency/:pair/ticker.get.ts

import { baseTickerSchema } from "@b/api/exchange/utils";
import ExchangeManager from "@b/utils/exchange";

import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Get Market Ticker",
  operationId: "getMarketTicker",
  tags: ["Exchange", "Markets"],
  description: "Retrieves ticker information for a specific market pair.",
  parameters: [
    {
      name: "currency",
      in: "path",
      required: true,
      description: "The base currency of the market pair.",
      schema: { type: "string" },
    },
    {
      name: "pair",
      in: "path",
      required: true,
      description: "The quote currency of the market pair.",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "Ticker information",
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

export default async (data: Handler) => {
  const { currency, pair } = data.params;
  try {
    const exchange = await ExchangeManager.startExchange();
    return await exchange.fetchTicker(`${currency}/${pair}`);
  } catch (error) {
    console.error(`Failed to fetch ticker: ${error.message}`);
    throw new Error("Failed to fetch ticker");
  }
};
