import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

// Colors are read from the same CSS custom properties the rest of the app
// uses (index.css) so the chart always matches the current theme instead of
// carrying its own hardcoded palette.
const getThemeColor = (varName, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value?.trim() || fallback;
};

/**
 * Single consolidated trend chart: purchases vs issues vs wastage over the
 * last N days. Replaces the previous 5-panel layout (which duplicated the
 * "Purchasing" series as both a line and a bar chart with off-theme colors).
 */
const ChartStats = ({ chartData }) => {
  const { purchasingData, issuesVsWastageData } = chartData;

  const labels = issuesVsWastageData.labels?.length
    ? issuesVsWastageData.labels
    : purchasingData.labels;

  const primary = getThemeColor('--color-primary', '#2D6CDF');
  const success = getThemeColor('--color-success', '#059669');
  const danger = getThemeColor('--color-danger', '#dc2626');

  const alignToLabels = (sourceLabels, sourceData) =>
    labels.map(label => {
      const idx = sourceLabels.indexOf(label);
      return idx !== -1 ? sourceData[idx] : 0;
    });

  const data = {
    labels,
    datasets: [
      {
        label: 'Purchases',
        data: alignToLabels(purchasingData.labels, purchasingData.data),
        borderColor: primary,
        backgroundColor: `${primary}1a`,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true
      },
      {
        label: 'Issues',
        data: issuesVsWastageData.issues,
        borderColor: success,
        backgroundColor: `${success}1a`,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true
      },
      {
        label: 'Wastage',
        data: issuesVsWastageData.wastage,
        borderColor: danger,
        backgroundColor: `${danger}1a`,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } }
      },
      tooltip: { padding: 10, cornerRadius: 8 }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.18)' } }
    }
  };

  return (
    <div className="trend-chart-box">
      <Line data={data} options={options} />
    </div>
  );
};

export default ChartStats;
