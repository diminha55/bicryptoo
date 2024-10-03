import { baseNumberSchema } from "@b/utils/schema";

export const baseChartDataPointSchema = {
  timestamp: baseNumberSchema("Timestamp for the data point"),
  open: baseNumberSchema("Opening price for the data interval"),
  high: baseNumberSchema("Highest price during the data interval"),
  low: baseNumberSchema("Lowest price during the data interval"),
  close: baseNumberSchema("Closing price for the data interval"),
  volume: baseNumberSchema("Volume of trades during the data interval"),
};
