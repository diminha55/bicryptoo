import { baseNumberSchema, baseStringSchema } from "@b/utils/schema";

export function sanitizeErrorMessage(errorMessage) {
  // Handle undefined or null inputs explicitly
  if (errorMessage == null) {
    // Customize this message as needed
    return "An unknown error occurred";
  }

  // Convert Error objects to their message string
  if (errorMessage instanceof Error) {
    errorMessage = errorMessage.message;
  }

  // Proceed with sanitization only if errorMessage is a string
  if (typeof errorMessage === "string") {
    const keywordsToHide = ["kucoin", "binance", "okx"];
    let sanitizedMessage = errorMessage;

    keywordsToHide.forEach((keyword) => {
      const regex = new RegExp(keyword, "gi"); // 'gi' for global and case-insensitive match
      sanitizedMessage = sanitizedMessage.replace(regex, "***");
    });

    return sanitizedMessage;
  }

  // Return the input unchanged if it's not a string, as we only sanitize strings
  return errorMessage;
}

export const baseOrderBookEntrySchema = {
  type: "array",
  items: {
    type: "number",
    description: "Order book entry consisting of price and volume",
  },
};

export const baseOrderBookSchema = {
  asks: {
    type: "array",
    items: baseOrderBookEntrySchema,
    description: "Asks are sell orders in the order book",
  },
  bids: {
    type: "array",
    items: baseOrderBookEntrySchema,
    description: "Bids are buy orders in the order book",
  },
};

export const baseTickerSchema = {
  symbol: baseStringSchema("Trading symbol for the market pair"),
  bid: baseNumberSchema("Current highest bid price"),
  ask: baseNumberSchema("Current lowest ask price"),
  close: baseNumberSchema("Last close price"),
  last: baseNumberSchema("Most recent transaction price"),
  change: baseNumberSchema("Price change percentage"),
  baseVolume: baseNumberSchema("Volume of base currency traded"),
  quoteVolume: baseNumberSchema("Volume of quote currency traded"),
};

export const baseWatchlistItemSchema = {
  id: baseStringSchema(
    "Unique identifier for the watchlist item",
    undefined,
    undefined,
    false,
    undefined,
    "uuid"
  ),
  userId: baseStringSchema(
    "User ID associated with the watchlist item",
    undefined,
    undefined,
    false,
    undefined,
    "uuid"
  ),
  symbol: baseStringSchema("Symbol of the watchlist item"),
};
