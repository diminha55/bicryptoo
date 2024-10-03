import { Queue, Worker } from "bullmq";
import { models, sequelize } from "@b/db";
import { extensions } from "../..";
import {
  cacheCurrencies,
  updateCurrencyRates,
} from "@b/api/finance/currency/utils";
import { getCurrencies } from "@b/api/exchange/currency/index.get";
import {
  determineOrderStatus,
  getBinaryOrdersByStatus,
  orderIntervals,
  updateBinaryOrder,
} from "@b/api/exchange/binary/order/index.post";
import ExchangeManager from "@b/utils/exchange";
import {
  startSpotVerificationSchedule,
  spotVerificationIntervals,
  updateSpotWalletBalance,
} from "@b/api/finance/deposit/spot/index.ws";
import { Op } from "sequelize";
import { updateTransaction } from "@b/api/finance/utils";
import { addDays, addHours, isPast, add, format } from "date-fns";
import { getWalletById } from "@b/api/finance/wallet/utils";
import { getTransaction } from "@b/api/finance/transaction/[id]/index.get";
import {
  sendAiInvestmentEmail,
  sendEmailToTargetWithTemplate,
  sendInvestmentEmail,
  sendStakingRewardEmail,
} from "@b/utils/emails";
import { processRewards } from "@b/utils/affiliate";
import { handleNotification } from "@b/utils/notifications";
import { RedisSingleton } from "@b/utils/redis";
import { MatchingEngine } from "./eco/matchingEngine";

const redis = RedisSingleton.getInstance();

type CronJob = {
  name: string;
  title: string;
  period: number;
  description: string;
  function: () => Promise<void>;
  lastRun: number | null;
  lastRunError: string | null;
};

class CronJobManager {
  private static instance: CronJobManager;
  private cronJobs: CronJob[];

  private constructor() {
    this.cronJobs = [
      {
        name: "processPendingOrders",
        title: "Process Pending Orders",
        period: 60 * 60 * 1000,
        description: "Processes pending binary orders.",
        function: processPendingOrders,
        lastRun: null,
        lastRunError: null,
      },
      {
        name: "processCurrenciesPrices",
        title: "Process Currencies Prices",
        period: 2 * 60 * 1000,
        description:
          "Updates the prices of all exchange currencies in the database.",
        function: processCurrenciesPrices,
        lastRun: null,
        lastRunError: null,
      },
      {
        name: "processSpotPendingDeposits",
        title: "Process Pending Spot Deposits",
        period: 15 * 60 * 1000,
        description: "Processes pending spot wallet deposits.",
        function: processSpotPendingDeposits,
        lastRun: null,
        lastRunError: null,
      },
      {
        name: "processPendingWithdrawals",
        title: "Process Pending Withdrawals",
        period: 30 * 60 * 1000,
        description: "Processes pending spot wallet withdrawals.",
        function: processPendingWithdrawals,
        lastRun: null,
        lastRunError: null,
      },
      {
        name: "processWalletPnl",
        title: "Process Wallet PnL",
        period: 24 * 60 * 60 * 1000,
        description: "Processes wallet PnL for all users.",
        function: processWalletPnl,
        lastRun: null,
        lastRunError: null,
      },
    ];

    const addonCronJobs = {
      ai_investment: [
        {
          name: "processAiInvestments",
          title: "Process AI Investments",
          period: 60 * 60 * 1000,
          description: "Processes active AI investments.",
          function: processAiInvestments,
          lastRun: null,
          lastRunError: null,
        },
      ],
      forex: [
        {
          name: "processForexInvestments",
          title: "Process Forex Investments",
          period: 60 * 60 * 1000,
          description: "Processes active Forex investments.",
          function: processForexInvestments,
          lastRun: null,
          lastRunError: null,
        },
      ],
      ico: [
        {
          name: "processIcoPhases",
          title: "Process ICO Phases",
          period: 60 * 60 * 1000,
          description: "Processes ICO phases and updates their status.",
          function: processIcoPhases,
          lastRun: null,
          lastRunError: null,
        },
      ],
      staking: [
        {
          name: "processStakingLogs",
          title: "Process Staking Logs",
          period: 60 * 60 * 1000,
          description:
            "Processes staking logs and releases stakes if necessary.",
          function: processStakingLogs,
          lastRun: null,
          lastRunError: null,
        },
      ],
      mailwizard: [
        {
          name: "processMailwizardCampaigns",
          title: "Process Mailwizard Campaigns",
          period: 60 * 60 * 1000,
          description: "Processes Mailwizard campaigns and sends emails.",
          function: processMailwizardCampaigns,
          lastRun: null,
          lastRunError: null,
        },
      ],
    };

    Object.keys(addonCronJobs).forEach((addon) => {
      if (extensions.has(addon)) {
        addonCronJobs[addon].forEach((cronJob) => {
          if (!this.isCronJobPresent(this.cronJobs, cronJob.name)) {
            this.cronJobs.push(cronJob);
          }
        });
      }
    });
  }

  public static getInstance(): CronJobManager {
    if (!CronJobManager.instance) {
      CronJobManager.instance = new CronJobManager();
    }
    return CronJobManager.instance;
  }

  public getCronJobs(): CronJob[] {
    return this.cronJobs;
  }

  public updateJobStatus(
    name: string,
    lastRun: number,
    lastRunError: string | null
  ) {
    const job = this.cronJobs.find((job) => job.name === name);
    if (job) {
      job.lastRun = lastRun;
      job.lastRunError = lastRunError;
    }
  }

  private isCronJobPresent(cronJobs: CronJob[], jobName: string): boolean {
    return cronJobs.some((job) => job.name === jobName);
  }
}

export const createWorker = (
  name: string,
  handler: () => Promise<void>,
  period: number
) => {
  const cronJobManager = CronJobManager.getInstance();
  const queue = new Queue(name, {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
  });

  new Worker(
    name,
    async (job) => {
      const startTime = Date.now();
      try {
        await handler();
        cronJobManager.updateJobStatus(name, startTime, null);
      } catch (error) {
        cronJobManager.updateJobStatus(name, startTime, error.message);
        console.error(`Error processing ${name} job:`, error);
        throw error;
      }
    },
    {
      connection: {
        host: "127.0.0.1",
        port: 6379,
      },
    }
  );

  queue.add(name, {}, { repeat: { every: period } }).catch((error) => {
    console.error(`Failed to add job ${name} to queue:`, error);
  });
};

export async function fetchFiatCurrencyPrices() {
  const baseCurrency = "USD";
  const openExchangeRatesApiKey = process.env.APP_OPENEXCHANGERATES_APP_ID;
  const openExchangeRatesUrl = `https://openexchangerates.org/api/latest.json?appId=${openExchangeRatesApiKey}&base=${baseCurrency}`;
  const frankfurterApiUrl = `https://api.frankfurter.app/latest?from=${baseCurrency}`;

  try {
    await fetchFromOpenExchangeRates(openExchangeRatesUrl);
  } catch (error) {
    console.error("Error with Open Exchange Rates:", error);
    try {
      await fetchFromFrankfurter(frankfurterApiUrl);
    } catch (fallbackError) {
      console.error("Error with Frankfurter API:", fallbackError);
      throw new Error(
        `Both API calls failed: ${error.message}, ${fallbackError.message}`
      );
    }
  }
}

async function fetchFromOpenExchangeRates(url) {
  const response = await fetch(url);

  if (!response.ok) {
    switch (response.status) {
      case 401:
        throw new Error("Unauthorized: Invalid API key.");
      case 403:
        throw new Error("Forbidden: Access denied.");
      case 429:
        throw new Error("Too Many Requests: Rate limit exceeded.");
      case 500:
        throw new Error(
          "Internal Server Error: The API is currently unavailable."
        );
      default:
        throw new Error(`Network response was not ok: ${response.statusText}`);
    }
  }

  const data = await response.json();

  if (data && data.rates) {
    await updateRatesFromData(data.rates);
  } else {
    throw new Error(
      "Invalid data format received from Open Exchange Rates API"
    );
  }
}

async function fetchFromFrankfurter(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Network response was not ok: ${response.statusText}`);
  }

  const data = await response.json();

  if (data && data.rates) {
    await updateRatesFromData(data.rates);
  } else {
    throw new Error("Invalid data format received from Frankfurter API");
  }
}

async function updateRatesFromData(exchangeRates) {
  const ratesToUpdate = {};

  const currenciesRaw = await redis.get("currencies");
  if (!currenciesRaw) {
    throw new Error("No currencies data available in Redis");
  }

  let currencies;
  try {
    currencies = JSON.parse(currenciesRaw);
  } catch (parseError) {
    throw new Error(`Error parsing currencies data: ${parseError.message}`);
  }

  if (!Array.isArray(currencies)) {
    throw new Error("Currencies data is not an array");
  }

  for (const currency of currencies) {
    if (Object.prototype.hasOwnProperty.call(exchangeRates, currency.id)) {
      ratesToUpdate[currency.id] = exchangeRates[currency.id];
    }
  }

  await updateCurrencyRates(ratesToUpdate);
  await cacheCurrencies();
}

export async function cacheExchangeCurrencies() {
  try {
    const currencies = await getCurrencies();
    await redis.set(
      "exchangeCurrencies",
      JSON.stringify(currencies),
      "EX",
      1800
    );
  } catch (error) {
    console.error("Error in cacheExchangeCurrencies:", error);
    throw error;
  }
}

export async function processPendingOrders() {
  try {
    const pendingOrders = await getBinaryOrdersByStatus("PENDING");

    const currentTime = new Date().getTime();

    const unmonitoredOrders = pendingOrders.filter((order) => {
      const closedAtTime = new Date(order.closedAt).getTime();
      return closedAtTime <= currentTime && !orderIntervals.has(order.id);
    });

    const exchange = await (ExchangeManager as any).startExchange();

    for (const order of unmonitoredOrders) {
      const timeframe = "1m";
      const ohlcv = await exchange.fetchOHLCV(
        order.symbol,
        timeframe,
        Number(order.closedAt) - 60000,
        2
      );
      const closePrice = ohlcv[1][4];
      const updateData = determineOrderStatus(order, closePrice);
      await updateBinaryOrder(order.id, updateData);
    }
  } catch (error) {
    console.error("Error processing pending orders:", error);
    throw error;
  }
}

export async function processCurrenciesPrices() {
  try {
    const exchange = await ExchangeManager.startExchange();
    if (!exchange) return;

    let marketsCache: any[] = [];
    let currenciesCache: any[] = [];

    // Fetch markets from the database
    try {
      marketsCache = await models.exchangeMarket.findAll({
        where: {
          status: true,
        },
        attributes: ["currency", "pair"],
      });
    } catch (err) {
      console.error("Error fetching markets from database:", err);
      throw err;
    }

    // Fetch currencies from the database
    try {
      currenciesCache = await models.exchangeCurrency.findAll({
        attributes: ["currency", "id", "price", "status"],
      });
    } catch (err) {
      console.error("Error fetching currencies from database:", err);
      throw err;
    }

    const marketSymbols = marketsCache.map(
      (market: any) => `${market.currency}/${market.pair}`
    );
    if (!marketSymbols.length) {
      const error = new Error("No market symbols found");
      throw error;
    }

    let markets: any = {};
    try {
      if (exchange.has["fetchLastPrices"]) {
        markets = await exchange.fetchLastPrices(marketSymbols);
      } else {
        markets = await exchange.fetchTickers(marketSymbols);
      }
    } catch (error) {
      console.error("Update currencies pricing failed:", error.message);
      throw error;
    }

    // Filter symbols with pair "USDT"
    const usdtPairs = Object.keys(markets).filter((symbol) =>
      symbol.endsWith("/USDT")
    );

    // Prepare data for bulk update
    const bulkUpdateData = usdtPairs
      .map((symbol) => {
        const currency = symbol.split("/")[0];
        const market = markets[symbol];

        // Ensure market and necessary properties are defined
        let price;
        if (exchange.has["fetchLastPrices"]) {
          price = market.price;
        } else {
          price = market.last;
        }

        if (!price) {
          console.warn(
            `Market data missing or invalid for symbol: ${symbol}, market data: ${JSON.stringify(
              market
            )}`
          );
          return null;
        }

        const matchingCurrency = currenciesCache.find(
          (dbCurrency) => dbCurrency.currency === currency
        );

        if (matchingCurrency) {
          matchingCurrency.price = parseFloat(price); // Ensure price is a number
          return matchingCurrency;
        }
        return null;
      })
      .filter((item) => item !== null);

    // Add USDT with price 1 if it's in the database currencies
    const usdtCurrency = currenciesCache.find(
      (dbCurrency) => dbCurrency.currency === "USDT"
    );
    if (usdtCurrency) {
      usdtCurrency.price = 1;
      bulkUpdateData.push(usdtCurrency);
    }

    try {
      await sequelize.transaction(async (transaction) => {
        for (const item of bulkUpdateData) {
          await item.save({ transaction });
        }
      });
    } catch (error) {
      console.error("Update currencies pricing failed:", error.message);
      throw error;
    }
  } catch (error) {
    console.error("Error in processCurrenciesPrices:", error);
    throw error;
  }
}

export async function updateCurrencyPricesBulk(
  data: { id: number; price: number }[]
) {
  try {
    // Start a transaction
    await sequelize.transaction(async (transaction) => {
      // Map through data and update each exchangeCurrency record within the transaction
      for (const item of data) {
        await models.exchangeCurrency.update(
          { price: item.price },
          {
            where: { id: item.id },
            transaction, // Ensure the update is part of the transaction
          }
        );
      }
    });
  } catch (error) {
    console.error("Bulk update failed:", error);
    throw error;
  }
}

export async function processSpotPendingDeposits() {
  try {
    const transactions = await getPendingSpotTransactionsQuery("DEPOSIT");

    for (const transaction of transactions) {
      const transactionId = transaction.id;
      const userId = transaction.userId;
      const trx = transaction.referenceId;

      if (!trx) {
        continue;
      }

      // Only start a new verification schedule if it's not already running
      if (!spotVerificationIntervals.has(transactionId)) {
        startSpotVerificationSchedule(transactionId, userId, trx);
      }
    }
  } catch (error) {
    console.error("Error processing spot pending deposits:", error);
    throw error;
  }
}

export async function getPendingSpotTransactionsQuery(type) {
  try {
    return await models.transaction.findAll({
      where: {
        status: "PENDING",
        type: type,
        [Op.and]: [
          {
            referenceId: { [Op.ne]: null }, // Not equal to null
          },
          {
            referenceId: { [Op.ne]: "" }, // Not equal to empty string
          },
        ],
      },
      include: [
        {
          model: models.wallet,
          as: "wallet",
          attributes: ["id", "currency"], // Specify the fields to include from the wallet model
        },
      ],
    });
  } catch (error) {
    console.error("Error fetching pending spot transactions:", error);
    throw error;
  }
}

export async function processPendingWithdrawals() {
  try {
    const transactions = (await getPendingSpotTransactionsQuery(
      "WITHDRAW"
    )) as unknown as Transaction[];

    for (const transaction of transactions) {
      const userId = transaction.userId;
      const trx = transaction.referenceId;
      if (!trx) continue;

      const exchange = await ExchangeManager.startExchange();
      try {
        const withdrawals = await exchange.fetchWithdrawals(
          transaction.wallet?.currency
        );
        const withdrawData = withdrawals.find((w) => w.id === trx);
        let withdrawStatus: any = "PENDING";
        if (withdrawData) {
          switch (withdrawData.status) {
            case "ok":
              withdrawStatus = "COMPLETED";
              break;
            case "canceled":
              withdrawStatus = "CANCELLED";
              break;
            case "failed":
              withdrawStatus = "FAILED";
          }
        }
        if (!withdrawStatus) {
          continue;
        }
        if (transaction.status === withdrawStatus) {
          continue;
        }
        await updateTransaction(transaction.id, { status: withdrawStatus });
        if (withdrawStatus === "FAILED" || withdrawStatus === "CANCELLED") {
          await updateSpotWalletBalance(
            userId,
            transaction.wallet?.currency,
            Number(transaction.amount),
            Number(transaction.fee),
            "REFUND_WITHDRAWAL"
          );
          await handleNotification({
            userId,
            title: "Withdrawal Failed",
            message: `Your withdrawal of ${transaction.amount} ${transaction.wallet?.currency} has failed.`,
            type: "ACTIVITY",
          });
        }
      } catch (error) {
        console.error(
          `Error processing withdrawal for transaction ${transaction.id}: ${error.message}`
        );
        continue;
      }
    }
  } catch (error) {
    console.error("Error processing pending withdrawals:", error);
    throw error;
  }
}

export async function processAiInvestments() {
  try {
    const activeInvestments = await getActiveInvestments();

    for (const investment of activeInvestments) {
      try {
        await processAiInvestment(investment);
      } catch (error) {
        console.error(
          `Error processing AI investment ${investment.id}: ${error.message}`
        );
        continue;
      }
    }
  } catch (error) {
    console.error("Error fetching active AI investments:", error);
    throw error;
  }
}

export async function getActiveInvestments() {
  try {
    return await models.aiInvestment.findAll({
      where: {
        status: "ACTIVE",
      },
      include: [
        {
          model: models.aiInvestmentPlan,
          as: "plan",
          attributes: [
            "id",
            "name",
            "title",
            "description",
            "defaultProfit",
            "defaultResult",
          ],
        },
        {
          model: models.aiInvestmentDuration,
          as: "duration",
          attributes: ["id", "duration", "timeframe"],
        },
      ],
      order: [
        ["status", "ASC"], // 'ASC' for ascending or 'DESC' for descending
        ["createdAt", "ASC"], // 'ASC' for oldest first, 'DESC' for newest first
      ],
    });
  } catch (error) {
    console.error("Error fetching active investments:", error);
    throw error;
  }
}

export async function processAiInvestment(investment) {
  const { id, duration, createdAt, amount, profit, result, plan, status } =
    investment;
  if (status === "COMPLETED") {
    return null;
  }

  try {
    const user = await models.user.findByPk(investment.userId);
    if (!user) {
      console.error(`User not found for investment ${id}`);
      return null;
    }
    const roi = profit || plan.defaultProfit;
    const investmentResult = result || plan.defaultResult;

    let endDate;
    switch (duration.timeframe) {
      case "HOUR":
        endDate = addHours(new Date(createdAt), duration.duration);
        break;
      case "DAY":
        endDate = addDays(new Date(createdAt), duration.duration);
        break;
      case "WEEK":
        endDate = addDays(new Date(createdAt), duration.duration * 7);
        break;
      case "MONTH":
        endDate = addDays(new Date(createdAt), duration.duration * 30);
        break;
      default:
        endDate = addHours(new Date(createdAt), duration.duration);
        break;
    }

    if (isPast(endDate)) {
      let updatedInvestment, wallet;
      try {
        const transaction = await getTransaction(investment.id);
        if (!transaction) {
          console.error(`Transaction not found for investment ${id}`);
          await models.aiInvestment.destroy({
            where: { id },
          });
          return null;
        }

        wallet = await getWalletById(transaction.walletId);
        if (!wallet) throw new Error("Wallet not found");

        let newBalance = wallet.balance;
        if (investmentResult === "WIN") {
          newBalance += amount + roi;
        } else if (investmentResult === "LOSS") {
          newBalance += amount - roi;
        } else {
          newBalance += amount;
        }

        // Update Wallet
        updatedInvestment = await sequelize.transaction(async (transaction) => {
          await models.wallet.update(
            {
              balance: newBalance,
            },
            {
              where: { id: wallet.id },
              transaction,
            }
          );

          await models.transaction.create(
            {
              userId: wallet.userId,
              walletId: wallet.id,
              amount:
                investmentResult === "WIN"
                  ? roi
                  : investmentResult === "LOSS"
                  ? -roi
                  : 0,
              description: `Investment ROI: Plan "${investment.plan.title}" | Duration: ${investment.duration.duration} ${investment.duration.timeframe}`,
              status: "COMPLETED",
              type: "AI_INVESTMENT_ROI",
            },
            { transaction }
          );

          await models.aiInvestment.update(
            {
              status: "COMPLETED",
              result: investmentResult,
              profit: roi,
            },
            {
              where: { id },
              transaction,
            }
          );

          return await models.aiInvestment.findByPk(id, {
            include: [
              { model: models.aiInvestmentPlan, as: "plan" },
              { model: models.aiInvestmentDuration, as: "duration" },
            ],
            transaction,
          });
        });
      } catch (error) {
        console.error(`Error processing investment ${id}: ${error.message}`);
        return null;
      }

      if (updatedInvestment) {
        try {
          if (!updatedInvestment) throw new Error("Investment not found");

          await sendAiInvestmentEmail(
            user,
            plan,
            duration,
            updatedInvestment,
            "AiInvestmentCompleted"
          );

          await handleNotification({
            userId: user.id,
            title: "AI Investment Completed",
            message: `Your AI investment of ${amount} ${wallet.currency} has been completed with a status of ${investmentResult}`,
            type: "ACTIVITY",
          });
        } catch (error) {
          console.error(
            `Error sending email for investment ${id}: ${error.message}`
          );
        }

        try {
          await processRewards(
            user.id,
            amount,
            "AI_INVESTMENT",
            wallet?.currency
          );
        } catch (error) {
          console.error(
            `Error processing rewards for investment ${id}: ${error.message}`
          );
        }
      }
      return updatedInvestment;
    }
  } catch (error) {
    console.error(`Error processing AI investment ${id}: ${error.message}`);
    throw error;
  }
}

export async function processForexInvestments() {
  try {
    const activeInvestments = await getActiveForexInvestments();

    for (const investment of activeInvestments) {
      try {
        await processForexInvestment(investment);
      } catch (error) {
        console.error(
          `Error processing Forex investment ${investment.id}: ${error.message}`
        );
        continue;
      }
    }
  } catch (error) {
    console.error("Error fetching active Forex investments:", error);
    throw error;
  }
}

export async function getActiveForexInvestments() {
  try {
    return await models.forexInvestment.findAll({
      where: {
        status: "ACTIVE",
      },
      include: [
        {
          model: models.forexPlan,
          as: "plan",
          attributes: [
            "id",
            "name",
            "title",
            "description",
            "defaultProfit",
            "defaultResult",
          ],
        },
        {
          model: models.forexDuration,
          as: "duration",
          attributes: ["id", "duration", "timeframe"],
        },
      ],
      order: [
        ["status", "ASC"], // 'ASC' for ascending or 'DESC' for descending
        ["createdAt", "ASC"], // 'ASC' for oldest first, 'DESC' for newest first
      ],
    });
  } catch (error) {
    console.error("Error fetching active Forex investments:", error);
    throw error;
  }
}

export async function processForexInvestment(investment) {
  const { id, duration, createdAt, amount, profit, result, plan, userId } =
    investment;

  if (investment.status === "COMPLETED") {
    return null;
  }

  try {
    const user = await models.user.findByPk(userId);
    if (!user) {
      console.error(`User not found for Forex investment ${id}`);
      return null;
    }

    const roi = profit || plan.defaultProfit;
    const investmentResult = result || plan.defaultResult;

    let endDate;
    switch (duration.timeframe) {
      case "HOUR":
        endDate = addHours(new Date(createdAt), duration.duration);
        break;
      case "DAY":
        endDate = addDays(new Date(createdAt), duration.duration);
        break;
      case "WEEK":
        endDate = addDays(new Date(createdAt), duration.duration * 7);
        break;
      case "MONTH":
        endDate = addDays(new Date(createdAt), duration.duration * 30);
        break;
      default:
        endDate = addHours(new Date(createdAt), duration.duration);
        break;
    }

    if (isPast(endDate)) {
      let updatedForexInvestment;
      try {
        const account = await models.forexAccount.findOne({
          where: {
            userId: userId,
            type: "LIVE",
          },
        });
        if (!account) throw new Error("Forex account not found");

        const newBalance =
          account.balance +
          (investmentResult === "WIN"
            ? roi
            : investmentResult === "LOSS"
            ? -roi
            : 0);

        // Update Balance
        updatedForexInvestment = await sequelize.transaction(
          async (transaction) => {
            await models.forexAccount.update(
              { balance: newBalance },
              { where: { id: account.id }, transaction }
            );

            await models.forexInvestment.update(
              {
                status: "COMPLETED",
                result: investmentResult,
                profit: roi,
              },
              {
                where: { id },
                transaction,
              }
            );

            return await models.forexInvestment.findByPk(id, {
              include: [
                { model: models.forexPlan, as: "plan" },
                { model: models.forexDuration, as: "duration" },
              ],
              transaction,
            });
          }
        );
      } catch (error) {
        console.error(
          `Error processing Forex investment ${id}: ${error.message}`
        );
        return null;
      }

      if (updatedForexInvestment) {
        try {
          await sendInvestmentEmail(
            user,
            plan,
            duration,
            updatedForexInvestment,
            "ForexInvestmentCompleted"
          );

          await handleNotification({
            userId: user.id,
            title: "Forex Investment Completed",
            message: `Your Forex investment of ${amount} has been completed with a status of ${investmentResult}`,
            type: "ACTIVITY",
          });
        } catch (error) {
          console.error(
            `Error sending Forex investment email: ${error.message}`
          );
        }

        try {
          await processRewards(
            user.id,
            amount,
            "FOREX_INVESTMENT",
            investment?.currency
          );
        } catch (error) {
          console.error(
            `Error processing rewards for Forex investment ${id}: ${error.message}`
          );
        }
      }

      return updatedForexInvestment;
    }
  } catch (error) {
    console.error(`Error processing Forex investment ${id}: ${error.message}`);
    throw error;
  }

  return null;
}

export async function processIcoPhases() {
  try {
    const phases = await getIcoPhases();

    const currentDate = new Date();

    for (const phase of phases) {
      try {
        if (currentDate >= phase.endDate && phase.status === "ACTIVE") {
          await updatePhaseStatus(phase.id, "COMPLETED");
        } else if (
          currentDate >= phase.startDate &&
          phase.status === "PENDING"
        ) {
          await updatePhaseStatus(phase.id, "ACTIVE");
        }
      } catch (error) {
        console.error(
          `Error updating phase ${phase.id} status: ${error.message}`
        );
      }
    }
  } catch (error) {
    console.error("Error processing ICO phases:", error);
    throw error;
  }
}

export async function getIcoPhases() {
  try {
    return await models.icoPhase.findAll({
      where: {
        [Op.or]: [{ status: "PENDING" }, { status: "ACTIVE" }],
      },
      include: [
        {
          model: models.icoToken,
          as: "token",
        },
      ],
    });
  } catch (error) {
    console.error("Error fetching ICO phases:", error);
    throw error;
  }
}

export async function updatePhaseStatus(id, status) {
  try {
    await models.icoPhase.update(
      { status },
      {
        where: { id },
      }
    );
  } catch (error) {
    console.error(
      `Error updating ICO phase status for id ${id}: ${error.message}`
    );
    throw error;
  }
}

export async function processStakingLogs() {
  try {
    // Get all staking logs where the end date (createdAt + duration) has passed and status is ACTIVE
    const stakingLogsToRelease = (await models.stakingLog.findAll({
      where: {
        status: "ACTIVE",
      },
      include: [
        {
          model: models.stakingPool,
          as: "pool",
          attributes: ["name", "currency", "chain", "type"],
        },
        {
          model: models.user,
          as: "user",
          attributes: ["id", "email", "firstName", "lastName"],
        },
        {
          model: models.stakingDuration,
          as: "duration",
          attributes: ["duration", "interestRate"],
        },
      ],
    })) as any;

    for (const log of stakingLogsToRelease) {
      if (!log.createdAt || !log.duration) continue;
      const endDate = addDays(new Date(log.createdAt), log.duration.duration);
      if (isPast(endDate)) {
        try {
          const interest = (log.amount * log.duration.interestRate) / 100;
          const releaseDate = new Date(); // Assuming release date is now
          log.releaseDate = releaseDate; // Set the release date
          await log.save(); // Save the updated log with the release date

          await releaseStake(log.id);
          await sendStakingRewardEmail(
            log.user,
            log,
            log.pool,
            interest // Assuming this is the reward structure in your schema
          );

          await handleNotification({
            userId: log.user.id,
            title: "Staking Reward",
            message: `You have received a staking reward of ${interest} ${log.pool.currency}`,
            type: "ACTIVITY",
          });

          await processRewards(
            log.user.id,
            log.amount,
            "STAKING_LOYALTY",
            log.pool.currency
          );
        } catch (error) {
          console.error(
            `Failed to release stake for log ${log.id}: ${error.message}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error processing staking logs:", error);
    throw error;
  }
}

export async function releaseStake(stakeId) {
  try {
    await models.stakingLog.update(
      { status: "RELEASED" },
      { where: { id: stakeId } }
    );
  } catch (error) {
    console.error(`Error releasing stake for id ${stakeId}: ${error.message}`);
    throw error;
  }
}

export async function processMailwizardCampaigns() {
  try {
    const campaigns = await models.mailwizardCampaign.findAll({
      where: { status: "ACTIVE" },
      include: [
        {
          model: models.mailwizardTemplate,
          as: "template",
        },
      ],
    });

    for (const campaign of campaigns) {
      let sentCount = 0;

      if (!campaign.targets) continue;

      let targets: {
        email: string;
        status: string;
      }[] = [];

      try {
        targets = JSON.parse(campaign.targets);
      } catch (error) {
        console.error(
          `Error parsing targets for campaign ${campaign.id}: ${error.message}`
        );
        continue;
      }

      for (const target of targets) {
        if (target.status === "PENDING" && sentCount < campaign.speed) {
          try {
            await sendEmailToTargetWithTemplate(
              target.email,
              campaign.subject,
              campaign.template.content
            );
            target.status = "SENT";
            sentCount++;
          } catch (error) {
            console.error(
              `Error sending email to ${target.email}: ${error.message}`
            );
            target.status = "FAILED";
          }
        }
      }

      try {
        await updateMailwizardCampaignTargets(
          campaign.id,
          JSON.stringify(targets)
        );

        if (targets.every((target) => target.status !== "PENDING")) {
          await updateMailwizardCampaignStatus(campaign.id, "COMPLETED");
        }
      } catch (error) {
        console.error(
          `Error updating campaign ${campaign.id}: ${error.message}`
        );
      }
    }
  } catch (error) {
    console.error("Error processing Mailwizard campaigns:", error.message);
    throw error;
  }
}

export async function updateMailwizardCampaignTargets(id, targets) {
  try {
    await models.mailwizardCampaign.update(
      { targets },
      {
        where: { id },
      }
    );
  } catch (error) {
    console.error(
      `Error updating targets for campaign ${id}: ${error.message}`
    );
    throw error;
  }
}

export async function updateMailwizardCampaignStatus(id, status) {
  try {
    await models.mailwizardCampaign.update(
      { status },
      {
        where: { id },
      }
    );
  } catch (error) {
    console.error(`Error updating status for campaign ${id}: ${error.message}`);
    throw error;
  }
}

export async function processWalletPnl() {
  try {
    const users = await models.user.findAll();

    for (const user of users) {
      try {
        await handlePnl(user);
      } catch (error) {
        console.error(
          `Failed to process PnL for user ${user.id}: ${error.message}`
        );
      }
    }
  } catch (error) {
    console.error(`Error fetching users for PnL processing: ${error.message}`);
  }
}

const handlePnl = async (user: any) => {
  try {
    const wallets = await models.wallet.findAll({
      where: { userId: user.id },
    });

    // Check if there's PnL data for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayPnl, currencyPrices, exchangePrices, engine] =
      await Promise.all([
        models.walletPnl.findOne({
          where: {
            userId: user.id,
            createdAt: {
              [Op.gte]: today,
            },
          },
        }),
        models.currency.findAll({
          where: { id: Array.from(new Set(wallets.map((w) => w.currency))) },
        }),
        models.exchangeCurrency.findAll({
          where: {
            currency: Array.from(new Set(wallets.map((w) => w.currency))),
          },
        }),
        MatchingEngine.getInstance(),
      ]);

    const tickers = await engine.getTickers();

    // Map prices for quick lookup
    const currencyMap = new Map(
      currencyPrices.map((item) => [item.id, item.price])
    );
    const exchangeMap = new Map(
      exchangePrices.map((item) => [item.currency, item.price])
    );

    // Calculate total balances
    const balances = { FIAT: 0, SPOT: 0, ECO: 0 };
    wallets.forEach((wallet) => {
      let price;
      if (wallet.type === "FIAT") {
        price = currencyMap.get(wallet.currency);
      } else if (wallet.type === "SPOT") {
        price = exchangeMap.get(wallet.currency);
      } else if (wallet.type === "ECO") {
        price = tickers[wallet.currency]?.last || 0;
      }
      if (price) {
        balances[wallet.type] += price * wallet.balance;
      }
    });

    // Update or create PnL entry
    if (todayPnl) {
      await todayPnl.update({ balances });
    } else {
      await models.walletPnl.create({
        userId: user.id,
        balances,
        createdAt: today,
      });
    }

    const oneMonthAgo = add(today, { days: -28 });

    const pnlRecords = await models.walletPnl.findAll({
      where: {
        userId: user.id,
        createdAt: {
          [Op.between]: [oneMonthAgo, today],
        },
      },
      attributes: ["balances", "createdAt"],
      order: [["createdAt", "ASC"]],
    });

    const dailyPnl = pnlRecords.reduce<
      Record<string, { FIAT: number; SPOT: number; ECO: number }>
    >((acc, record) => {
      const dateKey = format(record.createdAt as Date, "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = { FIAT: 0, SPOT: 0, ECO: 0 };
      }
      acc[dateKey].FIAT += record.balances.FIAT || 0;
      acc[dateKey].SPOT += record.balances.SPOT || 0;
      acc[dateKey].ECO += record.balances.ECO || 0;
      return acc;
    }, {});

    // Define the type for pnlChart explicitly
    type PnlChartItem = {
      date: string;
      FIAT: number;
      SPOT: number;
      ECO: number;
    };
    const pnlChart: PnlChartItem[] = [];
    const startOfWeek = add(oneMonthAgo, { days: -oneMonthAgo.getDay() });

    for (
      let weekStart = startOfWeek;
      weekStart < today;
      weekStart = add(weekStart, { weeks: 1 })
    ) {
      const weekEnd = add(weekStart, { days: 6 });
      let weeklyFIAT = 0,
        weeklySPOT = 0,
        weeklyECO = 0;

      for (
        let date = weekStart;
        date <= weekEnd;
        date = add(date, { days: 1 })
      ) {
        const dateKey = format(date, "yyyy-MM-dd");
        if (dailyPnl[dateKey]) {
          weeklyFIAT += dailyPnl[dateKey].FIAT;
          weeklySPOT += dailyPnl[dateKey].SPOT;
          weeklyECO += dailyPnl[dateKey].ECO;
        }
      }

      pnlChart.push({
        date: format(weekStart, "yyyy-MM-dd"),
        FIAT: weeklyFIAT,
        SPOT: weeklySPOT,
        ECO: weeklyECO,
      });
    }

    const yesterday = add(today, { days: -1 });
    const yesterdayPnlRecord = pnlRecords.find(
      (record) =>
        format(record.createdAt as Date, "yyyy-MM-dd") ===
        format(yesterday, "yyyy-MM-dd")
    );

    return {
      today: sumBalances(balances),
      yesterday: sumBalances(yesterdayPnlRecord?.balances || {}),
      chart: pnlChart,
    };
  } catch (error) {
    console.error(`Error handling PnL for user ${user.id}: ${error.message}`);
    throw error;
  }
};

const sumBalances = (balances: Record<string, number>) => {
  return Object.values(balances).reduce((acc, balance) => acc + balance, 0);
};

export default CronJobManager;
