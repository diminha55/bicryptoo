// /server/api/finance/transfer/index.post.ts

import { models, sequelize } from "@b/db";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { createError } from "@b/utils/error";

export const metadata: OperationObject = {
  summary: "Performs a transfer transaction",
  description:
    "Initiates a transfer transaction for the currently authenticated user",
  operationId: "createTransfer",
  tags: ["Finance", "Transfer"],
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            fromType: {
              type: "string",
              description: "The type of wallet to transfer from",
            },
            toType: {
              type: "string",
              description: "The type of wallet to transfer to",
            },
            fromCurrency: {
              type: "string",
              description: "The currency to transfer from",
            },
            toCurrency: {
              type: "string",
              description: "The currency to transfer to",
            },
            amount: {
              type: "number",
              description: "Amount to transfer",
            },
          },
          required: [
            "fromType",
            "toType",
            "fromCurrency",
            "toCurrency",
            "amount",
          ],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Transfer transaction initiated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Success message",
              },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Withdraw Method"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { user, body } = data;
  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const { fromType, toType, fromCurrency, toCurrency, amount } = body;

  const userPk = await models.user.findByPk(user.id);
  if (!userPk)
    throw createError({ statusCode: 404, message: "User not found" });

  const fromWallet = await models.wallet.findOne({
    where: { userId: user.id, currency: fromCurrency, type: fromType },
  });
  if (!fromWallet)
    throw createError({ statusCode: 404, message: "Wallet not found" });

  let toWallet: any = null;

  toWallet = await models.wallet.findOne({
    where: { userId: user.id, currency: toCurrency, type: toType },
  });

  if (!toWallet) {
    toWallet = await models.wallet.create({
      userId: user.id,
      currency: toCurrency,
      type: toType,
      status: true,
    });
  }

  const parsedAmount = parseFloat(amount);
  if (fromWallet.balance < parsedAmount)
    throw createError(400, "Insufficient balance");

  let fromCurrencyData, toCurrencyData;
  switch (fromType) {
    case "FIAT":
      fromCurrencyData = await models.currency.findOne({
        where: { id: fromCurrency },
      });
      break;
    case "SPOT":
      fromCurrencyData = await models.exchangeCurrency.findOne({
        where: { currency: fromCurrency },
      });
      break;
    case "ECO":
      fromCurrencyData = await models.ecosystemToken.findOne({
        where: { currency: fromCurrency },
      });
      break;
  }

  if (!fromCurrencyData) throw createError(400, "Invalid wallet type");

  const newFromBalance = parseFloat(
    (fromWallet.balance - parsedAmount).toFixed(
      fromCurrencyData.precision || fromType === "FIAT" ? 2 : 8
    )
  );
  const transaction = await sequelize.transaction(async (t) => {
    await fromWallet.update({ balance: newFromBalance }, { transaction: t });

    const fromTrx = await models.transaction.create(
      {
        userId: user.id,
        walletId: fromWallet.id,
        type: "OUTGOING_TRANSFER",
        amount: parsedAmount,
        fee: 0,
        status: "PENDING",
        metadata: JSON.stringify({
          fromCurrency,
          toCurrency,
          toWallet: toWallet.id,
        }),
        description: `Transfer to ${toType} wallet`,
      },
      { transaction: t }
    );

    const toTrx = await models.transaction.create(
      {
        userId: user.id,
        walletId: toWallet.id,
        type: "INCOMING_TRANSFER",
        amount: parsedAmount,
        fee: 0,
        status: "PENDING",
        metadata: JSON.stringify({
          fromCurrency,
          toCurrency,
          fromWallet: fromWallet.id,
        }),
        description: `Transfer from ${fromType} wallet`,
      },
      { transaction: t }
    );

    return { fromTrx, toTrx };
  });

  // try {
  //   await sendOutgoingTransferEmail(
  //     user,
  //     toUser,
  //     wallet,
  //     amount,
  //     response.fromTransfer.id
  //   );
  //   await sendIncomingTransferEmail(
  //     toUser,
  //     user,
  //     response.toWallet,
  //     amount,
  //     response.toTransfer.id
  //   );
  // } catch (error) {
  //   console.log("Error sending transfer email: ", error);
  // }

  return {
    fromTrx: transaction.fromTrx,
    toTrx: transaction.toTrx,
    fromType,
    toType,
    fromCurrency,
    toCurrency,
    fromBalance: newFromBalance,
  };
};
