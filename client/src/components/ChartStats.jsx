import React from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ChartStats = ({ chartData }) => {
  const {
    totalSalesData,
    openingBalanceData,
    purchasingData,
    issuesVsWastageData
  } = chartData;

  // Get last 7 days for Opening Balance and Purchasing
  const last7OpeningLabels = openingBalanceData.labels.slice(-7);
  const last7OpeningData = openingBalanceData.data.slice(-7);
  const last7PurchasingLabels = purchasingData.labels.slice(-7);
  const last7PurchasingData = purchasingData.data.slice(-7);

  // Get last 7 days for Issues vs Wastage
  const last7IssuesLabels = issuesVsWastageData.labels.slice(-7);
  const last7IssuesData = issuesVsWastageData.issues.slice(-7);
  const last7WastageData = issuesVsWastageData.wastage.slice(-7);

  const totalSalesChart = {
    labels: totalSalesData.labels,
    datasets: [{
      label: 'Total Sales',
      data: totalSalesData.data,
      backgroundColor: '#4e73df',
    }]
  };

  const openingBalanceChart = {
    labels: openingBalanceData.labels,
    datasets: [{
      label: 'Opening Balance',
      data: openingBalanceData.data,
      borderColor: '#f6c23e',
      backgroundColor: '#f6c23e',
      tension: 0.4,
      fill: false,
    }]
  };

  const purchasingChart = {
    labels: purchasingData.labels,
    datasets: [{
      label: 'Purchasing',
      data: purchasingData.data,
      borderColor: '#1cc88a',
      backgroundColor: '#1cc88a',
      tension: 0.4,
      fill: false,
    }]
  };

  return (
    <>
      {/* First Chart Row */}
      <div className="chart-stats-row">
        <div className="chart-box">
          <h3>Total Sales</h3>
          <Bar data={totalSalesChart} />
        </div>
        <div className="chart-box">
          <h3>Opening Balance</h3>
          <Line data={openingBalanceChart} />
        </div>
        <div className="chart-box">
          <h3>Purchasing</h3>
          <Line data={purchasingChart} />
        </div>
      </div>

      {/* Second Chart Row */}
      <div className="chart-stats-row">
        <div className="chart-box">
          <h3>Opening Balance vs Purchasing</h3>
          <Bar
            data={{
              labels: last7OpeningLabels,
              datasets: [
                {
                  label: 'Opening Balance',
                  data: last7OpeningData,
                  backgroundColor: '#f6c23e',
                },
                {
                  label: 'Purchasing',
                  data: last7PurchasingData,
                  backgroundColor: '#1cc88a',
                },
              ],
            }}
            options={{
              responsive: true,
              scales: {
                x: { stacked: true },
                y: { stacked: true }
              }
            }}
          />
        </div>

        <div className="chart-box">
          <h3>Issues vs Wastage</h3>
          <Bar
            data={{
              labels: last7IssuesLabels,
              datasets: [
                {
                  label: 'Issues',
                  data: last7IssuesData,
                  backgroundColor: '#6f42c1',
                },
                {
                  label: 'Wastage',
                  data: last7WastageData,
                  backgroundColor: '#ff6384',
                },
              ],
            }}
            options={{
              responsive: true,
              scales: {
                x: { stacked: true },
                y: { stacked: true }
              }
            }}
          />
        </div>
      </div>
    </>
  );
};

export default ChartStats;