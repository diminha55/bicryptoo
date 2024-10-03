import ExchangeManager from "@b/utils/exchange";
import { hasClients, sendMessageToRoute } from "@b/handler/Websocket";
import { models } from "@b/db";

export const metadata = {};

let accumulatedTickers = {};
let tickerInterval: NodeJS.Timeout | null = null;

function startTickerInterval() {
  if (!tickerInterval) {
    tickerInterval = setInterval(flushTickers, 1000);
  }
}

function stopTickerInterval() {
  if (tickerInterval) {
    clearInterval(tickerInterval);
    tickerInterval = null;
  }
}

function flushTickers() {
  if (Object.keys(accumulatedTickers).length > 0) {
    const route = "/api/exchange/ticker";
    const streamKey = "tickers";
    sendMessageToRoute(
      route,
      { type: "tickers" },
      { stream: streamKey, data: accumulatedTickers }
    );
    accumulatedTickers = {};
  }
}

async function fetchTickersWithDelay(exchange, symbolsInDB) {
  const allTickers = await exchange.fetchTickers(symbolsInDB);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return allTickers;
}

async function fetchTickersWithRetries(exchange, symbolsInDB) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchTickersWithDelay(exchange, symbolsInDB);
    } catch (error) {
      console.error(
        `Error fetching tickers on attempt ${attempt}:`,
        error.message
      );
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }
}

async function watchTickersWithRetries(exchange, symbolsInDB) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await exchange.watchTickers(symbolsInDB);
    } catch (error) {
      console.error(
        `Error watching tickers on attempt ${attempt}:`,
        error.message
      );
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }
}

const initialTickersFetch = async (exchange, symbolsInDB) => {
  try {
    return await exchange.fetchTickers(symbolsInDB);
  } catch (error) {
    console.error("Error fetching initial tickers:", error.message);
    return {};
  }
};

export default async (data: Handler, message) => {
  if (typeof message === "string") {
    message = JSON.parse(message);
  }

  const exchange = await ExchangeManager.startExchange();
  if (!exchange) return;
  const provider = await ExchangeManager.getProvider();

  const markets = await models.exchangeMarket.findAll({
    where: {
      status: true,
    },
    attributes: ["currency", "pair"],
    raw: true,
  });

  const symbolsInDB = markets.map(
    (market) => `${market.currency}/${market.pair}`
  );

  try {
    const initialTickers = await initialTickersFetch(exchange, symbolsInDB);
    const filteredInitialTickers = processTickers(initialTickers, symbolsInDB);

    sendMessageToRoute(
      "/api/exchange/ticker",
      { type: "tickers" },
      {
        stream: "tickers",
        data: filteredInitialTickers,
      }
    );
  } catch (error) {
    console.error("Error fetching initial tickers:", error.message);
  }

  while (hasClients("/api/exchange/ticker") && symbolsInDB.length > 0) {
    try {
      let allTickers;
      if (exchange && exchange.has["watchTickers"] && provider !== "kucoin") {
        allTickers = await watchTickersWithRetries(exchange, symbolsInDB);
        startTickerInterval();
      } else {
        allTickers = await fetchTickersWithRetries(exchange, symbolsInDB);
        stopTickerInterval();
      }

      const filteredTickers = processTickers(allTickers, symbolsInDB);

      if (exchange.has["watchTickers"] && provider !== "kucoin") {
        Object.assign(accumulatedTickers, filteredTickers);
      } else {
        sendMessageToRoute(
          "/api/exchange/ticker",
          { type: "tickers" },
          {
            stream: "tickers",
            data: filteredTickers,
          }
        );
      }
    } catch (error) {
      console.error("Error fetching tickers:", error.message);
    }
  }
};

function processTickers(allTickers, symbolsInDB) {
  return symbolsInDB.reduce((acc, symbol) => {
    if (allTickers[symbol]) {
      acc[symbol] = {
        last: allTickers[symbol].last,
        baseVolume: allTickers[symbol].baseVolume,
        quoteVolume: allTickers[symbol].quoteVolume,
        change: allTickers[symbol].percentage,
      };
    }
    return acc;
  }, {});
}
