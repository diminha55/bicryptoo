"use client";
import React from "react";
import Layout from "@/layouts/Default";
import { DataTable } from "@/components/elements/base/datatable";
import { useTranslation } from "next-i18next";
const api = "/api/admin/system/log";
const columnConfig: ColumnConfigType[] = [
  // category
  {
    field: "category",
    label: "Category",
    sublabel: "file",
    type: "text",
    sortable: true,
  },
  // timestamp
  {
    field: "timestamp",
    label: "Timestamp",
    type: "datetime",
    sortable: true,
    filterable: false,
  },
  {
    field: "level",
    label: "Level",
    type: "select",
    sortable: true,
    options: [
      {
        label: "Error",
        value: "error",
        color: "danger",
      },
      {
        label: "Warn",
        value: "warn",
        color: "warning",
      },
      {
        label: "Info",
        value: "info",
        color: "info",
      },
      {
        label: "Debug",
        value: "debug",
      },
    ],
  },
  // message
  {
    field: "message",
    label: "Message",
    type: "text",
    sortable: true,
  },
];
const Log = () => {
  const { t } = useTranslation();
  return (
    <Layout title={t("Log Monitor")} color="muted">
      <DataTable
        title={t("Log")}
        endpoint={api}
        columnConfig={columnConfig}
        isParanoid={false}
        canCreate={false}
        canEdit={false}
        canView={false}
        hasStructure={false}
      />
    </Layout>
  );
};
export default Log;
export const permission = "Access Log Monitor";
