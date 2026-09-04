import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { formatNumber } from '../utils/formatters';

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const getThemeColor = (varName, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value?.trim() || fallback;
};

const MAX_ITEMS = 8;

/**
 * FG Production module gives per-product recipe cost (from RM ingredients)
 * and selling price (from the Ravon POS). There's no daily output log in
 * this module, so unlike Purchases/Issuance/Wastage this isn't a trend --
 * it's a per-product cost vs. price comparison, which is what the module's
 * data actually supports.
 */
const FgMarginChart = ({ recipes = [], loading }) => {
  const priced = recipes
    .filter(r => r.selling_price !== null && r.selling_price !== undefined && r.rm_cost > 0)
    .sort((a, b) => b.rm_cost - a.rm_cost)
    .slice(0, MAX_ITEMS);

  if (loading) {
    return <div className="chart-loading">Loading FG production costing...</div>;
  }

  if (priced.length === 0) {
    return (
      <div className="chart-loading">
        No FG items have both a recipe cost and a Ravon POS selling price yet.
      </div>
    );
  }

  const primary = getThemeColor('--color-primary', '#2D6CDF');
  const success = getThemeColor('--color-success', '#059669');

  const data = {
    labels: priced.map(r => r.fg_item_name),
    datasets: [
      {
        label: 'RM Cost',
        data: priced.map(r => Number(r.rm_cost.toFixed(2))),
        backgroundColor: primary,
        borderRadius: 4,
        maxBarThickness: 28
      },
      {
        label: 'Selling Price',
        data: priced.map(r => Number(r.selling_price.toFixed(2))),
        backgroundColor: success,
        borderRadius: 4,
        maxBarThickness: 28
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } }
      },
      tooltip: {
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: Rs. ${formatNumber(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
        ticks: { callback: (val) => `Rs. ${formatNumber(val)}` }
      }
    }
  };

  return (
    <div className="trend-chart-box">
      <Bar data={data} options={options} />
    </div>
  );
};

export default FgMarginChart;
