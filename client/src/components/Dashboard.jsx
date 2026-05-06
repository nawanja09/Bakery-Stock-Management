import React, { useState, useEffect } from 'react';
import ChartStats from './ChartStats';
import StatsDashboard from './StatsDashboard';
import './Dashboard.css';
import icon from '../images/icon.jpeg';
import api from '../api';

const Dashboard = () => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch chart data
        const chartsResponse = await api.get('/dashboard/charts');
        setChartData(chartsResponse.data);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      {/* Top Navigation Bar */}
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="header-controls">
          <input type="text" placeholder="Search here..." />
          <span className="notification-icon">&#128276;</span>
          <div className="user-profile">
            <img src={icon} alt="profile" />
            <div>
              <div className="user-name">Office Admin</div>
              <div className="user-role">Admin</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {/* Premium Stats Dashboard Component */}
      <StatsDashboard />

      {/* Chart Stats Section */}       
      {chartData && <ChartStats chartData={chartData} />}

      {/* Footer Section */}
      <footer className="dashboard-footer">
        <p>© {new Date().getFullYear()} Bakery Stock Management System. All rights reserved.</p>
        <p>Developed by <span className="dev-name">Nawanjana Nethmini</span></p>
      </footer>
    </div>
  );
};

export default Dashboard;
