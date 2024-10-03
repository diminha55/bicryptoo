// /api/admin/apiKeys/structure.get.ts

import { structureSchema } from "@b/utils/constants";

export const metadata = {
  summary: "Get form structure for API Keys",
  operationId: "getAPIKeyStructure",
  tags: ["Admin", "API Keys"],
  responses: {
    200: {
      description: "Form structure for managing API Keys",
      content: structureSchema,
    },
  },
  permission: "Access API Key Management",
};

export const apiKeyStructure = async () => {
  const id = {
    type: "input",
    label: "ID",
    name: "id",
    placeholder: "Automatically generated",
    readOnly: true,
  };

  const userId = {
    type: "input",
    label: "User",
    name: "userId",
    placeholder: "Enter the user ID",
    icon: "lets-icons:user-duotone",
  };

  const key = {
    type: "input",
    label: "API Key",
    name: "key",
    placeholder: "Enter the API key",
    readOnly: true,
  };

  return {
    id,
    userId,
    key,
  };
};

export default async (): Promise<object> => {
  const { id, userId, key } = await apiKeyStructure();

  const apiKeyInformation = {
    type: "component",
    name: "API Key Information",
    filepath: "APIKeyInfo",
    props: {
      id,
      userId,
      key,
    },
  };

  return {
    get: [apiKeyInformation],
    set: [
      // API keys are generally not editable, only creatable and deletable.
      // You might want to allow changes to the user association, but this is uncommon.
    ],
  };
};
