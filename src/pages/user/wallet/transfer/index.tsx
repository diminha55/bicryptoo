import React, { useEffect } from "react";
import MinimalLayout from "@/layouts/Minimal";
import MinimalHeader from "@/components/widgets/MinimalHeader";
import { StepProgress } from "@/components/elements/addons/StepProgress";
import { SelectWalletType } from "@/components/pages/user/wallet/transfer/SelectWalletType";
import { SelectCurrency } from "@/components/pages/user/wallet/transfer/SelectCurrency";
import { useTransferStore } from "@/stores/user/wallet/transfer";
import { TransferConfirmed } from "@/components/pages/user/wallet/transfer/TransferConfirmed";
import { TransferAmount } from "@/components/pages/user/wallet/transfer/TransferAmount";
import { SelectTargetWalletType } from "@/components/pages/user/wallet/transfer/SelectTargetWalletType";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useDashboardStore } from "@/stores/dashboard";
import { toast } from "sonner";
import Link from "next/link";
export default function AuthWizard() {
  const { t } = useTranslation();
  const { step, clearAll } = useTransferStore();
  const { profile, getSetting } = useDashboardStore();
  const router = useRouter();
  useEffect(() => {
    if (
      router.isReady &&
      getSetting("transferRestrictions") === "true" &&
      (!profile?.kyc?.status ||
        (parseFloat(profile?.kyc?.level || "0") < 2 &&
          profile?.kyc?.status !== "APPROVED"))
    ) {
      router.push("/user/profile?tab=kyc");
      toast.error(t("Please complete your KYC to transfer funds"));
    }
  }, [router.isReady, profile?.kyc?.status]);
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
          className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-stretch pt-36"
        >
          {step === 1 && <SelectWalletType />}
          {step === 2 && <SelectTargetWalletType />}

          {step === 3 && <SelectCurrency />}

          {step === 4 && <TransferAmount />}

          {step === 5 && <TransferConfirmed />}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white shadow-md flex justify-between rounded-t-md items-center flex-col md:flex-row dark:bg-muted-800">
            <p className="text-sm text-center text-gray-500 dark:text-muted-300">
              {t("Please note that transferring funds may take some time.")}
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
