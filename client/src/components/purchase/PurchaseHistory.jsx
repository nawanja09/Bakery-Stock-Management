import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit, faEye, faPlus, faFileInvoice, faCalendar, faBuilding, faFilter } from '@fortawesome/free-solid-svg-icons';
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
  const [vatFilter, setVatFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [purchasesRes, companiesRes] = await Promise.all([
          api.get('/purchases'),
          api.get('/purchases/companies')
        ]);
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

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(purchase =>
        purchase.invoice_no?.toLowerCase().includes(query) ||
        purchase.supplier_name?.toLowerCase().includes(query) ||
        purchase.company_name?.toLowerCase().includes(query) ||
        purchase.check_number?.toLowerCase().includes(query)
      );
    }

    if (companyFilter) {
      filtered = filtered.filter(purchase =>
        purchase.company_id.toString() === companyFilter
      );
    }

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

    // VAT filter
    if (vatFilter !== 'all') {
      filtered = filtered.filter(purchase => {
        const hasVat = purchase.supplier_vat_number && purchase.supplier_vat_number.trim() !== '';
        return vatFilter === 'yes' ? hasVat : !hasVat;
      });
    }

    setFilteredPurchases(filtered);
  }, [purchases, searchQuery, companyFilter, startDate, endDate, vatFilter]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date
  const formatDate = (date) => {
    return dayjs(date).format('DD MMM YYYY');
  };

  // Handle search
  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  // Handle company filter
  const handleCompanyFilter = (e) => {
    setCompanyFilter(e.target.value);
  };

  // Handle date changes
  const handleStartDateChange = (e) => {
    setStartDate(e.target.value);
  };

  const handleEndDateChange = (e) => {
    setEndDate(e.target.value);
  };

  // Handle VAT filter change
  const handleVatFilterChange = (e) => {
    setVatFilter(e.target.value);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setVatFilter('all');
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
          <p className="subtitle">Manage and track all your purchases</p>
        </div>
        <Link to="/purchase/new" className="btn-primary">
          <FontAwesomeIcon icon={faPlus} />
          <span>New Purchase</span>
        </Link>
      </div>

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
                  onChange={handleSearch}
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

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faCalendar} />
                  Date Range
                </label>
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    placeholder="Start date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={handleEndDateChange}
                    placeholder="End date"
                  />
                </div>
              </div>

              {/* VAT filter dropdown */}
              <div className="filter-group">
                <label>VAT Status</label>
                <select
                  value={vatFilter}
                  onChange={handleVatFilterChange}
                  className="filter-select"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes (has VAT)</option>
                  <option value="no">No (no VAT)</option>
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
                <th>VAT Number</th>
                <th>Company</th>
                <th className="amount-col">Subtotal</th>
                <th className="amount-col">VAT</th>
                <th className="amount-col">Total</th>
                <th className="amount-col">Paid</th>
                <th className="amount-col">Due</th>
                <th>Payment</th>
                <th>Payment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(purchase => {
                const dueAmount = purchase.total_with_vat - purchase.paid_amount;
                return (
                  <tr key={purchase.id}>
                    <td className="invoice-cell">
                      <span className="invoice-badge">{purchase.invoice_no}</span>
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
                      {purchase.supplier_vat_number ? (
                        <span className="vat-badge">{purchase.supplier_vat_number}</span>
                      ) : (
                        <span className="no-vat">—</span>
                      )}
                    </td>
                    <td>
                      <span className="company-badge">{purchase.company_name}</span>
                    </td>
                    <td className="amount-col">{formatCurrency(purchase.subtotal || purchase.bill_amount)}</td>
                    <td className="amount-col vat-col">{formatCurrency(purchase.vat_amount || 0)}</td>
                    <td className="amount-col total-col">{formatCurrency(purchase.total_with_vat || purchase.bill_amount)}</td>
                    <td className="amount-col">{formatCurrency(purchase.paid_amount)}</td>
                    <td className={`amount-col ${dueAmount > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(dueAmount)}
                    </td>
                    <td>
                      <span className={`payment-badge ${purchase.payment_method.toLowerCase()}`}>
                        {purchase.payment_method.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`payment-badge ${purchase.payment_status?.toLowerCase().replace(' ', '-') || 'non-paid'}`}>
                        {purchase.payment_status || 'Non-Paid'}
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