// pages/chart.tsx
import React from "react";
import Layout from "@/layouts/Default";
import { AnalyticsChart } from "@/components/charts/AnalyticsChart";
import { useTranslation } from "next-i18next";
const path = "/admin/finance/order/exchange";
const EcosystemOrdersAnalytics = () => {
  const { t } = useTranslation();
  const availableFilters: AvailableFilters = {
    status: [
      {
        value: "OPEN",
        label: "Open",
        color: "warning",
        icon: "ph:circle",
        path: `${path}?status=OPEN`,
      },
      {
        value: "CLOSED",
        label: "Closed",
        color: "success",
        icon: "ph:check-circle",
        path: `${path}?status=CLOSED`,
      },
      {
        value: "CANCELED",
        label: "Canceled",
        color: "danger",
        icon: "ph:x-circle",
        path: `${path}?status=CANCELED`,
      },
      {
        value: "EXPIRED",
        label: "Expired",
        color: "primary",
        icon: "ph:minus-circle",
        path: `${path}?status=EXPIRED`,
      },
      {
        value: "REJECTED",
        label: "Rejected",
        color: "danger",
        icon: "ph:x-circle",
        path: `${path}?status=REJECTED`,
      },
    ],
    side: [
      {
        value: "BUY",
        label: "Buy",
        color: "success",
        icon: "ph:arrow-up",
        path: `${path}?side=BUY`,
      },
      {
        value: "SELL",
        label: "Sell",
        color: "danger",
        icon: "ph:arrow-down",
        path: `${path}?side=SELL`,
      },
    ],
    type: [
      {
        value: "MARKET",
        label: "Market",
        color: "primary",
        icon: "ph:arrows-left-right",
        path: `${path}?type=MARKET`,
      },
      {
        value: "LIMIT",
        label: "Limit",
        color: "primary",
        icon: "ph:arrows-left-right",
        path: `${path}?type=LIMIT`,
      },
    ],
  };
  return (
    <Layout color="muted" title={t("Ecosystem Orders Analytics")}>
      <AnalyticsChart
        model="exchangeOrder"
        modelName={t("Ecosystem Orders")}
        cardName={t("Orders")}
        availableFilters={availableFilters}
        color="primary"
      />
    </Layout>
  );
};
export default EcosystemOrdersAnalytics;
export const permission = "Access Ecosystem Order Management";
