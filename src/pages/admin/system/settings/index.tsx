import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "@/layouts/Default";
import { useDashboardStore } from "@/stores/dashboard";
import { BackButton } from "@/components/elements/base/button/BackButton";
import $fetch from "@/utils/api";
import { imageUploader } from "@/utils/upload";
import { useTranslation } from "next-i18next";
import Tabs from "@/components/pages/admin/settings/Tabs";
import RestrictionsSection from "@/components/pages/admin/settings/section/Restrictions";
import WalletSection from "@/components/pages/admin/settings/section/Wallet";
import LogosSection from "@/components/pages/admin/settings/section/Logo";
import InvestmentSection from "@/components/pages/admin/settings/section/Investment";
import P2PSection from "@/components/pages/admin/settings/section/P2P";
import AffiliateSection from "@/components/pages/admin/settings/section/Affiliate";

const initialFormData = {
  tradeRestrictions: false,
  binaryRestrictions: false,
  forexRestrictions: false,
  botRestrictions: false,
  icoRestrictions: false,
  mlmRestrictions: false,
  walletRestrictions: false,
  depositRestrictions: false,
  withdrawalRestrictions: false,
  ecommerceRestrictions: false,
  stakingRestrictions: false,
  depositExpiration: false,
  fiatWallets: false,
  deposit: false,
  withdraw: false,
  transfer: false,
  logo: null,
  cardLogo: null,
  darkLogo: null,
  fullLogo: null,
  darkFullLogo: null,
  appleIcon57: null,
  appleIcon60: null,
  appleIcon72: null,
  appleIcon76: null,
  appleIcon114: null,
  appleIcon120: null,
  appleIcon144: null,
  appleIcon152: null,
  appleIcon180: null,
  androidIcon192: null,
  favicon32: null,
  favicon96: null,
  favicon16: null,
  msIcon144: null,
  mlmSystem: "DIRECT",
  binaryLevels: 2,
  unilevelLevels: 2,
};

const SystemSettings = () => {
  const { t } = useTranslation();
  const { settings, isFetched } = useDashboardStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [originalData, setOriginalData] = useState(initialFormData);
  const [changes, setChanges] = useState({});
  const [mainTab, setMainTab] = useState("RESTRICTIONS");
  const [shouldSave, setShouldSave] = useState(false);

  const initializeFormData = useCallback((settings) => {
    const newFormData = { ...settings };
    if (settings.mlmSettings) {
      const mlmSettings = JSON.parse(settings.mlmSettings);
      if (mlmSettings.binary) {
        newFormData.binaryLevels = mlmSettings.binary.levels;
        if (mlmSettings.binary.levelsPercentage) {
          for (const level of mlmSettings.binary.levelsPercentage) {
            newFormData[`binaryLevel${level.level}`] = level.value;
          }
        } else {
          console.warn("mlmSettings.binary.levelsPercentage is undefined");
        }
      } else if (mlmSettings.unilevel) {
        newFormData.unilevelLevels = mlmSettings.unilevel.levels;
        if (mlmSettings.unilevel.levelsPercentage) {
          for (const level of mlmSettings.unilevel.levelsPercentage) {
            newFormData[`unilevelLevel${level.level}`] = level.value;
          }
        } else {
          console.warn("mlmSettings.unilevel.levelsPercentage is undefined");
        }
      }
    }

    setFormData(newFormData);
    setOriginalData(newFormData);
  }, []);

  useEffect(() => {
    if (isFetched && settings && router.isReady) {
      initializeFormData(settings);
    }
  }, [isFetched, settings, router.isReady, initializeFormData]);

  useEffect(() => {
    const { tab } = router.query;
    if (tab) {
      const mainTab = Array.isArray(tab) ? tab[0] : tab;
      setMainTab(mainTab.toUpperCase());
    }
  }, [router.query]);

  useEffect(() => {
    if (shouldSave) {
      handleSave();
      setShouldSave(false);
    }
  }, [shouldSave]);

  const handleInputChange = ({ name, value, save = false }) => {
    const updatedFormData = { ...formData, [name]: value };
    setFormData(updatedFormData);
    setChanges((prevChanges) => ({ ...prevChanges, [name]: value }));
    if (save) setShouldSave(true);
  };

  const handleFileChange = async (files, field) => {
    if (files.length > 0) {
      const file = files[0];
      try {
        const uploadResult = await imageUploader({
          file,
          dir: field.dir,
          size: field.size,
          oldPath: formData[field.name] || undefined,
        });
        if (uploadResult.success) {
          handleInputChange({
            name: field.name,
            value: uploadResult.url,
            save: true,
          });
        }
      } catch (error) {
        console.error("File upload failed", error);
      }
    }
  };

  const handleCancel = () => {
    setFormData(originalData);
    setChanges({});
  };

  const handleSave = async () => {
    setIsLoading(true);

    const mlmSettings =
      formData.mlmSystem === "BINARY"
        ? {
            binary: {
              levels: formData.binaryLevels,
              levelsPercentage: Array.from(
                { length: formData.binaryLevels },
                (_, i) => ({
                  level: i + 1,
                  value: formData[`binaryLevel${i + 1}`] || 0,
                })
              ),
            },
          }
        : {
            unilevel: {
              levels: formData.unilevelLevels,
              levelsPercentage: Array.from(
                { length: formData.unilevelLevels },
                (_, i) => ({
                  level: i + 1,
                  value: formData[`unilevelLevel${i + 1}`] || 0,
                })
              ),
            },
          };

    const newSettings = {
      ...formData,
      mlmSettings: JSON.stringify(mlmSettings),
    };

    try {
      const { error } = await $fetch({
        url: "/api/admin/system/settings",
        method: "PUT",
        body: newSettings,
      });

      if (!error) {
        setOriginalData(formData);
        setChanges({});
      }
    } catch (error) {
      console.error("Failed to save settings", error);
    }
    setIsLoading(false);
  };

  const hasChanges = Object.keys(changes).length > 0;

  if (!settings) return null;

  const renderSection = () => {
    const sectionProps = {
      formData,
      handleInputChange,
      handleCancel,
      handleSave,
      hasChanges,
      isLoading,
    };

    switch (mainTab) {
      case "RESTRICTIONS":
        return <RestrictionsSection {...sectionProps} />;
      case "WALLET":
        return <WalletSection {...sectionProps} />;
      case "LOGOS":
        return (
          <LogosSection
            formData={formData}
            handleInputChange={handleInputChange}
            handleFileChange={handleFileChange}
          />
        );
      case "INVEST":
        return <InvestmentSection {...sectionProps} />;
      case "P2P":
        return <P2PSection {...sectionProps} />;
      case "AFFILIATE":
        return <AffiliateSection {...sectionProps} />;
      default:
        return null;
    }
  };

  return (
    <Layout title={t("System Settings")} color="muted">
      <main className="mx-auto max-w-7xl">
        <div className="mb-12 flex items-center justify-between">
          <h2 className="font-sans text-2xl font-light leading-[1.125] text-muted-800 dark:text-muted-100">
            {t("Settings")}
          </h2>
          <BackButton href="/admin/dashboard" />
        </div>
        <div className="w-full h-full flex flex-col">
          <Tabs mainTab={mainTab} setMainTab={setMainTab} />
          <div className="w-full flex p-4 flex-col h-full">
            {renderSection()}
          </div>
        </div>
      </main>
    </Layout>
  );
};

export default SystemSettings;
export const permission = "Access System Settings Management";
