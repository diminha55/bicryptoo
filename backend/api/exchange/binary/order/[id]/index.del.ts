// /server/api/exchange/binary/orders/index.del.ts

import { models } from "@b/db";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { orderIntervals } from "../index.post";

export const metadata: OperationObject = {
  summary: "Cancel Binary Order",
  operationId: "cancelBinaryOrder",
  tags: ["Binary", "Orders"],
  description: "Cancels a binary order for the authenticated user.",
  parameters: [
    {
      name: "id",
      in: "path",
      description: "ID of the binary order to cancel.",
      required: true,
      schema: { type: "string" },
    },
  ],
  requestBody: {
    description: "Cancellation percentage data.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            percentage: { type: "number" },
          },
        },
      },
    },
    required: false,
  },
  responses: {
    200: {
      description: "Binary order cancelled",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Binary Order"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { id } = data.params;
  const { percentage } = data.body;
  const order = await models.binaryOrder.findOne({
    where: {
      id,
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  let wallet, balance, transaction;

  const isDemo = order.isDemo || false;
  if (!isDemo) {
    transaction = await models.transaction.findOne({
      where: {
        referenceId: order.id,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    wallet = await models.wallet.findOne({
      where: {
        id: transaction.walletId,
      },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    balance = wallet.balance + order.amount;

    if (percentage !== undefined && percentage < 0) {
      const cutAmount = order.amount * (Math.abs(percentage) / 100);
      balance = wallet.balance + order.amount - cutAmount;
    }

    await models.wallet.update(
      {
        balance: balance,
      },
      {
        where: {
          id: wallet.id,
        },
      }
    );

    await models.transaction.destroy({
      where: {
        id: transaction.id,
      },
      force: true,
    });
  }

  // Clear the order from monitoring
  if (orderIntervals.has(id)) {
    clearTimeout(orderIntervals.get(id));
    orderIntervals.delete(id);
  }

  await models.binaryOrder.destroy({
    where: {
      id,
    },
    force: true,
  });

  return { message: "Order cancelled" };
};
