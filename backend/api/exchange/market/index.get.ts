// /server/api/exchange/markets/index.get.ts

import { baseMarketSchema } from "./utils";
import { models } from "@b/db";
import { RedisSingleton } from "@b/utils/redis";

const redis = RedisSingleton.getInstance();

import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "List Exchange Markets",
  operationId: "listMarkets",
  tags: ["Exchange", "Markets"],
  description: "Retrieves a list of all available markets.",
  parameters: [
    {
      name: "eco",
      in: "query",
      required: true,
      description: "include eco",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "A list of markets",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: baseMarketSchema,
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Market"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { query } = data;
  const { eco } = query;
  const exchangeMarkets = await models.exchangeMarket.findAll({
    where: {
      status: true,
    },
  });

  let ecosystemMarkets = [] as any;
  if (eco === "true") {
    ecosystemMarkets = await models.ecosystemMarket.findAll({
      where: {
        status: true,
      },
    });
  }

  const markets = [
    ...exchangeMarkets.map((market) => ({
      ...market.get({ plain: true }),
      isEco: false,
    })),
    ...ecosystemMarkets.map((market) => ({
      ...market.get({ plain: true }),
      isEco: true,
    })),
  ];

  return markets;
};
