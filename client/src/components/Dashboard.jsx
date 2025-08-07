// src/components/Dashboard/Dashboard.jsx
import React from 'react';
import ChartStats from './ChartStats';
import './Dashboard.css';
import icon from '../images/icon.jpeg';

const Dashboard = () => {
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
          <div className="stat-value">$1k</div>
          <div className="stat-change positive">+95% from yesterday</div>
        </div>
        
        <div className="stat-card balance-card">
          <div className="stat-header">
            <div className="stat-icon">&#128176;</div>
            <div className="stat-title">Opening Balance</div>
          </div>
          <div className="stat-value">300</div>
          <div className="stat-change positive">+125% from yesterday</div>
        </div>
        
        <div className="stat-card purchasing-card">
          <div className="stat-header">
            <div className="stat-icon">&#128722;</div>
            <div className="stat-title">Purchasing</div>
          </div>
          <div className="stat-value">5</div>
          <div className="stat-change positive">+125% from yesterday</div>
        </div>
        
        <div className="stat-card issues-card">
          <div className="stat-header">
            <div className="stat-icon">&#9888;</div>
            <div className="stat-title">Issues</div>
          </div>
          <div className="stat-value">8</div>
          <div className="stat-change neutral">0.75% from yesterday</div>
        </div>
      </div>

      {/* Chart Stats Section */}
      <ChartStats />
    </div>
  );
};

export default Dashboard;