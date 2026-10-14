import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip
} from 'chart.js';
import { formatNumber } from '../utils/formatters';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const getThemeColor = (varName, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value?.trim() || fallback;
};

const TopItemsChart = ({ items, loading, type }) => {
  if (loading) return <div className="chart-loading">Loading item quantities...</div>;
  if (!items.length) return <div className="chart-loading">No {type} item activity in this period.</div>;

  const primary = getThemeColor('--color-primary', '#355872');
  const data = {
    labels: items.map(item => item.itemName),
    datasets: [{
      label: type === 'issued' ? 'Issued quantity' : 'Wasted quantity',
      data: items.map(item => item.quantity),
      backgroundColor: `${primary}cc`,
      borderColor: primary,
      borderWidth: 1,
      borderRadius: 5,
      barThickness: 22
    }]
  };

  const unit = items.every(item => item.unit === items[0].unit) ? items[0].unit : '';
  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: context => `${formatNumber(context.parsed.x)} ${items[context.dataIndex].unit}` }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
        ticks: { callback: value => `${formatNumber(value)}${unit ? ` ${unit}` : ''}` }
      },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } }
    }
  };

  return <div className="top-items-chart-box"><Bar data={data} options={options} /></div>;
};

export default TopItemsChart;