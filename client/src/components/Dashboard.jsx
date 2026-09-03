import React, { useEffect, useState } from 'react';
import ChartStats from './ChartStats';
import StatsDashboard from './StatsDashboard';
import './Dashboard.css';
import api from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxesStacked, faArrowTrendUp, faArrowRightArrowLeft, faTriangleExclamation, faChartLine } from '@fortawesome/free-solid-svg-icons';

const operationalCards = [
  { key: 'openingBalance', label: 'Opening balance', icon: faBoxesStacked, tone: 'blue', format: value => Number(value || 0).toLocaleString() },
  { key: 'purchasing', label: 'Purchases - 7 days', icon: faArrowTrendUp, tone: 'green', format: value => Number(value || 0).toLocaleString() },
  { key: 'issues', label: 'Issues - 7 days', icon: faArrowRightArrowLeft, tone: 'cyan', format: value => Number(value || 0).toLocaleString() },
  { key: 'wastage', label: 'Wastage - 7 days', icon: faTriangleExclamation, tone: 'amber', format: value => Number(value || 0).toLocaleString() }
];

const emptyChartData = {
  openingBalanceData: { labels: [], data: [] },
  purchasingData: { labels: [], data: [] },
  issuesVsWastageData: { labels: [], issues: [], wastage: [] }
};

const Dashboard = () => {
  const [operationalStats, setOperationalStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [statsResponse, chartsResponse] = await Promise.all([
          api.get('/dashboard/dashboard/stats'),
          api.get('/dashboard/charts')
        ]);
        if (!active) return;
        setOperationalStats(statsResponse.data || {});
        setChartData(chartsResponse.data || emptyChartData);
        setError('');
      } catch (err) {
        if (active) setError('Unable to load operational dashboard data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => { active = false; };
  }, []);

  return (
    <div className="dashboard-container page-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Bakery operations</p>
          <h1>Dashboard</h1>
          <p className="page-subtitle">A focused view of stock movement, purchasing, and sales activity.</p>
        </div>
        <div className="dashboard-date">
          <span className="dashboard-date-label">Today</span>
          <strong>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
        </div>
      </header>

      {error && <div className="dashboard-error" role="alert">{error}</div>}

      <section className="dashboard-section" aria-labelledby="operational-heading">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Operational pulse</p>
            <h2 id="operational-heading">Stock movement</h2>
          </div>
          <span className="section-caption">Last 7 days</span>
        </div>
        <div className="operational-grid">
          {operationalCards.map(card => (
            <article className={`operational-card tone-${card.tone}`} key={card.key}>
              <div className="operational-card-top">
                <span className="operational-label">{card.label}</span>
                <span className="operational-icon"><FontAwesomeIcon icon={card.icon} /></span>
              </div>
              <strong className="operational-value">
                {loading ? <span className="dashboard-value-skeleton" /> : card.format(operationalStats?.[card.key])}
              </strong>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="snapshot-heading">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Business snapshot</p>
            <h2 id="snapshot-heading">Sales and inventory overview</h2>
          </div>
          <FontAwesomeIcon className="section-heading-icon" icon={faChartLine} aria-hidden="true" />
        </div>
        <StatsDashboard />
      </section>

      <section className="dashboard-section chart-section" aria-labelledby="trend-heading">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Activity trends</p>
            <h2 id="trend-heading">Movement across the week</h2>
          </div>
          <span className="section-caption">Live system data</span>
        </div>
        {chartData ? <ChartStats chartData={{ ...emptyChartData, ...chartData }} /> : <div className="chart-loading">Loading activity trends...</div>}
      </section>

      <footer className="dashboard-footer">
        <p>© {new Date().getFullYear()} Bakery Stock Management System. All rights reserved.</p>
        <p>Developed by <span className="dev-name">Nawanjana Nethmini</span></p>
      </footer>
    </div>
  );
};

export default Dashboard;
