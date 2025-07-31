//client/src/components/Dashboard/Dashboard.jsx

import React, { useEffect } from 'react';
import NavigationBar from './NavigationBar';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();

  // Check authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (!token || !user) {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="dashboard-container">
      <NavigationBar />
      <div className="main-content">
        <h2>Bakery Management System Dashboard</h2>
      </div>
    </div>
  );
};

export default Dashboard;