import ExchangeManager from "@b/utils/exchange";
import { hasClients, sendMessageToRoute } from "@b/handler/Websocket";
import { models } from "@b/db";
import { getWallet } from "@b/api/finance/wallet/utils";
import { updateWalletQuery } from "./index.post";

export const metadata = {};

let trackedOrders = {};
const watchedUserIds = new Set<string>();
let orderInterval: NodeJS.Timeout | null = null;

let lastFetchTime = 0;

function startInterval() {
  if (!orderInterval) {
    orderInterval = setInterval(flushOrders, 1000);
  }
}

function stopInterval() {
  if (orderInterval) {
    clearInterval(orderInterval);
    orderInterval = null;
  }
}

async function updateWalletBalance(userId, order) {
  const [currency, pair] = order.symbol.split("/");
  const amount = Number(order.amount);
  const cost = Number(order.cost);
  const fee = Number(order.fee || 0);

  const currencyWallet = await getWallet(userId, "SPOT", currency);
  const pairWallet = await getWallet(userId, "SPOT", pair);

  if (!currencyWallet || !pairWallet) {
    throw new Error("Wallet not found");
  }

  if (order.side === "BUY") {
    const newBalance = currencyWallet.balance + (amount - fee);
    await updateWalletQuery(currencyWallet.id, newBalance);
  } else {
    // sell
    const newBalance = pairWallet.balance + (cost - fee);
    await updateWalletQuery(pairWallet.id, newBalance);
  }
}

function flushOrders() {
  if (Object.keys(trackedOrders).length > 0) {
    const route = "/api/exchange/order";
    const streamKey = "orders";
    Object.keys(trackedOrders).forEach((userId) => {
      let orders = trackedOrders[userId];
      // Filter out incomplete orders
      orders = orders.filter(
        (order) =>
          order.price &&
          order.amount &&
          order.filled !== undefined &&
          order.remaining !== undefined &&
          order.timestamp
      );

      // Remove duplicate orders
      const seenOrders = new Set();
      orders = orders.filter((order) => {
        const isDuplicate = seenOrders.has(order.id);
        seenOrders.add(order.id);
        return !isDuplicate;
      });

      if (orders.length > 0) {
        sendMessageToRoute(
          route,
          { userId },
          { stream: streamKey, data: orders }
        );
      }
    });
    trackedOrders = {};
  } else {
    stopInterval(); // Stop the interval if no orders to track
  }
}

async function fetchOpenOrdersWithRetries(exchange, symbol) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const orders = await exchange.fetchOpenOrders(symbol);
      return orders.map((order) => ({
        ...order,
        status: order.status.toUpperCase(),
      }));
    } catch (error) {
      console.error(
        `Error fetching open orders on attempt ${attempt} for symbol ${symbol}:`,
        error.message
      );
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }
  return null;
}

async function fetchOrder(exchange, orderId, symbol) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const order = await exchange.fetchOrder(Number(orderId), symbol);
      order.status = order.status.toUpperCase();
      return order;
    } catch (error) {
      console.error(
        `Error fetching order on attempt ${attempt} for orderId ${orderId}:`,
        error.message
      );
      if (
        error.message.includes(
          "Order was canceled or expired with no executed qty over 90 days ago and has been archived"
        )
      ) {
        await removeOrder(orderId);
        return null;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }
  return null;
}

async function updateOrder(orderId, data) {
  try {
    await models.exchangeOrder.update(
      { ...data },
      { where: { referenceId: orderId } }
    );
  } catch (error) {
    console.error(
      `Error updating order status in database for order ${orderId}:`,
      error.message
    );
  }
}

async function removeOrder(orderId) {
  try {
    await models.exchangeOrder.destroy({
      where: { referenceId: orderId },
      force: true,
    });
  } catch (error) {
    console.error(
      `Error removing order from database for order ${orderId}:`,
      error.message
    );
  }
}

function addUserToWatchlist(userId) {
  if (!watchedUserIds.has(userId)) {
    watchedUserIds.add(userId);
    trackedOrders[userId] = trackedOrders[userId] || [];
    if (!orderInterval) {
      startInterval();
    }
  }
}

function removeUserFromWatchlist(userId) {
  if (watchedUserIds.has(userId)) {
    watchedUserIds.delete(userId);
    delete trackedOrders[userId];
  }
}

function removeOrderFromTrackedOrders(userId, orderId) {
  if (trackedOrders[userId]) {
    trackedOrders[userId] = trackedOrders[userId].filter(
      (order) => order.id !== orderId
    );
    if (trackedOrders[userId].length === 0) {
      delete trackedOrders[userId];
      removeUserFromWatchlist(userId);
    }
  }
}

function addOrderToTrackedOrders(userId, order) {
  trackedOrders[userId] = trackedOrders[userId] || [];
  trackedOrders[userId].push({
    id: order.id,
    status: order.status,
    price: order.price,
    amount: order.amount,
    filled: order.filled,
    remaining: order.remaining,
    timestamp: order.timestamp,
  });
}

async function fetchOrdersForUser(userId, userOrders, exchange, provider) {
  let symbols = userOrders.map((order) => order.symbol);

  while (hasClients("/api/exchange/order") && watchedUserIds.has(userId)) {
    const currentTime = Date.now();
    if (currentTime - lastFetchTime < 5000) {
      await new Promise((resolve) =>
        setTimeout(resolve, 5000 - (currentTime - lastFetchTime))
      );
    }

    lastFetchTime = Date.now();

    for (const symbol of symbols) {
      try {
        const openOrders = await fetchOpenOrdersWithRetries(exchange, symbol);

        if (!openOrders) {
          throw new Error("Failed to fetch open orders after retries");
        }

        for (const order of userOrders) {
          const updatedOrder = openOrders.find(
            (o) => o.id === order.referenceId
          );
          if (!updatedOrder) {
            const fetchedOrder = await fetchOrder(
              exchange,
              order.referenceId,
              symbol
            );
            if (fetchedOrder) {
              if (fetchedOrder.status !== order.status) {
                addOrderToTrackedOrders(userId, {
                  id: order.id,
                  status: fetchedOrder.status,
                  price: fetchedOrder.price,
                  amount: fetchedOrder.amount,
                  filled: fetchedOrder.filled,
                  remaining: fetchedOrder.remaining,
                  timestamp: fetchedOrder.timestamp,
                });
                await updateOrder(fetchedOrder.id, {
                  status: fetchedOrder.status.toUpperCase(),
                  price: fetchedOrder.price,
                  filled: fetchedOrder.filled,
                  remaining: fetchedOrder.remaining,
                });
                if (fetchedOrder.status === "CLOSED") {
                  userOrders.splice(userOrders.indexOf(order), 1);
                  await updateWalletBalance(userId, fetchedOrder); // Update wallet balance for closed order
                }
              }
            } else {
              await removeOrder(order.referenceId);
              userOrders.splice(userOrders.indexOf(order), 1);
              removeOrderFromTrackedOrders(userId, order.id);
              if (userOrders.length === 0) {
                removeUserFromWatchlist(userId);
                break;
              }
            }
          } else if (updatedOrder.status !== order.status) {
            addOrderToTrackedOrders(userId, {
              id: order.id,
              status: updatedOrder.status,
              price: updatedOrder.price,
              amount: updatedOrder.amount,
              filled: updatedOrder.filled,
              remaining: updatedOrder.remaining,
              timestamp: updatedOrder.timestamp,
            });
            await updateOrder(updatedOrder.id, {
              status: updatedOrder.status.toUpperCase(),
              price: updatedOrder.price,
              filled: updatedOrder.filled,
              remaining: updatedOrder.remaining,
            });
            if (updatedOrder.status === "CLOSED") {
              userOrders.splice(userOrders.indexOf(order), 1);
              await updateWalletBalance(userId, updatedOrder);
            } else {
              order.status = updatedOrder.status;
            }
          }
        }

        // Add new orders to trackedOrders
        if (openOrders.length > 0) {
          trackedOrders[userId] = trackedOrders[userId] || [];
          openOrders.forEach((order) => {
            if (!trackedOrders[userId].some((o) => o.id === order.id)) {
              addOrderToTrackedOrders(userId, {
                id: order.id,
                status: order.status,
                price: order.price,
                amount: order.amount,
                filled: order.filled,
                remaining: order.remaining,
                timestamp: order.timestamp,
              });
            }
          });
        }

        if (userOrders.length === 0) {
          removeUserFromWatchlist(userId);
          break;
        }

        if (Object.keys(trackedOrders).length > 0) {
          startInterval();
        } else {
          stopInterval();
        }
      } catch (error) {
        console.error(
          `Error fetching open orders for symbol ${symbol}:`,
          error.message
        );
        // Remove the symbol from the list
        symbols = symbols.filter((s) => s !== symbol);
        // Remove orders related to this symbol
        const filteredOrders = userOrders.filter(
          (order) => order.symbol !== symbol
        );
        userOrders.length = 0; // Clear the array
        userOrders.push(...filteredOrders); // Add filtered orders back

        // If there are no more orders to watch, remove the user from the watchlist
        if (userOrders.length === 0) {
          removeUserFromWatchlist(userId);
          break;
        }
      }
    }
  }
}

export default async (data: Handler, message) => {
  if (typeof message === "string") {
    message = JSON.parse(message);
  }

  const { user } = data;
  if (!user?.id) {
    return;
  }

  const { userId } = message.payload;
  if (!userId) {
    return;
  }

  if (user.id !== userId) {
    return;
  }

  // Add the user to the watchlist if not already present
  if (!watchedUserIds.has(userId)) {
    addUserToWatchlist(userId);
  } else {
    // If user is already being watched, return early to avoid duplicate fetching
    return;
  }

  const userOrders = await models.exchangeOrder.findAll({
    where: { userId: user.id, status: "OPEN" },
    attributes: ["id", "referenceId", "symbol", "status", "createdAt"],
    raw: true,
  });

  if (!userOrders.length) {
    removeUserFromWatchlist(userId);
    return;
  }

  const exchange = await ExchangeManager.startExchange();
  if (!exchange) return;
  const provider = await ExchangeManager.getProvider();

  fetchOrdersForUser(userId, userOrders, exchange, provider);
};

// Functions to export for managing watchlist
export {
  addUserToWatchlist,
  removeUserFromWatchlist,
  addOrderToTrackedOrders,
  removeOrderFromTrackedOrders,
};
