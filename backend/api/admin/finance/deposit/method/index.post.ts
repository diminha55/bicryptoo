// /api/admin/deposit/methods/store.post.ts

import { storeRecord, storeRecordResponses } from "@b/utils/query";
import { DepositMethodSchema, depositMethodUpdateSchema } from "./utils";

export const metadata = {
  summary: "Stores a new deposit method",
  operationId: "storeDepositMethod",
  tags: ["Admin", "Deposit Methods"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: depositMethodUpdateSchema,
      },
    },
  },
  responses: storeRecordResponses(DepositMethodSchema, "Deposit Method"),
  requiresAuth: true,
  permission: "Access Deposit Method Management",
};

export default async (data: Handler) => {
  const { body } = data;
  const {
    title,
    instructions,
    image,
    fixedFee,
    percentageFee,
    minAmount,
    maxAmount,
    customFields,
    status,
  } = body;

  // Parse customFields if it is a string
  let parsedCustomFields = customFields;
  if (typeof customFields === "string") {
    try {
      parsedCustomFields = JSON.parse(customFields);
    } catch (error) {
      throw new Error("Invalid JSON format for customFields");
    }
  }

  // Ensure customFields is an array or null
  if (parsedCustomFields === null) {
    parsedCustomFields = [];
  }

  return await storeRecord({
    model: "depositMethod",
    data: {
      title,
      instructions,
      image,
      fixedFee,
      percentageFee,
      minAmount,
      maxAmount,
      customFields: parsedCustomFields,
      status,
    },
  });
};
