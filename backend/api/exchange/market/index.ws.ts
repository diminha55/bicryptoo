import ExchangeManager from "@b/utils/exchange";
import { hasClients, sendMessageToRoute } from "@b/handler/Websocket";

export const metadata = {};

const accumulatedBuffer = {};
let bufferInterval;

function flushBuffer() {
  Object.entries(accumulatedBuffer).forEach(([streamKey, data]: any) => {
    if (Object.keys(data).length > 0) {
      const route = `/api/exchange/market`;
      const payload = { ...data.payload, symbol: data.symbol };
      sendMessageToRoute(route, payload, {
        stream: streamKey,
        data: data.msg,
      });
      delete accumulatedBuffer[streamKey];
    }
  });
}

export default async (data: Handler, message) => {
  if (typeof message === "string") {
    message = JSON.parse(message);
  }

  const { symbol, type, interval, limit } = message.payload;
  const exchange = await ExchangeManager.startExchange();
  if (!exchange) return;

  const typeMap = {
    ticker: "watchTicker",
    ohlcv: "watchOHLCV",
    trades: "watchTrades",
    orderbook: "watchOrderBook",
  };

  if (!exchange.has[typeMap[type]]) {
    console.info(`Endpoint ${type} is not available`);
    return;
  }

  if (!bufferInterval) {
    bufferInterval = setInterval(flushBuffer, 500);
  }

  let streamKey = `${type}`;
  if (interval) streamKey += `:${interval}`;
  if (limit) streamKey += `:${limit}`;

  const fetchData = {
    ticker: async () => ({
      msg: await exchange.watchTicker(symbol),
      payload: {
        type,
      },
    }),
    ohlcv: async () => ({
      msg: await exchange.watchOHLCV(
        symbol,
        interval,
        undefined,
        Number(limit) || 1000
      ),
      payload: {
        type,
        interval,
        limit,
      },
    }),
    trades: async () => ({
      msg: await exchange.watchTrades(
        symbol,
        undefined,
        limit ? Number(limit) : 20
      ),
      payload: {
        type,
        limit,
      },
    }),
    orderbook: async () => ({
      msg: await exchange.watchOrderBook(symbol, limit ? Number(limit) : 100),
      payload: {
        type,
        limit,
      },
    }),
  };

  if (!fetchData[type]) {
    console.info(`Unsupported type: ${type}`);
    return;
  }

  while (hasClients(`/api/exchange/market`)) {
    const { msg, payload } = await fetchData[type]();
    accumulatedBuffer[streamKey] = { symbol, msg, payload };

    if (!hasClients(`/api/exchange/market`)) {
      clearInterval(bufferInterval);
      bufferInterval = null;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};
