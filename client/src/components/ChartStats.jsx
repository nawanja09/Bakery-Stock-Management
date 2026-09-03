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
    openingBalanceData,
    purchasingData,
    issuesVsWastageData
  } = chartData;

  // Get last 7 days - align using common labels
  const commonLabels = openingBalanceData.labels.slice(-7); 

  const last7PurchasingData = commonLabels.map(label => {
    const idx = purchasingData.labels.indexOf(label);
    return idx !== -1 ? purchasingData.data[idx] : 0;
  });

  // Issues vs Wastage
  const last7IssuesLabels = issuesVsWastageData.labels.slice(-7);
  const last7IssuesData = issuesVsWastageData.issues.slice(-7);
  const last7WastageData = issuesVsWastageData.wastage.slice(-7);


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
          <h3>Purchasing</h3>
          <Line data={purchasingChart} />
        </div>
        <div className="chart-box">
          <h3>Issues</h3>
          <Line data={{
            labels: last7IssuesLabels,
            datasets: [{
              label: 'Issues',
              data: last7IssuesData,
              borderColor: '#2D6CDF',
              backgroundColor: '#2D6CDF',
              tension: 0.4,
              fill: false,
            }]
          }} />
        </div>
        <div className="chart-box">
          <h3>Wastage</h3>
          <Line data={{
            labels: last7IssuesLabels,
            datasets: [{
              label: 'Wastage',
              data: last7WastageData,
              borderColor: '#ff6384',
              backgroundColor: '#ff6384',
              tension: 0.4,
              fill: false,
            }]
          }} />
        </div>
      </div>

      {/* Second Chart Row */}
      <div className="chart-stats-row">
        <div className="chart-box">
          <h3>Purchasing</h3>
          <Bar
            data={{
              labels: commonLabels,
              datasets: [
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
                  backgroundColor: '#2D6CDF',
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
