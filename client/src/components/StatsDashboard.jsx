import React, { useState, useEffect } from 'react';
import api from '../api';
import './StatsDashboard.css';
import { formatNumber } from '../utils/formatters';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faReceipt, faCoins, faBoxOpen } from '@fortawesome/free-solid-svg-icons';

const StatsDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get('/stats');
        setStats(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="stats-loading-container">
        <div className="stats-skeleton-row">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stats-skeleton-card"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="stats-error-message">{error}</div>;
  }

  const statItems = [
    {
      label: 'Total Users',
      value: stats?.users || 0,
      icon: faUsers,
      color: 'blue',
    },
    {
      label: 'Total Orders',
      value: stats?.orders || 0,
      icon: faReceipt,
      color: 'green',
    },
    {
      label: 'Revenue',
      value: stats?.revenue || 0,
      icon: faCoins,
      color: 'cyan',
    },
    {
      label: 'Products',
      value: stats?.products || 0,
      icon: faBoxOpen,
      color: 'amber',
    },
  ];

  return (
    <div className="stats-dashboard-wrapper">
      <div className="stats-grid">
        {statItems.map((item, index) => (
          <div key={index} className={`stat-premium-card ${item.color}`}>
            <div className="stat-card-content">
              <div className="stat-card-info">
                <p className="stat-label">{item.label}</p>
                <h3 className="stat-value">{item.label === 'Revenue' ? `Rs. ${formatNumber(item.value)}` : formatNumber(item.value)}</h3>
              </div>
              <div className="stat-card-icon-wrapper">
                <FontAwesomeIcon className="stat-icon-large" icon={item.icon} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsDashboard;
