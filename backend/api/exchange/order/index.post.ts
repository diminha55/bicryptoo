// /server/api/exchange/orders/store.post.ts

import { models, sequelize } from "@b/db";
import { sanitizeErrorMessage } from "../utils";
import ExchangeManager from "@b/utils/exchange";
import { createRecordResponses } from "@b/utils/query";
import { getWallet } from "@b/api/finance/wallet/utils";
import { addOrderToTrackedOrders, addUserToWatchlist } from "./index.ws";

export const metadata: OperationObject = {
  summary: "Create Order",
  operationId: "createOrder",
  tags: ["Exchange", "Orders"],
  description: "Creates a new order for the authenticated user.",
  requestBody: {
    description: "Order creation data.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            currency: {
              type: "string",
              description: "Currency symbol (e.g., BTC)",
            },
            pair: { type: "string", description: "Pair symbol (e.g., USDT)" },
            type: {
              type: "string",
              description: "Order type (e.g., limit, market)",
            },
            side: { type: "string", description: "Order side (buy or sell)" },
            amount: { type: "number", description: "Order amount" },
            price: {
              type: "number",
              description: "Order price, required for limit orders",
            },
          },
          required: ["currency", "pair", "type", "side", "amount"],
        },
      },
    },
    required: true,
  },
  responses: createRecordResponses("Order"),
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user, body } = data;
  if (!user) {
    throw new Error("User not found");
  }

  try {
    const { currency, pair, amount, price, type, side } = body;

    if (!currency || !pair) {
      throw new Error("Invalid symbol");
    }
    const symbol = `${currency}/${pair}`;

    // Fetch fee rates from metadata or other sources
    const market = (await models.exchangeMarket.findOne({
      where: { currency, pair },
    })) as unknown as ExchangeMarket;

    if (!market) {
      throw new Error("Market data not found");
    }

    if (!market.metadata) {
      throw new Error("Market metadata not found");
    }

    const minAmount = Number(market.metadata?.limits?.amount?.min || 0);
    const minCost = Number(market.metadata?.limits?.cost?.min || 0);

    if (amount < minAmount) {
      throw new Error(`Amount is too low. You need ${minAmount} ${currency}`);
    }

    const precision =
      Number(
        side === "BUY"
          ? market.metadata.precision.amount
          : market.metadata.precision.price
      ) || 8;
    const feeCurrency = side === "BUY" ? currency : pair;
    const feeRate =
      side === "BUY"
        ? Number(market.metadata.taker)
        : Number(market.metadata.maker);

    const feeCalculated = (amount * price * feeRate) / 100;
    const fee = parseFloat(feeCalculated.toFixed(precision));
    const costCalculated = side === "BUY" ? amount * price + fee : amount;
    const cost = parseFloat(costCalculated.toFixed(precision));

    if (cost < minCost) {
      console.log("Cost is too low:", { cost, minCost });
      throw new Error(`Cost is too low. You need ${minCost} ${pair}`);
    }

    let currencyWallet;
    try {
      currencyWallet = await getWallet(user.id, "SPOT", currency);
    } catch (error) {}
    if (!currencyWallet && side === "SELL") {
      throw new Error(`Insufficient balance. You need ${amount} ${currency}`);
    }

    let pairWallet;
    try {
      pairWallet = await getWallet(user.id, "SPOT", pair);
    } catch (error) {}
    if (!pairWallet && side === "BUY") {
      throw new Error(`Insufficient balance. You need ${cost} ${pair}`);
    }

    const exchange = await ExchangeManager.startExchange();

    if (!exchange) {
      throw new Error("Exchange offline");
    }

    let order;
    try {
      order = await exchange.createOrder(
        symbol,
        type.toLowerCase(),
        side.toLowerCase(),
        amount,
        type === "LIMIT" ? price : undefined
      );
    } catch (error) {
      console.log(error);
      const sanitizedErrorMessage = sanitizeErrorMessage(error.message);
      throw new Error(`Failed to create order: ${sanitizedErrorMessage}`);
    }
    if (!order || !order.id) {
      throw new Error("Failed to create order");
    }

    const orderData = await exchange.fetchOrder(order.id, symbol);
    if (!orderData) {
      throw new Error("Failed to fetch order");
    }
    if (side === "BUY") {
      if (!pairWallet) pairWallet = await createWallet(user.id, pair);

      const balance = pairWallet.balance - cost;
      await updateWalletQuery(pairWallet.id, balance);

      if (orderData.status === "closed") {
        if (!currencyWallet)
          currencyWallet = await createWallet(user.id, currency);

        const balance =
          currencyWallet.balance +
          (Number(orderData.amount) - (Number(orderData.fee?.cost) || fee));
        await updateWalletQuery(currencyWallet.id, balance);
      }
    } else {
      if (!currencyWallet)
        currencyWallet = await createWallet(user.id, currency);

      const balance = currencyWallet.balance - amount;
      await updateWalletQuery(currencyWallet.id, balance);

      if (orderData.status === "closed") {
        if (!pairWallet) pairWallet = await createWallet(user.id, pair);

        const balance =
          pairWallet.balance +
          (Number(orderData.cost) - (Number(orderData.fee?.cost) || fee));
        await updateWalletQuery(pairWallet.id, balance);
      }
    }

    const response = (await createOrder(user.id, {
      ...orderData,
      referenceId: order.id,
      feeCurrency: feeCurrency,
      fee: orderData.fee?.cost || fee,
    })) as unknown as ExchangeOrder;

    if (!response) {
      throw new Error("Failed to create order");
    }

    addUserToWatchlist(user.id);
    addOrderToTrackedOrders(user.id, {
      id: response.id, // Include database order id
      status: response.status,
      price: response.price,
      amount: response.amount,
      filled: response.filled,
      remaining: response.remaining,
      timestamp: response.createdAt,
      cost: type === "LIMIT" ? cost : response.cost,
    });

    return {
      message: "Order created successfully",
    };
  } catch (error) {
    const sanitizedErrorMessage = sanitizeErrorMessage(error.message);
    throw new Error(sanitizedErrorMessage);
  }
};

const createWallet = async (userId: string, currency: string) => {
  return await models.wallet.create({
    userId,
    type: "SPOT",
    currency,
    balance: 0,
  });
};

export async function updateWalletQuery(
  id: string,
  balance: number
): Promise<any> {
  await models.wallet.update(
    {
      balance,
    },
    {
      where: {
        id,
      },
    }
  );

  const response = await models.wallet.findOne({
    where: {
      id,
    },
  });

  if (!response) {
    throw new Error("Wallet not found");
  }

  return response.get({ plain: true }) as unknown as Wallet;
}

export async function createOrder(
  userId: string,
  order: any
): Promise<ExchangeOrder> {
  const mappedOrder = mapOrderData(order);

  // Start a transaction for creating an order
  return (await sequelize
    .transaction(async (transaction) => {
      const newOrder = await models.exchangeOrder.create(
        {
          ...mappedOrder,
          userId: userId, // Directly set the foreign key for the user
        },
        { transaction }
      );

      // Assuming you want to return a simplified version of the new order object
      return newOrder.get({ plain: true });
    })
    .catch((error) => {
      console.error("Failed to create order:", error);
      throw error; // Rethrow or handle error as needed
    })) as unknown as ExchangeOrder;
}

const mapOrderData = (order: any) => {
  return {
    referenceId: order.referenceId,
    status: order.status ? order.status.toUpperCase() : undefined,
    symbol: order.symbol,
    type: order.type ? order.type.toUpperCase() : undefined,
    timeInForce: order.timeInForce
      ? order.timeInForce.toUpperCase()
      : undefined,
    side: order.side ? order.side.toUpperCase() : undefined,
    price: Number(order.price),
    average: Number(order.average) || undefined, // Fallback to undefined if not available
    amount: Number(order.amount),
    filled: Number(order.filled),
    remaining: Number(order.remaining),
    cost: Number(order.cost),
    trades: JSON.stringify(order.trades),
    fee: order.fee,
    feeCurrency: order.feeCurrency,
  };
};
