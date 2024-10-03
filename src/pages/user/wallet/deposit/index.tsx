import React, { useEffect, useState } from "react";
import MinimalLayout from "@/layouts/Minimal";
import MinimalHeader from "@/components/widgets/MinimalHeader";
import { StepProgress } from "@/components/elements/addons/StepProgress";
import { SelectWalletType } from "@/components/pages/user/wallet/deposit/SelectWalletType";
import { SelectCurrency } from "@/components/pages/user/wallet/deposit/SelectCurrency";
import { SelectNetwork } from "@/components/pages/user/wallet/deposit/SelectNetwork";
import { DepositAddress } from "@/components/pages/user/wallet/deposit/DepositAddress";
import { DepositConfirmed } from "@/components/pages/user/wallet/deposit/DepositConfirmed";
import { useDepositStore } from "@/stores/user/wallet/deposit";
import { SelectFiatDepositMethod } from "@/components/pages/user/wallet/deposit/SelectFiatDepositMethod";
import { FiatDepositAmount } from "@/components/pages/user/wallet/deposit/FiatDepositAmount";
import WebSocketManager from "@/utils/ws";
import { useDashboardStore } from "@/stores/dashboard";
import { toast } from "sonner";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import Link from "next/link";
export default function AuthWizard() {
  const { t } = useTranslation();
  const {
    step,
    selectedWalletType,
    depositAddress,
    clearAll,
    transactionSent,
    transactionHash,
    selectedCurrency,
    selectedDepositMethod,
    setDeposit,
    setStep,
    setLoading,
    contractType,
  } = useDepositStore();
  const { profile, getSetting } = useDashboardStore();
  const router = useRouter();
  useEffect(() => {
    if (
      router.isReady &&
      getSetting("depositRestrictions") === "true" &&
      (!profile?.kyc?.status ||
        (parseFloat(profile?.kyc?.level || "0") < 2 &&
          profile?.kyc?.status !== "APPROVED"))
    ) {
      router.push("/user/profile?tab=kyc");
      toast.error(t("Please complete your KYC to deposit funds"));
    }
  }, [router.isReady, profile?.kyc?.status]);
  const [wsManager, setWsManager] = useState<WebSocketManager | null>(null);

  useEffect(() => {
    if (
      selectedWalletType.value !== "FIAT" &&
      step === 4 &&
      profile?.id &&
      depositAddress.address
    ) {
      const wsPath =
        selectedWalletType.value === "ECO"
          ? `/api/ext/ecosystem/deposit?userId=${profile?.id}`
          : `/api/finance/deposit/spot?userId=${profile?.id}`;

      const manager = new WebSocketManager(wsPath);
      manager.connect();

      setWsManager(manager);

      if (selectedWalletType.value === "ECO") {
        manager.on("open", () => {
          manager.send({
            action: "SUBSCRIBE",
            payload: {
              currency: selectedCurrency,
              chain: selectedDepositMethod,
              address: depositAddress.address?.toLowerCase(),
            },
          });
        });
      }
      // Handle incoming messages
      manager.on("message", (message) => {
        if (!message || !message.data || message.stream !== "verification")
          return;
        switch (message.data.status) {
          case 200:
          case 201:
            toast.success(message.data.message);
            setDeposit(message.data);
            setLoading(false);
            setStep(5);
            break;
          case 400:
          case 401:
          case 403:
          case 404:
          case 500:
            setLoading(false);
            toast.error(message.data.message);
            break;
          default:
            break;
        }
      });
      return () => {
        manager.disconnect();
      };
    }
  }, [selectedWalletType.value, step, profile?.id, depositAddress.address]);
  // Handling WebSocket disconnection and sending messages
  useEffect(() => {
    if (wsManager && step === 4 && transactionSent) {
      // Send a subscription message
      wsManager.send({
        action: "SUBSCRIBE",
        payload: {
          trx: transactionHash,
        },
      });
      return () => {
        // Unsubscribe when leaving the step or after confirmation
        wsManager.send({
          action: "UNSUBSCRIBE",
          payload: {
            trx: transactionHash,
          },
        });
      };
    }
  }, [wsManager, step, transactionSent, transactionHash]);
  // Clear all state when leaving the wizard or completing the process
  useEffect(() => {
    // Change this condition as needed to control when to clear
    return () => {
      if (step === 5) {
        clearAll();
      }
    };
  }, [step]);
  return (
    <MinimalLayout title={t("Wizard")} color="muted">
      <main className="relative min-h-screen">
        <MinimalHeader />
        <StepProgress
          step={step}
          icons={[
            "solar:wallet-bold-duotone",
            "ph:currency-dollar-simple-duotone",
            "ph:sketch-logo-duotone",
            "solar:password-minimalistic-input-line-duotone",
            "ph:flag-duotone",
          ]}
        />
        <form
          action="#"
          method="POST"
          className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-stretch pt-36 pb-10"
        >
          {step === 1 && <SelectWalletType />}

          {step === 2 && <SelectCurrency />}

          {step === 3 && selectedWalletType.value === "FIAT" && (
            <SelectFiatDepositMethod />
          )}

          {step === 4 && selectedWalletType.value === "FIAT" && (
            <FiatDepositAmount />
          )}

          {step === 3 && ["ECO", "SPOT"].includes(selectedWalletType.value) && (
            <SelectNetwork />
          )}

          {step === 4 &&
            ["ECO", "SPOT"].includes(selectedWalletType.value) &&
            depositAddress && <DepositAddress />}

          {step === 5 && <DepositConfirmed />}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white shadow-md flex justify-between rounded-t-md items-center flex-col md:flex-row dark:bg-muted-800">
            <p className="text-sm text-center text-gray-500 dark:text-muted-300">
              {t("Please note that depositing funds may take some time.")}
            </p>
            <span
              className="text-sm text-center text-muted-500 dark:text-muted-200 underline cursor-pointer"
              onClick={() => router.back()}
            >
              {t("Cancel")}
            </span>
          </div>
        </form>
      </main>
    </MinimalLayout>
  );
}
