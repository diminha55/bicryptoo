import * as ccxt from "ccxt";
import { sleep } from "./system";
import { models } from "@b/db";

class ExchangeManager {
  static readonly instance = new ExchangeManager();
  private readonly exchangeCache = new Map<string, any>();
  private provider: string | null = null;
  private exchange: any = null;
  private exchangeProvider: any = null;
  private lastAttemptTime: number | null = null;
  private attemptCount: number = 0;

  private async fetchActiveProvider(): Promise<string | null> {
    try {
      const provider = await models.exchange.findOne({
        where: {
          status: true,
        },
      });
      if (!provider) {
        console.error("No active provider found.");
        return null;
      }
      return provider.name;
    } catch (error) {
      console.error("Error fetching active provider:", error);
      return null;
    }
  }

  private async initializeExchange(
    provider: string,
    retries = 3
  ): Promise<any> {
    if (this.exchangeCache.has(provider)) {
      return this.exchangeCache.get(provider);
    }

    // Logic to limit retries within a 30-minute window after 3 failed attempts
    const now = Date.now();
    if (
      this.attemptCount >= 3 &&
      this.lastAttemptTime &&
      now - this.lastAttemptTime < 30 * 60 * 1000
    ) {
      console.error(
        `Initialization for ${provider} halted due to multiple failures. Will retry after 30 minutes.`
      );
      return null;
    }

    const apiKey = process.env[`APP_${provider.toUpperCase()}_API_KEY`];
    const apiSecret = process.env[`APP_${provider.toUpperCase()}_API_SECRET`];
    const apiPassphrase =
      process.env[`APP_${provider.toUpperCase()}_API_PASSPHRASE`];

    if (!apiKey || !apiSecret || apiKey === "" || apiSecret === "") {
      console.error(`API credentials for ${provider} are missing.`);
      this.attemptCount += 1;
      this.lastAttemptTime = now;
      return null;
    }

    try {
      let exchange = new ccxt.pro[provider]({
        apiKey,
        secret: apiSecret,
        password: apiPassphrase,
      });

      const credentialsValid = await exchange.checkRequiredCredentials();
      if (!credentialsValid) {
        console.error(`API credentials for ${provider} are invalid.`);
        await exchange.close();

        exchange = new ccxt.pro[provider]();
      }

      try {
        await exchange.loadMarkets();
      } catch (error) {
        console.error(`Failed to load markets: ${error.message}`);
        await exchange.close();

        exchange = new ccxt.pro[provider]();
      }

      this.exchangeCache.set(provider, exchange);
      // Reset attempt count and timestamp upon successful initialization
      this.attemptCount = 0;
      this.lastAttemptTime = null;
      return exchange;
    } catch (error) {
      console.error(`Failed to initialize exchange: ${error}`);
      this.attemptCount += 1;
      this.lastAttemptTime = now;

      if (
        retries > 0 &&
        (this.attemptCount < 3 || now - this.lastAttemptTime >= 30 * 60 * 1000)
      ) {
        console.error(`Retrying (${retries} retries left)...`);
        await sleep(5000);
        return this.initializeExchange(provider, retries - 1);
      }
      return null;
    }
  }

  public async startExchange(): Promise<any> {
    if (this.exchange) {
      return this.exchange;
    }

    this.provider = this.provider || (await this.fetchActiveProvider());
    if (!this.provider) {
      return null;
    }

    this.exchange =
      this.exchangeCache.get(this.provider) ||
      (await this.initializeExchange(this.provider));
    return this.exchange;
  }

  public async startExchangeProvider(provider: string): Promise<any> {
    if (!provider) {
      throw new Error("Provider is required to start exchange provider.");
    }

    this.exchangeProvider =
      this.exchangeCache.get(provider) ||
      (await this.initializeExchange(provider));
    return this.exchangeProvider;
  }

  public removeExchange(provider: string): void {
    if (!provider) {
      throw new Error("Provider is required to remove exchange.");
    }

    this.exchangeCache.delete(provider);
    if (this.provider === provider) {
      this.exchange = null;
      this.provider = null;
    }
  }

  public async getProvider(): Promise<string | null> {
    if (!this.provider) {
      this.provider = await this.fetchActiveProvider();
    }
    return this.provider;
  }

  public async testExchangeCredentials(
    provider: string
  ): Promise<{ status: boolean; message: string }> {
    try {
      const apiKey = process.env[`APP_${provider.toUpperCase()}_API_KEY`];
      const apiSecret = process.env[`APP_${provider.toUpperCase()}_API_SECRET`];
      const apiPassphrase =
        process.env[`APP_${provider.toUpperCase()}_API_PASSPHRASE`];

      if (!apiKey || !apiSecret || apiKey === "" || apiSecret === "") {
        return {
          status: false,
          message: "API credentials are missing",
        };
      }

      const exchange = new ccxt.pro[provider]({
        apiKey,
        secret: apiSecret,
        password: apiPassphrase,
      });

      await exchange.loadMarkets();
      const balance = await exchange.fetchBalance();
      if (balance) {
        return {
          status: true,
          message: "API credentials are valid",
        };
      } else {
        return {
          status: false,
          message: "Failed to fetch balance with the provided credentials",
        };
      }
    } catch (error) {
      return {
        status: false,
        message: `Error testing API credentials: ${error.message}`,
      };
    }
  }
}

export default ExchangeManager.instance;

export function mapChainNameToChainId(chainName) {
  const chainMap = {
    BEP20: "bsc",
    BEP2: "bnb",
    ERC20: "eth",
    TRC20: "trx",
    "KAVA EVM CO-CHAIN": "kavaevm",
    "LIGHTNING NETWORK": "lightning",
    "BTC-SEGWIT": "btc",
    "ASSET HUB(POLKADOT)": "polkadot",
  };

  return chainMap[chainName] || chainName;
}
