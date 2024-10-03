"use client";
import React from "react";
import Layout from "@/layouts/Default";
import { DataTable } from "@/components/elements/base/datatable";
import { useTranslation } from "next-i18next";
const api = "/api/admin/api-keys";
const columnConfig = [
  {
    field: "key",
    label: "API Key",
    type: "text",
    sortable: true,
  },
  {
    field: "user",
    label: "Author",
    sublabel: "user.email",
    type: "text",
    getValue: (item) => `${item.user?.firstName} ${item.user?.lastName}`,
    getSubValue: (item) => item.user?.email,
    path: "/admin/crm/user?email=[user.email]",
    sortable: true,
    sortName: "user.firstName",
    hasImage: true,
    imageKey: "user.avatar",
    placeholder: "/img/avatars/placeholder.webp",
    className: "rounded-full",
  },
  {
    field: "createdAt",
    label: "Created At",
    type: "date",
    filterable: false,
    sortable: true,
  },
];
const ApiKeys = () => {
  const { t } = useTranslation();
  return (
    <Layout title={t("API Keys")} color="muted">
      <DataTable
        title={t("API Keys")}
        endpoint={api}
        columnConfig={columnConfig}
      />
    </Layout>
  );
};
export default ApiKeys;
export const permission = "Access API Key Management";
