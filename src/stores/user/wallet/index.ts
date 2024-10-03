import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import $fetch from "@/utils/api";

type Wallet = {
  id: string;
  type: string;
  currency: string;
  balance: number;
  transactions: any[];
};

type WalletStore = {
  wallet: Wallet | null;
  fiatWallets: Wallet[];
  spotWallets: Wallet[];
  ecoWallets: Wallet[];
  pnl: {
    today: number;
    yesterday: number;
    chart: any[];
  } | null;
  fetchWallets: () => void;
  fetchPnl: () => void;
  fetchWallet: (type: string, currency: string) => void;
};

export const useWalletStore = create<WalletStore>()(
  immer((set, get) => ({
    wallet: null,
    fiatWallets: [],
    spotWallets: [],
    ecoWallets: [],
    pnl: null,

    fetchWallets: async () => {
      const { data, error } = await $fetch({
        url: "/api/finance/wallet",
        silent: true,
      });

      if (!error) {
        set((state) => {
          state.fiatWallets = data.FIAT;
          state.spotWallets = data.SPOT;
          state.ecoWallets = data.ECO;
        });
      }
    },

    fetchPnl: async () => {
      const { pnl } = get();
      if (pnl) return;

      const { data, error } = await $fetch({
        url: "/api/finance/wallet?pnl=true",
        silent: true,
      });

      if (!error && data) {
        set((state) => {
          state.pnl = data;
        });
      }
    },

    fetchWallet: async (type: string, currency: string) => {
      const { data, error } = await $fetch({
        url: `/api/finance/wallet/${type}/${currency}`,
        silent: true,
      });

      if (!error) {
        set((state) => {
          state.wallet = data;
        });
      }
    },
  }))
);
