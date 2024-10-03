import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import $fetch from "@/utils/api";
import { toast } from "sonner";

type WalletType = {
  value: string;
  label: string;
};

type Currency = any;

type TransferStore = {
  step: number;
  loading: boolean;

  walletTypes: WalletType[];
  selectedWalletType: WalletType;
  selectedTargetWalletType: WalletType;

  currencies: Record<string, Currency[]>;
  selectedCurrency: string;
  selectedTargetCurrency: string;

  transferAmount: number;
  transfer: any;

  setStep: (step: number) => void;
  setLoading: (loading: boolean) => void;
  clearAll: () => void;

  setSelectedWalletType: (walletType: WalletType) => void;
  setSelectedTargetWalletType: (walletType: WalletType) => void;

  fetchCurrencies: () => void;
  setSelectedCurrency: (currency: string) => void;
  setSelectedTargetCurrency: (currency: string) => void;

  setTransferAmount: (amount: number) => void;
  handleTransfer: () => void;
  setTransfer: (transfer: any) => void;
};

const endpoint = "/api/finance";

export const useTransferStore = create<TransferStore>()(
  immer((set, get) => ({
    step: 1,
    loading: false,
    walletTypes: [
      { value: "FIAT", label: "Fiat" },
      { value: "SPOT", label: "Spot" },
      { value: "ECO", label: "Funding" },
    ],
    selectedWalletType: { value: "", label: "Select a wallet type" },
    selectedTargetWalletType: { value: "", label: "Select a wallet type" },

    currencies: {
      from: [],
      to: [],
    },
    selectedCurrency: "Select a currency",
    selectedTargetCurrency: "Select a currency",

    transferAmount: 0,
    transfer: null,

    setStep: (step) =>
      set((state) => {
        state.step = step;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.loading = loading;
      }),

    clearAll: () =>
      set(() => ({
        step: 1,
        selectedWalletType: { value: "", label: "Select a wallet type" },
        selectedTargetWalletType: {
          value: "",
          label: "Select a wallet type",
        },
        currencies: {
          from: [],
          to: [],
        },
        selectedCurrency: "Select a currency",
        selectedTargetCurrency: "Select a currency",
        transferAmount: 0,
        loading: false,
        transfer: null,
      })),

    setSelectedWalletType: (walletType) =>
      set((state) => {
        state.selectedWalletType = walletType;
      }),

    setSelectedTargetWalletType: (walletType) =>
      set((state) => {
        state.selectedTargetWalletType = walletType;
      }),

    fetchCurrencies: async () => {
      const { selectedWalletType, selectedTargetWalletType } = get();
      try {
        const { data, error } = await $fetch({
          url: `${endpoint}/currency?action=transfer&walletType=${selectedWalletType.value}&targetWalletType=${selectedTargetWalletType.value}`,
          silent: true,
        });

        if (error) {
          toast.error("An error occurred while fetching currencies");
          set((state) => {
            state.step = 1;
          });
        } else {
          set((state) => {
            state.currencies = data;
            state.step = 3;
          });
        }
      } catch (error) {
        console.error("Error in fetching currencies:", error);
        toast.error("An error occurred while fetching currencies");
      }
    },

    setSelectedCurrency: (currency) =>
      set((state) => {
        state.selectedCurrency = currency;
      }),
    setSelectedTargetCurrency: (currency) =>
      set((state) => {
        state.selectedTargetCurrency = currency;
      }),

    setTransferAmount: (amount) =>
      set((state) => {
        state.transferAmount = amount;
      }),

    setTransfer: (transfer) =>
      set((state) => {
        state.transfer = transfer;
      }),

    handleTransfer: async () => {
      const {
        selectedWalletType,
        selectedTargetWalletType,
        selectedCurrency,
        selectedTargetCurrency,
        transferAmount,
        setLoading,
      } = get();
      setLoading(true);

      const url = `${endpoint}/transfer`;

      const { data, error } = await $fetch({
        url,
        silent: true,
        method: "POST",
        body: {
          fromType: selectedWalletType.value,
          toType: selectedTargetWalletType.value,
          fromCurrency: selectedCurrency,
          toCurrency: selectedTargetCurrency,
          amount: transferAmount,
        },
      });

      if (!error) {
        set((state) => {
          state.transfer = data;
          state.step = 5;
        });
      } else {
        toast.error(error || "An unexpected error occurred");
      }
      setLoading(false);
    },
  }))
);
