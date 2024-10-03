// /api/admin/transactions/[id]/update.put.ts
import { updateRecord, updateRecordResponses } from "@b/utils/query";
import { transactionUpdateSchema } from "../../../../finance/transaction/utils";

export const metadata = {
  summary: "Updates an existing transaction",
  operationId: "updateTransaction",
  tags: ["Admin", "Wallets", "Transactions"],
  parameters: [
    {
      index: 0,
      name: "id",
      in: "path",
      description: "The ID of the transaction to update",
      required: true,
      schema: {
        type: "string",
      },
    },
  ],
  requestBody: {
    required: true,
    description: "Updated data for the transaction",
    content: {
      "application/json": {
        schema: transactionUpdateSchema,
      },
    },
  },
  responses: updateRecordResponses("Transaction"),
  requiresAuth: true,
  permission: "Access Transaction Management",
};

export default async (data: Handler) => {
  const { body, params } = data;
  const { id } = params;
  const { type, status, amount, fee, description, referenceId } = body;

  return await updateRecord("transaction", id, {
    type,
    status,
    amount,
    fee,
    description,
    referenceId,
  });
};
