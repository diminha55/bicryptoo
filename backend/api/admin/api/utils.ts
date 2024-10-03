import { baseDateTimeSchema, baseStringSchema } from "@b/utils/schema";

const id = baseStringSchema("ID of the API key");
const userId = baseStringSchema("User ID associated with the API key");
const key = baseStringSchema("The API key string");
const createdAt = baseDateTimeSchema("Creation date of the API key");
const updatedAt = baseDateTimeSchema("Last update date of the API key", true);
const deletedAt = baseDateTimeSchema("Deletion date of the API key", true);

export const apiKeySchema = {
  id: id,
  userId: userId,
  key: key,
  createdAt: createdAt,
  updatedAt: updatedAt,
  deletedAt: deletedAt,
};

export const apiKeyUpdateSchema = {
  type: "object",
  properties: {
    key: key,
  },
  required: ["key"],
};
