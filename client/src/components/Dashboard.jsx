import React, { useState, useEffect } from 'react';
import ChartStats from './ChartStats';
import './Dashboard.css';
import icon from '../images/icon.jpeg';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalSales: 0,
    openingBalance: 0,
    purchasing: 0,
    issues: 0
  });
  
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats
        const statsResponse = await fetch('/api/dashboard/stats');
        const statsData = await statsResponse.json();
        setStats(statsData);
        
        // Fetch chart data
        const chartsResponse = await fetch('/api/dashboard/charts');
        const chartsData = await chartsResponse.json();
        setChartData(chartsData);
        
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
        <div className="stat-card sales-card">
          <div className="stat-header">
            <div className="stat-icon">&#128200;</div>
            <div className="stat-title">Total Sales</div>
          </div>
          <div className="stat-value">${(stats.totalSales || 0).toLocaleString()}</div>
          <div className="stat-change positive">+95% from yesterday</div>
        </div>
        
        <div className="stat-card balance-card">
          <div className="stat-header">
            <div className="stat-icon">&#128176;</div>
            <div className="stat-title">Opening Balance</div>
          </div>
          <div className="stat-value">{(stats.openingBalance || 0).toLocaleString()}</div>
          <div className="stat-change positive">+125% from yesterday</div>
        </div>
        
        <div className="stat-card purchasing-card">
          <div className="stat-header">
            <div className="stat-icon">&#128722;</div>
            <div className="stat-title">Purchasing</div>
          </div>
          <div className="stat-value">{stats.purchasing || 0}</div>
          <div className="stat-change positive">+125% from yesterday</div>
        </div>
        
        <div className="stat-card issues-card">
          <div className="stat-header">
            <div className="stat-icon">&#9888;</div>
            <div className="stat-title">Issues</div>
          </div>
          <div className="stat-value">{stats.issues || 0}</div>
          <div className="stat-change neutral">0.75% from yesterday</div>
        </div>
      </div>

      {/* Chart Stats Section */}
      {chartData && <ChartStats chartData={chartData} />}
    </div>
  );
};

export default Dashboard;