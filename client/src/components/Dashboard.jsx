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
    return <div className="panel-card" style={{ padding: '1.25rem' }}>Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container page-shell">
      <section className="dashboard-header" aria-label="Dashboard overview">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Operational insights at a glance for the bakery team.</p>
        </div>
        <div className="header-controls">
          <input type="text" placeholder="Search here..." aria-label="Search dashboard" />
          <span className="notification-icon" aria-label="Notifications">🔔</span>
          <div className="user-profile">
            <img src={icon} alt="profile" />
            <div>
              <div className="user-name">Office Admin</div>
              <div className="user-role">Admin</div>
            </div>
          </div>
        </div>
      </section>

      <StatsDashboard />

      {chartData && <ChartStats chartData={chartData} />}

      <footer className="dashboard-footer">
        <p>© {new Date().getFullYear()} Bakery Stock Management System. All rights reserved.</p>
        <p>Developed by <span className="dev-name">Nawanjana Nethmini</span></p>
      </footer>
    </div>
  );
};

export default Dashboard;
