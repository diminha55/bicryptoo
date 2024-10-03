// /server/api/wallets/transfer.post.ts

import {
  sendIncomingTransferEmail,
  sendOutgoingTransferEmail,
} from "@b/utils/emails";
import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Transfers funds from one wallet to another",
  operationId: "transferFunds",
  tags: ["Finance", "Transfer"],
  description: "Transfers funds from one wallet to another",
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            currency: {
              type: "string",
              description: "Currency of the wallet",
            },
            type: {
              type: "string",
              description: "Type of the wallet",
            },
            amount: {
              type: "number",
              description: "Amount to transfer",
            },
            to: {
              type: "string",
              description: "ID of the wallet to transfer to",
            },
          },
          required: ["currency", "type", "amount", "to"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Funds transferred successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              status: {
                type: "boolean",
                description: "Indicates if the request was successful",
              },
              statusCode: {
                type: "number",
                description: "HTTP status code",
                example: 200,
              },
              data: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "ID of the transaction",
                  },
                  userId: {
                    type: "string",
                    description: "ID of the user who initiated the transfer",
                  },
                  walletId: {
                    type: "string",
                    description:
                      "ID of the wallet the transfer was initiated from",
                  },
                  type: {
                    type: "string",
                    description: "Type of the transaction",
                  },
                  status: {
                    type: "string",
                    description: "Status of the transaction",
                  },
                  amount: {
                    type: "number",
                    description: "Amount of the transfer",
                  },
                  fee: {
                    type: "number",
                    description: "Fee of the transfer",
                  },
                  description: {
                    type: "string",
                    description: "Description of the transfer",
                  },
                  createdAt: {
                    type: "string",
                    format: "date-time",
                    description: "Date and time the transfer was initiated",
                  },
                  updatedAt: {
                    type: "string",
                    format: "date-time",
                    description: "Date and time the transfer was last updated",
                  },
                },
              },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Wallet"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  if (!data.user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });
  return transferFunds(
    data.user.id,
    data.body.currency,
    data.body.type,
    data.body.amount,
    data.body.to
  );
};

export async function transferFunds(
  userId: string,
  currency: string,
  type: WalletType,
  amount: number,
  to: string
): Promise<Transaction> {
  const user = (await models.user.findOne({
    where: { id: userId },
  })) as unknown as User;

  if (!user) {
    throw new Error("User not found");
  }

  const toUser = (await models.user.findOne({
    where: { id: to },
  })) as unknown as User;

  if (!toUser) {
    throw new Error("Recipient user not found");
  }

  const wallet = (await models.wallet.findOne({
    where: { userId: userId, currency: currency, type: type },
  })) as unknown as Wallet;

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  if (wallet.balance < amount) {
    throw new Error("Insufficient funds");
  }

  const response = await sequelize.transaction(async (transaction) => {
    const [toWallet, created] = await models.wallet.findOrCreate({
      where: {
        userId: toUser.id,
        currency: currency,
        type: type,
      },
      defaults: {
        userId: toUser.id,
        currency: currency,
        balance: 0,
        type: type,
        address: wallet.address,
      },
    });

    if (!created) {
      await models.wallet.update(
        { address: wallet.address },
        {
          where: { id: toWallet.id },
        }
      );
    }

    await models.wallet.update(
      { balance: wallet.balance - amount },
      {
        where: { id: wallet.id },
      }
    );

    await models.wallet.update(
      { balance: toWallet.balance + amount },
      {
        where: { id: toWallet.id },
      }
    );

    const fromTransfer = (await models.transaction.create({
      userId: userId,
      walletId: wallet.id,
      type: "OUTGOING_TRANSFER",
      amount: amount,
      fee: 0,
      status: "COMPLETED",
      description: `${amount} ${currency} transfer to ${toUser.firstName} ${toUser.lastName} ${toWallet.currency} wallet`,
    })) as unknown as Transaction;

    const toTransfer = (await models.transaction.create({
      userId: toUser.id,
      walletId: toWallet.id,
      type: "INCOMING_TRANSFER",
      amount: amount,
      fee: 0,
      status: "COMPLETED",
      description: `${amount} ${currency} transfer from ${user.firstName} ${user.lastName} ${wallet.currency} wallet`,
    })) as unknown as Transaction;

    return {
      toWallet: toWallet,
      fromTransfer: fromTransfer,
      toTransfer: toTransfer,
    };
  });

  if (!response) {
    throw new Error("Error transferring funds");
  }

  try {
    await sendOutgoingTransferEmail(
      user,
      toUser,
      wallet,
      amount,
      response.fromTransfer.id
    );
    await sendIncomingTransferEmail(
      toUser,
      user,
      response.toWallet,
      amount,
      response.toTransfer.id
    );
  } catch (error) {
    console.log("Error sending transfer email: ", error);
  }

  return response.fromTransfer;
}
