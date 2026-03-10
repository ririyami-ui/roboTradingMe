// src/components/CoinChart.jsx
import React from "react";
import { Line } from "react-chartjs-2";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/**
 * Komponen presentasional untuk menampilkan grafik.
 * @param {{loading: boolean, chartData: object}} props
 */
export default function CoinChart({ loading, chartData }) {
  if (loading) return <div>Loading chart...</div>;
  if (!chartData) return <div>No data</div>;

  const options = {
    maintainAspectRatio: false,
    responsive: true,
  };

  return <Line data={chartData} options={options} />;
}
