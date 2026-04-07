// src/components/purchase/PurchaseHistory.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, 
  faEdit, 
  faEye, 
  faPlus, 
  faFileInvoice, 
  faCalendar, 
  faBuilding,
  faCheckCircle,
  faExclamationTriangle,
  faClock,
  faMoneyBillWave,
  faFilter,
  faReceipt
} from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';
import api from '../../api';
import dayjs from 'dayjs';

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [companies, setCompanies] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [purchasesRes, companiesRes] = await Promise.all([
          api.get('/purchases'),
          api.get('/purchases/companies')
        ]);
        
        console.log('API Response - First purchase:', purchasesRes.data[0]); // Debug log
        
        setPurchases(purchasesRes.data);
        setFilteredPurchases(purchasesRes.data);
        setCompanies(companiesRes.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Apply filters whenever any filter state changes
  useEffect(() => {
    let filtered = purchases;

    // Search filter - Check multiple possible invoice field names
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(purchase => {
        const invoiceNumber = purchase.invoice_no || purchase.invoice_number || '';
        return invoiceNumber.toLowerCase().includes(query) ||
          (purchase.supplier_name || '').toLowerCase().includes(query) ||
          (purchase.company_name || '').toLowerCase().includes(query) ||
          (purchase.check_number || '').toLowerCase().includes(query);
      });
    }

    // Company filter
    if (companyFilter) {
      filtered = filtered.filter(purchase =>
        purchase.company_id?.toString() === companyFilter
      );
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter(purchase =>
        dayjs(purchase.purchase_date).isAfter(dayjs(startDate).subtract(1, 'day'))
      );
    }

    if (endDate) {
      filtered = filtered.filter(purchase =>
        dayjs(purchase.purchase_date).isBefore(dayjs(endDate).add(1, 'day'))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(purchase => purchase.payment_status === statusFilter);
    }

    setFilteredPurchases(filtered);
  }, [purchases, searchQuery, companyFilter, startDate, endDate, statusFilter]);

  const formatCurrency = (amount) => {
    const numAmount = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(numAmount);
  };

  const formatDate = (date) => {
    return dayjs(date).format('DD MMM YYYY');
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Paid':
        return { class: 'paid', icon: faCheckCircle, text: 'Paid' };
      case 'Partially Paid':
        return { class: 'partially-paid', icon: faExclamationTriangle, text: 'Partially Paid' };
      default:
        return { class: 'non-paid', icon: faClock, text: 'Non-Paid' };
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
  };

  // Calculate summary statistics
  const summary = {
    total_purchases: filteredPurchases.length,
    total_amount: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.total_with_vat) || 0), 0),
    total_paid: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.paid_amount) || 0), 0),
    total_balance: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.balance_amount) || 0), 0),
    paid_count: filteredPurchases.filter(p => p.payment_status === 'Paid').length,
    non_paid_count: filteredPurchases.filter(p => p.payment_status === 'Non-Paid').length,
    partially_paid_count: filteredPurchases.filter(p => p.payment_status === 'Partially Paid').length
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading purchases...</p>
      </div>
    );
  }

  return (
    <div className="purchase-history-container">
      <div className="page-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faFileInvoice} className="header-icon" />
            Purchase History
          </h1>
          <p className="subtitle">Manage and track all your purchases with payment status</p>
        </div>
        <Link to="/purchase/new" className="btn-primary">
          <FontAwesomeIcon icon={faPlus} />
          <span>New Purchase</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card total">
          <div className="summary-icon">💰</div>
          <div className="summary-details">
            <span className="summary-label">Total Purchases</span>
            <span className="summary-value">{summary.total_purchases}</span>
            <span className="summary-sub">{formatCurrency(summary.total_amount)}</span>
          </div>
        </div>
        <div className="summary-card paid">
          <div className="summary-icon">✅</div>
          <div className="summary-details">
            <span className="summary-label">Paid</span>
            <span className="summary-value">{summary.paid_count}</span>
            <span className="summary-sub">{formatCurrency(summary.total_paid)}</span>
          </div>
        </div>
        <div className="summary-card partially">
          <div className="summary-icon">⚠️</div>
          <div className="summary-details">
            <span className="summary-label">Partially Paid</span>
            <span className="summary-value">{summary.partially_paid_count}</span>
            <span className="summary-sub">{formatCurrency(summary.total_balance)}</span>
          </div>
        </div>
        <div className="summary-card non-paid">
          <div className="summary-icon">⏰</div>
          <div className="summary-details">
            <span className="summary-label">Non-Paid</span>
            <span className="summary-value">{summary.non_paid_count}</span>
            <span className="summary-sub">{formatCurrency(summary.total_balance)}</span>
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="filters-card">
        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="filters-title">
            <FontAwesomeIcon icon={faFilter} />
            <h3>Filters</h3>
          </div>
          <button className="toggle-filters">
            {showFilters ? '−' : '+'}
          </button>
        </div>

        {showFilters && (
          <div className="filters-content">
            <div className="filters-grid">
              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faSearch} />
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Invoice, supplier, company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faBuilding} />
                  Company
                </label>
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Companies</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faCalendar} />
                  Date Range
                </label>
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                  />
                </div>
              </div>

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faCheckCircle} />
                  Payment Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Non-Paid">Non-Paid</option>
                </select>
              </div>
            </div>

            <div className="filter-actions">
              <button onClick={clearFilters} className="btn-clear">
                Clear Filters
              </button>
              <span className="result-count">
                {filteredPurchases.length} {filteredPurchases.length === 1 ? 'purchase' : 'purchases'} found
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        {filteredPurchases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No purchases found</h3>
            <p>Try adjusting your filters or create a new purchase</p>
            <Link to="/purchase/new" className="btn-primary">
              <FontAwesomeIcon icon={faPlus} />
              Create Purchase
            </Link>
          </div>
        ) : (
          <table className="purchase-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Company</th>
                <th className="amount-col">Total</th>
                <th className="amount-col">Paid</th>
                <th className="amount-col">Balance</th>
                <th>Status</th>
                <th>Payment Method</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(purchase => {
                console.log('Purchase object:', purchase);
                const statusInfo = getStatusBadge(purchase.payment_status);
                // Get invoice number with fallback
                const invoiceNumber = purchase.invoice_no || purchase.invoice_number || 'N/A';
                
                return (
                  <tr key={purchase.id}>
                    <td className="invoice-cell">
                      <div className="invoice-badge" style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: 'monospace'
                      }}>
                        <FontAwesomeIcon icon={faReceipt} style={{ fontSize: '11px', opacity: 0.7 }} />
                        <span>
                          {purchase.invoice_no || purchase.invoice_number || purchase.inv_number || 
                          (purchase.id ? `ID:${purchase.id}` : 'N/A')}
                        </span>
                      </div>
                      {(!purchase.invoice_no && !purchase.invoice_number && !purchase.inv_number) && (
                        <div style={{ fontSize: '10px', color: '#dc3545', marginTop: '4px', textAlign: 'center' }}>
                          ⚠️ Missing
                        </div>
                      )}
                    </td>
                    <td>{formatDate(purchase.purchase_date)}</td>
                    <td>
                      <div className="supplier-info">
                        <span className="supplier-name">{purchase.supplier_name}</span>
                        {purchase.check_number && (
                          <span className="invoice-ref">Ref: {purchase.check_number}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="company-badge">{purchase.company_name}</span>
                    </td>
                    <td className="amount-col total-col">{formatCurrency(purchase.total_with_vat)}</td>
                    <td className="amount-col">{formatCurrency(purchase.paid_amount)}</td>
                    <td className={`amount-col ${purchase.balance_amount > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(purchase.balance_amount)}
                    </td>
                    <td>
                      <span className={`payment-badge ${statusInfo.class}`}>
                        <FontAwesomeIcon icon={statusInfo.icon} />
                        {statusInfo.text}
                      </span>
                    </td>
                    <td>
                      <span className="payment-method-badge">
                        {purchase.payment_method?.replace('_', ' ') || 'N/A'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <Link to={`/purchase/${purchase.id}`} className="action-btn view" title="View Details">
                        <FontAwesomeIcon icon={faEye} />
                      </Link>
                      <Link to={`/purchase/edit/${purchase.id}`} className="action-btn edit" title="Edit">
                        <FontAwesomeIcon icon={faEdit} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PurchaseHistory;