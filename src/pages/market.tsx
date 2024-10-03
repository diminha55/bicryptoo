import Layout from "@/layouts/Default";
import React from "react";
import Markets from "@/components/pages/user/markets/Markets";
import { useTranslation } from "next-i18next";
const MarketsPage = () => {
  const { t } = useTranslation();
  return (
    <Layout title={t("Markets")} color="muted">
      <Markets />
    </Layout>
  );
};
export default MarketsPage;
