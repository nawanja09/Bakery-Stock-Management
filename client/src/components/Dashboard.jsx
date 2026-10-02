import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChartStats from './ChartStats';
import FgMarginChart from './FgMarginChart';
import TopItemsChart from './TopItemsChart';
import './Dashboard.css';
import api from '../api';
import usePermissions from '../hooks/usePermissions';
import { ROLES } from '../config/rolePermissions';
import { formatNumber } from '../utils/formatters';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faTruckLoading,
  faMoneyCheckDollar,
  faArrowRightArrowLeft,
  faTrash,
  faIndustry,
  faBoxesPacking,
  faArrowRight
} from '@fortawesome/free-solid-svg-icons';

const emptyOverview = {
  lowStock: { count: 0, items: [] },
  purchases7d: { count: 0, totalAmount: 0 },
  pendingPayments: { count: 0, totalAmount: 0 },
  issues7d: 0,
  wastage7d: { rawCount: 0, fgCount: 0 },
  production7d: { count: 0, totalUnits: 0 }
};

const emptyChartData = {
  purchasingData: { labels: [], data: [] },
  issuesVsWastageData: { labels: [], issues: [], wastage: [] }
};

const emptyFinanceOverview = {
  management: { companies: 0, payees: 0, expenseTypes: 0, subExpenseTypes: 0 },
  expenses: {
    total: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    pendingPayments: { count: 0, amount: 0 },
    outstanding: { count: 0, amount: 0 },
    pettyCash: { count: 0, amount: 0 },
    adjustments: { count: 0, recent: [] },
    recent: []
  }
};

const formatDateInput = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPeriodDates = period => {
  const end = new Date();
  const start = new Date(end);
  if (period === '7') start.setDate(end.getDate() - 6);
  if (period === '30') start.setDate(end.getDate() - 29);
  if (period === '90') start.setDate(end.getDate() - 89);
  if (period === 'month') start.setDate(1);
  return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
};

const Dashboard = () => {
  const navigate = useNavigate();
  // Role rules live in config/rolePermissions.js (single source of truth).
  const { canWrite: canRecordActivity, canAccessPath, hasModule, role, username } = usePermissions();
  const isFinanceUser = role === ROLES.FINANCE_USER;
  const canSeeFgProduction = hasModule('fgProduction');
  const canSeeFinance = hasModule('finance');

  const [financeOverview, setFinanceOverview] = useState(emptyFinanceOverview);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [financeError, setFinanceError] = useState('');
  const [overview, setOverview] = useState(emptyOverview);
  const [chartData, setChartData] = useState(emptyChartData);
  const [fgRecipes, setFgRecipes] = useState([]);
  const [fgLoading, setFgLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topItems, setTopItems] = useState([]);
  const [topItemsType, setTopItemsType] = useState('issued');
  const [topItemsPeriod, setTopItemsPeriod] = useState('30');
  const [customDates, setCustomDates] = useState(getPeriodDates('30'));
  const [topItemsLoading, setTopItemsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (isFinanceUser) {
      api.get('/dashboard/finance-overview')
        .then((response) => {
          if (active) setFinanceOverview({ ...emptyFinanceOverview, ...response.data });
        })
        .catch(() => {
          if (active) setFinanceError('Unable to load Finance dashboard data.');
        })
        .finally(() => {
          if (active) setFinanceLoading(false);
        });
      return () => { active = false; };
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [overviewRes, chartsRes] = await Promise.all([
          api.get('/dashboard/dashboard/overview'),
          api.get('/dashboard/charts')
        ]);
        if (!active) return;
        setOverview({ ...emptyOverview, ...overviewRes.data });
        setChartData({ ...emptyChartData, ...chartsRes.data });
        setError('');
      } catch (err) {
        if (active) setError('Unable to load some dashboard data. Showing what is available.');
      } finally {
        if (active) setLoading(false);
      }
    };

    // Kept as a separate request/loading state from the main dashboard load:
    // this one also calls out to the Ravon POS integration for selling
    // prices, which can be slower or unavailable independently of the
    // core stats.
    const loadFgRecipes = async () => {
      try {
        setFgLoading(true);
        const res = await api.get('/fg-production/reports/recipes');
        if (!active) return;
        setFgRecipes(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (active) setFgRecipes([]);
      } finally {
        if (active) setFgLoading(false);
      }
    };

    loadDashboard();
    if (canSeeFgProduction) loadFgRecipes();
    else setFgLoading(false);
    return () => { active = false; };
  }, [isFinanceUser, canSeeFgProduction]);

  useEffect(() => {
    let active = true;
    if (isFinanceUser) {
      setTopItems([]);
      setTopItemsLoading(false);
      return () => { active = false; };
    }
    const dates = topItemsPeriod === 'custom' ? customDates : getPeriodDates(topItemsPeriod);

    const loadTopItems = async () => {
      setTopItemsLoading(true);
      try {
        const res = await api.get('/dashboard/top-items', {
          params: { type: topItemsType, ...dates, limit: 8 }
        });
        if (active) setTopItems(Array.isArray(res.data?.items) ? res.data.items : []);
      } catch (err) {
        if (active) setTopItems([]);
      } finally {
        if (active) setTopItemsLoading(false);
      }
    };

    if (dates.startDate && dates.endDate && dates.startDate <= dates.endDate) {
      loadTopItems();
    } else {
      setTopItems([]);
      setTopItemsLoading(false);
    }
    return () => { active = false; };
  }, [topItemsType, topItemsPeriod, customDates, isFinanceUser]);

  const wastageTotal7d = (overview.wastage7d?.rawCount || 0) + (overview.wastage7d?.fgCount || 0);
  const financeMetrics = financeOverview.expenses;

  if (isFinanceUser) {
    const managementCards = [
      ['Companies', financeOverview.management.companies],
      ['Expense Payees', financeOverview.management.payees],
      ['Expense Types', financeOverview.management.expenseTypes],
      ['Sub Expense Types', financeOverview.management.subExpenseTypes]
    ];
    const expenseCards = [
      { label: 'Total Expenses', metric: financeMetrics.total, amount: financeMetrics.total.amount },
      { label: 'Paid Expenses', metric: financeMetrics.paid, amount: financeMetrics.paid.amount },
      { label: 'Pending Payments', metric: financeMetrics.pendingPayments, amount: financeMetrics.pendingPayments.amount },
      { label: 'Outstanding Expenses', metric: financeMetrics.outstanding, amount: financeMetrics.outstanding.amount },
      { label: 'Petty Cash Expenses', metric: financeMetrics.pettyCash, amount: financeMetrics.pettyCash.amount },
      { label: 'Expense Adjustments', metric: financeMetrics.adjustments, amount: null }
    ];

    return (
      <div className="dashboard-container page-shell finance-dashboard">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            {username && <p className="page-subtitle">Welcome, {username}</p>}
          </div>
          <div className="dashboard-date">
            <span className="dashboard-date-label">Today</span>
            <strong>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
        </header>

        {financeError && <div className="dashboard-error" role="alert">{financeError}</div>}

        <section className="dashboard-section" aria-labelledby="finance-management-heading">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Management</p>
              <h2 id="finance-management-heading">Management overview</h2>
            </div>
          </div>
          <div className="finance-management-grid">
            {managementCards.map(([label, value]) => (
              <article className="finance-management-card" key={label}>
                <span>{label}</span>
                <strong>{financeLoading ? '—' : formatNumber(value)}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="finance-expenses-heading">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Expenses</p>
              <h2 id="finance-expenses-heading">Expense summary</h2>
            </div>
          </div>
          <div className="finance-expense-grid">
            {expenseCards.map(({ label, metric, amount }) => (
              <article className="finance-expense-card" key={label}>
                <span className="finance-expense-label">{label}</span>
                <strong>{financeLoading ? '—' : amount === null
                  ? formatNumber(metric.count)
                  : `Rs. ${formatNumber(amount, 0, 0)}`}</strong>
                <span className="finance-expense-count">
                  {financeLoading ? 'Loading…' : `${formatNumber(metric.count)} records`}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-section finance-dashboard-lower">
          <div className="finance-dashboard-panel">
            <div className="section-heading">
              <div>
                <p className="section-eyebrow">Activity</p>
                <h2>Recent Expenses</h2>
              </div>
            </div>
            {financeLoading ? <p className="finance-dashboard-empty">Loading recent expenses…</p> :
              financeMetrics.recent.length === 0 ? <p className="finance-dashboard-empty">No expenses recorded yet.</p> : (
                <div className="finance-dashboard-table-wrap">
                  <table className="finance-dashboard-table">
                    <thead>
                      <tr><th>Date</th><th>Type</th><th>Payee</th><th>Reference</th><th>Amount</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {financeMetrics.recent.map((expense) => (
                        <tr key={`${expense.type}-${expense.id}`}>
                          <td>{new Date(expense.date).toLocaleDateString()}</td>
                          <td>{expense.type}</td>
                          <td>{expense.payee || '—'}</td>
                          <td>{expense.reference || '—'}</td>
                          <td>Rs. {formatNumber(expense.amount, 0, 0)}</td>
                          <td>{expense.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="finance-dashboard-panel">
            <div className="section-heading">
              <div>
                <p className="section-eyebrow">Management activity</p>
                <h2>Recent Expense Adjustments</h2>
              </div>
            </div>
            {financeLoading ? <p className="finance-dashboard-empty">Loading adjustments…</p> :
              financeMetrics.adjustments.recent.length === 0 ? <p className="finance-dashboard-empty">No expense adjustments recorded.</p> : (
                <ul className="finance-adjustment-list">
                  {financeMetrics.adjustments.recent.map((adjustment) => (
                    <li key={`${adjustment.category}-${adjustment.reference}-${adjustment.date}`}>
                      <span>{adjustment.category}</span>
                      <strong>{adjustment.reference || 'Record updated'}</strong>
                      <time>{new Date(adjustment.date).toLocaleDateString()}</time>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>

        <footer className="dashboard-footer">
          <p>© {new Date().getFullYear()} Bakery Stock Management System. All rights reserved.</p>
          <p>Developed by <span className="dev-name">Nawanjana Nethmini</span></p>
        </footer>
      </div>
    );
  }

  const kpiCards = [
    {
      key: 'lowStock',
      label: 'Items below reorder level',
      value: overview.lowStock.count,
      icon: faTriangleExclamation,
      tone: overview.lowStock.count > 0 ? 'danger' : 'success',
      path: '/items',
      onClick: () => navigate('/items')
    },
    {
      key: 'purchases',
      label: 'Purchases — last 7 days',
      value: overview.purchases7d.count,
      sub: `Rs. ${formatNumber(overview.purchases7d.totalAmount, 0, 0)}`,
      icon: faTruckLoading,
      tone: 'primary',
      path: '/purchase/history',
      onClick: () => navigate('/purchase/history')
    },
    canSeeFinance && {
      key: 'pending',
      label: 'Pending purchase payments',
      value: overview.pendingPayments.count,
      sub: `Rs. ${formatNumber(overview.pendingPayments.totalAmount, 0, 0)}`,
      icon: faMoneyCheckDollar,
      tone: overview.pendingPayments.count > 0 ? 'warning' : 'success',
      path: '/purchase/non-paid',
      onClick: () => navigate('/purchase/non-paid')
    },
    {
      key: 'issues',
      label: 'Issued to departments — 7 days',
      value: overview.issues7d,
      icon: faArrowRightArrowLeft,
      tone: 'info',
      path: '/issuance/history',
      onClick: () => navigate('/issuance/history')
    },
    {
      key: 'wastage',
      label: 'Wastage records — 7 days',
      value: wastageTotal7d,
      icon: faTrash,
      tone: wastageTotal7d > 0 ? 'warning' : 'success',
      path: '/wastage/history',
      onClick: () => navigate('/wastage/history')
    },
    {
      key: 'production',
      label: 'Production runs — 7 days',
      value: overview.production7d.count,
      sub: `${formatNumber(overview.production7d.totalUnits)} units`,
      icon: faIndustry,
      tone: 'primary',
      path: '/finished-goods/production',
      onClick: () => navigate('/finished-goods/production')
    }
  ].filter((card) => card && canAccessPath(card.path));

  const quickActions = [
    { label: 'New Purchase', icon: faTruckLoading, path: '/purchase/new' },
    { label: 'Issue to Department', icon: faArrowRightArrowLeft, path: '/issuance/issue' },
    { label: 'Record Wastage', icon: faTrash, path: '/wastage/add' },
    { label: 'New Production', icon: faIndustry, path: '/finished-goods/production' },
    { label: 'New Transfer', icon: faBoxesPacking, path: '/finished-goods/transfer/add' }
  ];

  return (
    <div className="dashboard-container page-shell">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          {username && <p className="page-subtitle">Welcome, {username}</p>}
        </div>
        <div className="dashboard-date">
          <span className="dashboard-date-label">Today</span>
          <strong>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
        </div>
      </header>

      {error && <div className="dashboard-error" role="alert">{error}</div>}

      {/* KPI row */}
      <section className="dashboard-section" aria-labelledby="kpi-heading">
        <div className="section-heading">
          <div>
            <p className="section-eyebrow">Operational pulse</p>
            <h2 id="kpi-heading">Key numbers</h2>
          </div>
          <span className="section-caption">Last 7 days</span>
        </div>
        <div className="kpi-grid">
          {kpiCards.map(card => (
            <button
              type="button"
              className={`kpi-card tone-${card.tone}`}
              key={card.key}
              onClick={card.onClick}
            >
              <div className="kpi-card-top">
                <span className="kpi-icon"><FontAwesomeIcon icon={card.icon} /></span>
                <FontAwesomeIcon className="kpi-card-arrow" icon={faArrowRight} />
              </div>
              <strong className="kpi-value">
                {loading ? <span className="dashboard-value-skeleton" /> : formatNumber(card.value)}
              </strong>
              <span className="kpi-label">{card.label}</span>
              {card.sub && !loading && <span className="kpi-sub">{card.sub}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      {canRecordActivity && (
        <section className="dashboard-section" aria-labelledby="actions-heading">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Do it now</p>
              <h2 id="actions-heading">Quick actions</h2>
            </div>
          </div>
          <div className="quick-actions-row">
            {quickActions.filter(action => canAccessPath(action.path)).map(action => (
              <button
                type="button"
                key={action.label}
                className="quick-action-btn"
                onClick={() => navigate(action.path)}
              >
                <FontAwesomeIcon icon={action.icon} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Trend + low stock */}
      <section className="dashboard-section dashboard-split" aria-labelledby="trend-heading">
        <div className="trend-panel">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Activity trends</p>
              <h2 id="trend-heading">Purchases, issues &amp; wastage</h2>
            </div>
            <span className="section-caption">Live system data</span>
          </div>
          {chartData.purchasingData.labels.length || chartData.issuesVsWastageData.labels.length ? (
            <ChartStats chartData={chartData} />
          ) : (
            <div className="chart-loading">{loading ? 'Loading activity trends...' : 'No activity recorded yet.'}</div>
          )}
        </div>

        <div className="low-stock-panel">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Needs attention</p>
              <h2>Low stock items</h2>
            </div>
          </div>
          {overview.lowStock.items.length === 0 ? (
            <div className="low-stock-empty">
              {loading ? 'Checking stock levels...' : 'All raw material items are above their reorder level.'}
            </div>
          ) : (
            <ul className="low-stock-list">
              {overview.lowStock.items.map(item => (
                <li key={item.id} className="low-stock-row">
                  <div className="low-stock-info">
                    <strong>{item.name}</strong>
                    <span>{item.item_code}</span>
                  </div>
                  <div className="low-stock-figures">
                    <span className="low-stock-current">{formatNumber(item.current_stock)} {item.unit}</span>
                    <span className="low-stock-reorder">reorder at {formatNumber(item.reorder_level)} {item.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {overview.lowStock.count > overview.lowStock.items.length && (
            <button type="button" className="low-stock-view-all" onClick={() => navigate('/items')}>
              View all {overview.lowStock.count} low stock items
            </button>
          )}
        </div>
      </section>

      <section className="dashboard-section trend-panel top-items-panel" aria-labelledby="top-items-heading">
        <div className="section-heading top-items-heading">
          <div>
            <p className="section-eyebrow">Stock movement</p>
            <h2 id="top-items-heading">Top Issued / Wasted Items</h2>
          </div>
          <div className="top-items-controls">
            <div className="top-items-toggle" role="group" aria-label="Item movement type">
              <button type="button" className={topItemsType === 'issued' ? 'active' : ''} onClick={() => setTopItemsType('issued')}>Issued</button>
              <button type="button" className={topItemsType === 'wasted' ? 'active' : ''} onClick={() => setTopItemsType('wasted')}>Wasted</button>
            </div>
            <select value={topItemsPeriod} onChange={event => setTopItemsPeriod(event.target.value)} aria-label="Top items period">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="month">This month</option>
              <option value="90">Last 3 months</option>
              <option value="custom">Custom date range</option>
            </select>
          </div>
        </div>
        {topItemsPeriod === 'custom' && (
          <div className="top-items-date-range">
            <label>From <input type="date" value={customDates.startDate} onChange={event => setCustomDates({ ...customDates, startDate: event.target.value })} /></label>
            <label>To <input type="date" value={customDates.endDate} onChange={event => setCustomDates({ ...customDates, endDate: event.target.value })} /></label>
          </div>
        )}
        <TopItemsChart items={topItems} loading={topItemsLoading} type={topItemsType} />
      </section>

      {/* FG Production — recipe cost vs. selling price */}
      <section className="dashboard-section" aria-labelledby="fg-margin-heading">
        <div className="trend-panel">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">FG Production</p>
              <h2 id="fg-margin-heading">Recipe cost vs. selling price</h2>
            </div>
            <span className="section-caption">Top items by RM cost</span>
          </div>
          <FgMarginChart recipes={fgRecipes} loading={fgLoading} />
        </div>
      </section>

      <footer className="dashboard-footer">
        <p>© {new Date().getFullYear()} Bakery Stock Management System. All rights reserved.</p>
        <p>Developed by <span className="dev-name">Nawanjana Nethmini</span></p>
      </footer>
    </div>
  );
};

export default Dashboard;
