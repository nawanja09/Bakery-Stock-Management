import React, { useState, useEffect } from 'react';
import ChartStats from './ChartStats';
import './Dashboard.css';
import icon from '../images/icon.jpeg';
import api from '../api';

const Dashboard = () => {
  const [stats, setStats] = useState({
    openingBalance: 0,
    purchasing: 0,
    issues: 0,
    wastage: 0
  });
  
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats
        const statsResponse = await api.get('/dashboard/stats');
        setStats(statsResponse.data);

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
      <div className="stats-container">
        <div className="stat-card balance-card">
          <div className="stat-header">
            <div className="stat-icon">&#128176;</div>
            <div className="stat-title">Opening Balance</div>
          </div>
          <div className="stat-value">Rs. {stats.openingBalance.toLocaleString()}</div>
          <div className="stat-change positive"></div>
        </div>

        <div className="stat-card purchasing-card">
          <div className="stat-header">
            <div className="stat-icon">&#128722;</div>
            <div className="stat-title">Purchasing</div>
          </div>
          <div className="stat-value">{stats.purchasing.toLocaleString()}</div>
          <div className="stat-change positive"></div>
        </div>

        <div className="stat-card issues-card">
          <div className="stat-header">
            <div className="stat-icon">&#9888;</div>
            <div className="stat-title">Issues</div>
          </div>
          <div className="stat-value">{stats.issues.toLocaleString()}</div>
          <div className="stat-change neutral"></div>
        </div>

        <div className="stat-card wastage-card">
          <div className="stat-header">
            <div className="stat-icon">&#128200;</div>
            <div className="stat-title">Wastage</div>
          </div>
          <div className="stat-value">{stats.wastage.toLocaleString()}</div>
          <div className="stat-change positive"></div>
        </div>
      </div>

      {/* Chart Stats Section */}
      {chartData && <ChartStats chartData={chartData} />}
    </div>
  );
};

export default Dashboard;