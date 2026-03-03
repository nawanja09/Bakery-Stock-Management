// src/components/purchase/PurchaseHistory.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, 
  faEdit, 
  faEye,
  faFilter,
  faPercent,
  faTimes,
  faDownload,
  faPrint 
} from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';
import api from '../../api';

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [vatFilter, setVatFilter] = useState('both'); // 'yes', 'no', 'both'
  const [showFilters, setShowFilters] = useState(false);
  const [companies, setCompanies] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    withVat: 0,
    withoutVat: 0,
    totalAmount: 0,
    totalVat: 0
  });

  useEffect(() => {
    const fetchPurchases = async () => {
      try {
        setLoading(true);
        const response = await api.get('/purchases');
        setPurchases(response.data);
        
        // Extract unique companies for filter
        const uniqueCompanies = [...new Map(
          response.data.map(item => [item.company_id, { 
            id: item.company_id, 
            name: item.company_name 
          }])
        ).values()];
        setCompanies(uniqueCompanies);
        
      } catch (error) {
        console.error('Error fetching purchases:', error);
        alert('Failed to load purchase history');
      } finally {
        setLoading(false);
      }
    };
    fetchPurchases();
  }, []);

  // Apply filters whenever any filter changes
  useEffect(() => {
    applyFilters();
  }, [purchases, searchQuery, companyFilter, startDate, endDate, vatFilter]);

  const applyFilters = () => {
    let filtered = [...purchases];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(purchase =>
        purchase.check_number?.toLowerCase().includes(query) ||
        purchase.supplier_name?.toLowerCase().includes(query) ||
        purchase.payment_method?.toLowerCase().includes(query) ||
        purchase.company_name?.toLowerCase().includes(query) ||
        purchase.invoice_no?.toLowerCase().includes(query)
      );
    }

    // Company filter
    if (companyFilter) {
      filtered = filtered.filter(purchase =>
        purchase.company_id.toString() === companyFilter
      );
    }

    // Date range filter
    if (startDate) {
      const startDateObj = new Date(startDate);
      startDateObj.setHours(0, 0, 0, 0);
      filtered = filtered.filter(purchase =>
        new Date(purchase.purchase_date) >= startDateObj
      );
    }

    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);
      filtered = filtered.filter(purchase =>
        new Date(purchase.purchase_date) <= endDateObj
      );
    }

    // VAT filter
    if (vatFilter !== 'both') {
      filtered = filtered.filter(purchase => {
        const hasVat = purchase.vat_amount > 0 || purchase.vat_rate > 0;
        return vatFilter === 'yes' ? hasVat : !hasVat;
      });
    }

    setFilteredPurchases(filtered);
    
    // Calculate stats
    calculateStats(filtered);
  };

  const calculateStats = (filteredData) => {
    const stats = {
      total: filteredData.length,
      withVat: filteredData.filter(p => p.vat_amount > 0 || p.vat_rate > 0).length,
      withoutVat: filteredData.filter(p => !p.vat_amount && !p.vat_rate).length,
      totalAmount: filteredData.reduce((sum, p) => sum + (Number(p.bill_amount) || 0), 0),
      totalVat: filteredData.reduce((sum, p) => sum + (Number(p.vat_amount) || 0), 0)
    };
    setStats(stats);
  };

  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleCompanyFilter = (e) => {
    setCompanyFilter(e.target.value);
  };

  const handleStartDateChange = (e) => {
    setStartDate(e.target.value);
  };

  const handleEndDateChange = (e) => {
    setEndDate(e.target.value);
  };

  const handleVatFilter = (value) => {
    setVatFilter(value);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setVatFilter('both');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const calculateDue = (billAmount, paidAmount) => {
    return (Number(billAmount) - Number(paidAmount)).toFixed(2);
  };

  const getVatBadge = (purchase) => {
    const hasVat = purchase.vat_amount > 0 || purchase.vat_rate > 0;
    if (hasVat) {
      return (
        <span className="vat-badge active" title={`VAT ${purchase.vat_rate || 18}%`}>
          <FontAwesomeIcon icon={faPercent} /> VAT
        </span>
      );
    }
    return (
      <span className="vat-badge inactive" title="No VAT">
        No VAT
      </span>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading purchase history...</p>
      </div>
    );
  }

  return (
    <div className="purchase-history-container">
      {/* Header */}
      <div className="history-header">
        <div className="header-title">
          <h1>Purchase History</h1>
          <span className="record-count">{filteredPurchases.length} records</span>
        </div>
        <div className="header-actions">
          <button 
            className="btn-outline"
            onClick={() => window.print()}
            title="Print"
          >
            <FontAwesomeIcon icon={faPrint} /> Print
          </button>
          <Link to="/purchase/new" className="btn-primary">
            + New Purchase
          </Link>
        </div>
      </div>

      {/* Filter Toggle */}
      <button 
        className="filter-toggle"
        onClick={() => setShowFilters(!showFilters)}
      >
        <FontAwesomeIcon icon={faFilter} />
        {showFilters ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Filters Section */}
      {showFilters && (
        <div className="filters-section">
          <div className="filters-header">
            <h3>Filter Purchases</h3>
            <button className="clear-filters" onClick={clearFilters}>
              <FontAwesomeIcon icon={faTimes} /> Clear All
            </button>
          </div>

          <div className="filters-grid">
            {/* Search */}
            <div className="filter-group">
              <label>Search</label>
              <div className="search-input-wrapper">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by invoice, supplier, company..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="filter-input"
                />
                {searchQuery && (
                  <button 
                    className="clear-input"
                    onClick={() => setSearchQuery('')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Company Filter */}
            <div className="filter-group">
              <label>Company</label>
              <select 
                value={companyFilter} 
                onChange={handleCompanyFilter}
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

            {/* VAT Filter - Three Options */}
            <div className="filter-group">
              <label>VAT Status</label>
              <div className="vat-filter-options">
                <button
                  className={`vat-option ${vatFilter === 'yes' ? 'active' : ''}`}
                  onClick={() => handleVatFilter('yes')}
                >
                  <FontAwesomeIcon icon={faPercent} />
                  Yes (Has VAT)
                </button>
                <button
                  className={`vat-option ${vatFilter === 'no' ? 'active' : ''}`}
                  onClick={() => handleVatFilter('no')}
                >
                  <span className="no-vat-icon">🚫</span>
                  No (No VAT)
                </button>
                <button
                  className={`vat-option ${vatFilter === 'both' ? 'active' : ''}`}
                  onClick={() => handleVatFilter('both')}
                >
                  Both
                </button>
              </div>
            </div>

            {/* Date Range */}
            <div className="filter-group date-range">
              <label>Date Range</label>
              <div className="date-inputs">
                <input
                  type="date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  className="filter-input"
                  placeholder="Start date"
                />
                <span className="date-separator">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  className="filter-input"
                  placeholder="End date"
                />
              </div>
            </div>
          </div>

          {/* Active Filters */}
          {(searchQuery || companyFilter || startDate || endDate || vatFilter !== 'both') && (
            <div className="active-filters">
              <span className="active-filters-label">Active Filters:</span>
              {searchQuery && (
                <span className="filter-tag">
                  Search: {searchQuery}
                  <button onClick={() => setSearchQuery('')}>×</button>
                </span>
              )}
              {companyFilter && (
                <span className="filter-tag">
                  Company: {companies.find(c => c.id.toString() === companyFilter)?.name}
                  <button onClick={() => setCompanyFilter('')}>×</button>
                </span>
              )}
              {vatFilter !== 'both' && (
                <span className="filter-tag">
                  VAT: {vatFilter === 'yes' ? 'Has VAT' : 'No VAT'}
                  <button onClick={() => setVatFilter('both')}>×</button>
                </span>
              )}
              {startDate && (
                <span className="filter-tag">
                  From: {startDate}
                  <button onClick={() => setStartDate('')}>×</button>
                </span>
              )}
              {endDate && (
                <span className="filter-tag">
                  To: {endDate}
                  <button onClick={() => setEndDate('')}>×</button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results Table */}
      <div className="table-wrapper">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice No.</th>
              <th>Supplier</th>
              <th>Company</th>
              <th>VAT Status</th>
              <th className="text-right">Subtotal (Rs.)</th>
              <th className="text-right">VAT (Rs.)</th>
              <th className="text-right">Total (Rs.)</th>
              <th className="text-right">Paid (Rs.)</th>
              <th className="text-right">Due (Rs.)</th>
              <th>Payment Method</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.length > 0 ? (
              filteredPurchases.map(purchase => {
                const dueAmount = calculateDue(purchase.total_with_vat || purchase.bill_amount, purchase.paid_amount);
                const hasVat = purchase.vat_amount > 0 || purchase.vat_rate > 0;
                
                return (
                  <tr key={purchase.id} className={dueAmount > 0 ? 'row-due' : ''}>
                    <td>{new Date(purchase.purchase_date).toLocaleDateString('en-GB')}</td>
                    <td className="invoice-cell">
                      <span className="invoice-number">{purchase.invoice_no}</span>
                    </td>
                    <td>
                      <div className="supplier-info">
                        <span className="supplier-name">{purchase.supplier_name}</span>
                        {purchase.supplier_vat_number && (
                          <span className="supplier-vat-small">VAT: {purchase.supplier_vat_number}</span>
                        )}
                      </div>
                    </td>
                    <td>{purchase.company_name}</td>
                    <td>{getVatBadge(purchase)}</td>
                    <td className="text-right font-mono">
                      {formatCurrency(purchase.subtotal || 0)}
                    </td>
                    <td className="text-right font-mono">
                      {hasVat ? formatCurrency(purchase.vat_amount || 0) : '-'}
                    </td>
                    <td className="text-right font-mono total-cell">
                      {formatCurrency(purchase.total_with_vat || purchase.bill_amount)}
                    </td>
                    <td className="text-right font-mono paid-cell">
                      {formatCurrency(purchase.paid_amount)}
                    </td>
                    <td className={`text-right font-mono due-cell ${dueAmount > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(dueAmount)}
                    </td>
                    <td>
                      <span className={`payment-badge ${purchase.payment_method === 'CASH' ? 'cash' : 'bank'}`}>
                        {purchase.payment_method}
                      </span>
                    </td>
                    <td className="text-center actions-column">
                      <Link to={`/purchase/${purchase.id}`} className="btn-icon" title="View Details">
                        <FontAwesomeIcon icon={faEye} />
                      </Link>
                      <Link to={`/purchase/edit/${purchase.id}`} className="btn-icon" title="Edit">
                        <FontAwesomeIcon icon={faEdit} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="12" className="no-data">
                  <div className="no-data-content">
                    <p>No purchases found matching your filters</p>
                    <button className="btn-link" onClick={clearFilters}>
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {filteredPurchases.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan="5" className="text-right"><strong>Totals:</strong></td>
                <td className="text-right font-mono"><strong>{formatCurrency(filteredPurchases.reduce((sum, p) => sum + (Number(p.subtotal) || 0), 0))}</strong></td>
                <td className="text-right font-mono"><strong>{formatCurrency(filteredPurchases.reduce((sum, p) => sum + (Number(p.vat_amount) || 0), 0))}</strong></td>
                <td className="text-right font-mono"><strong>{formatCurrency(filteredPurchases.reduce((sum, p) => sum + (Number(p.total_with_vat || p.bill_amount) || 0), 0))}</strong></td>
                <td className="text-right font-mono"><strong>{formatCurrency(filteredPurchases.reduce((sum, p) => sum + (Number(p.paid_amount) || 0), 0))}</strong></td>
                <td className="text-right font-mono"><strong>{formatCurrency(filteredPurchases.reduce((sum, p) => sum + (Number(p.total_with_vat || p.bill_amount) - Number(p.paid_amount) || 0), 0))}</strong></td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Export Options */}
      <div className="export-options">
        <button className="btn-outline small">
          <FontAwesomeIcon icon={faDownload} /> Export as CSV
        </button>
      </div>
    </div>
  );
};

export default PurchaseHistory;