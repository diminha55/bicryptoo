// /api/admin/exchange/currencies/structure.get.ts
import { structureSchema } from "@b/utils/constants";

export const metadata = {
  summary: "Get form structure for exchange currencies",
  operationId: "getExchangeCurrenciesStructure",
  tags: ["Admin", "Exchange Currencies"],
  responses: {
    200: {
      description: "Form structure for exchange currencies",
      content: structureSchema,
    },
  },
  permission: "Access Spot Currency Management"
};

export const currencyStructure = () => {
  const currency = {
    type: "input",
    label: "Currency Code",
    name: "currency",
    placeholder: "USD",
  };

  const name = {
    type: "input",
    label: "Currency Name",
    name: "name",
    placeholder: "US Dollar",
  };

  const precision = {
    type: "input",
    label: "Precision",
    name: "precision",
    placeholder: "2",
    ts: "number",
  };

  const price = {
    type: "input",
    label: "Exchange Rate",
    name: "price",
    placeholder: "1.00",
    ts: "number",
  };

  const chains = {
    type: "json",
    label: "Supported Chains",
    name: "chains",
    placeholder: '{"ethereum": "0x..."}',
  };

  const status = {
    type: "select",
    label: "Status",
    name: "status",
    options: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],

    ts: "boolean",
  };

  return {
    currency,
    name,
    precision,
    price,
    chains,
    status,
  };
};

export default async (): Promise<object> => {
  const { currency, name, precision, price, chains, status } =
    currencyStructure();

  return {
    get: {
      currencyInfo: [currency, name, precision, price, chains],
      statusInfo: [status],
    },
    set: [name, chains],
  };
};

// model exchangeCurrency {
//   id        String  @id @unique @default(uuid())
//   currency  String  @unique
//   name      String  @db.VarChar(255)
//   precision Float   @default(8)
//   price     Float?  @default(0)
//   status    Boolean @default(true)
//   chains    Json?   @db.Json
// }
