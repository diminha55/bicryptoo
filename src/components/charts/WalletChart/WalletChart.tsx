import { memo } from "react";
import dynamic from "next/dynamic";
import { themeColors } from "@/components/charts/chart-colors";
import { ApexOptions } from "apexcharts";
import { format, parseISO, isValid } from "date-fns"; // Import isValid from date-fns

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const WalletChartBase = ({ data }) => {
  if (!data) return null;
  // Validate and prepare chart data
  const validData = data.filter(
    (item) =>
      item.FIAT != null && item.SPOT != null && item.ECO != null && item.date
  );

  // Adjust series to handle FIAT, SPOT, and ECO
  const series = [
    {
      name: "Fiat",
      data: validData.map((item) => item.FIAT),
    },
    {
      name: "Spot",
      data: validData.map((item) => item.SPOT),
    },
    {
      name: "Funding",
      data: validData.map((item) => item.ECO),
    },
  ];

  const chartOptions: ApexOptions = {
    series: series,
    chart: {
      height: 300,
      type: "area",
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
      },
    },
    colors: [themeColors.blue, themeColors.green, themeColors.orange],
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 2,
      curve: "smooth",
    },
    fill: {
      type: "gradient",
    },
    grid: {
      row: {
        colors: ["transparent", "transparent"],
        opacity: 0.5,
      },
    },
    yaxis: {
      opposite: true,
      labels: {
        formatter: function (val) {
          return `$${val}`;
        },
      },
    },
    xaxis: {
      categories: validData.map((item) => {
        const date = parseISO(item.date);
        return isValid(date) ? format(date, "MM-dd") : "Invalid date";
      }),
    },
  };

  return (
    <Chart options={chartOptions} series={series} type="area" height={300} />
  );
};

export const WalletChart = memo(WalletChartBase);