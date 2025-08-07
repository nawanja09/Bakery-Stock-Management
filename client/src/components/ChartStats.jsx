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

const ChartStats = () => {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const totalSalesData = {
    labels,
    datasets: [{
      label: 'Total Sales',
      data: [800, 600, 400, 700, 500, 300, 900],
      backgroundColor: '#4e73df',
    }]
  };

  const openingBalanceData = {
    labels,
    datasets: [{
      label: 'Opening Balance',
      data: [300, 500, 400, 600, 450, 480, 520],
      borderColor: '#f6c23e',
      backgroundColor: '#f6c23e',
      tension: 0.4,
      fill: false,
    }]
  };

  const purchasingData = {
    labels,
    datasets: [{
      label: 'Purchasing',
      data: [200, 350, 300, 400, 390, 370, 420],
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
            <Bar data={totalSalesData} />
        </div>
        <div className="chart-box">
            <h3>Opening Balance</h3>
            <Line data={openingBalanceData} />
        </div>
        <div className="chart-box">
            <h3>Purchasing</h3>
            <Line data={purchasingData} />
        </div>
        </div>

        {/* Second Chart Row (Stacked) */}
        <div className="chart-stats-row">
        <div className="chart-box">
            <h3>Opening Balance vs Purchasing</h3>
            <Bar
            data={{
                labels,
                datasets: [
                {
                    label: 'Opening Balance',
                    data: [300, 500, 400, 600, 450, 480, 520],
                    backgroundColor: '#f6c23e',
                },
                {
                    label: 'Purchasing',
                    data: [200, 350, 300, 400, 390, 370, 420],
                    backgroundColor: '#1cc88a',
                },
                ],
            }}
            options={{
                responsive: true,
                plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false,
                },
                },
                scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                },
                },
            }}
            />
        </div>

        <div className="chart-box">
            <h3>Issues vs Westage</h3>
            <Bar
            data={{
                labels,
                datasets: [
                {
                    label: 'Issues',
                    data: [2, 3, 4, 1, 5, 2, 3],
                    backgroundColor: '#6f42c1',
                },
                {
                    label: 'Westage',
                    data: [1, 2, 2, 1, 2, 3, 2],
                    backgroundColor: '#ff6384',
                },
                ],
            }}
            options={{
                responsive: true,
                plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false,
                },
                },
                scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                },
                },
            }}
            />
        </div>
        </div>
    </>
    );

};

export default ChartStats;
