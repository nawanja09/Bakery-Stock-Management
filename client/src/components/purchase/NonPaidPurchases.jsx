// src/components/purchase/NonPaidPurchases.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMoneyBillWave, 
  faEye, 
  faCalendarAlt,
  faBuilding,
  faCreditCard,
  faCheckCircle,
  faExclamationTriangle,
  faClock,
  faHistory,
  faFileInvoice,
  faFilter,
  faTimes,
  faSearch
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import PaymentModal from './PaymentModal';
import './Purchase.css';

const NonPaidPurchases = () => {
  const location = useLocation();
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [summary, setSummary] = useState({
    total_outstanding: 0,
    non_paid_count: 0,
    partially_paid_count: 0,
    total_bills: 0
  });
  
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterPurchases();
  }, [purchases, searchQuery, supplierFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch non-paid purchases (balance > 0)
      const purchasesRes = await api.get('/purchases/non-paid');
      setPurchases(purchasesRes.data);
      setFilteredPurchases(purchasesRes.data);

      // Extract unique suppliers for filter
      const uniqueSuppliers = [...new Set(purchasesRes.data.map(p => p.supplier_name))];
      setSuppliers(uniqueSuppliers);

      // Calculate summary
      const totalOutstanding = purchasesRes.data.reduce((sum, p) => sum + parseFloat(p.balance_amount), 0);
      const nonPaidCount = purchasesRes.data.filter(p => p.payment_status === 'Non-Paid').length;
      const partiallyPaidCount = purchasesRes.data.filter(p => p.payment_status === 'Partially Paid').length;

      setSummary({
        total_outstanding: totalOutstanding,
        non_paid_count: nonPaidCount,
        partially_paid_count: partiallyPaidCount,
        total_bills: purchasesRes.data.length
      });

    } catch (error) {
      console.error('Error fetching non-paid purchases:', error);
      showPopup('error', 'Failed to load non-paid purchases');
    } finally {
      setLoading(false);
    }
  };

  const filterPurchases = () => {
    let filtered = [...purchases];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.invoice_no?.toLowerCase().includes(query) ||
        p.supplier_name?.toLowerCase().includes(query) ||
        p.check_number?.toLowerCase().includes(query)
      );
    }

    if (supplierFilter) {
      filtered = filtered.filter(p => p.supplier_name === supplierFilter);
    }

    setFilteredPurchases(filtered);
  };

  const handleMakePayment = (purchase) => {
    setSelectedPurchase(purchase);
    setShowPaymentModal(true);
  };

  const handlePaymentComplete = (result) => {
    setShowPaymentModal(false);
    showPopup('success', `Payment of ${formatCurrency(result.amount)} recorded successfully!`);
    fetchData(); // Refresh the list
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    return dayjs(date).format('DD MMM YYYY');
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Partially Paid':
        return { class: 'partially-paid', icon: faExclamationTriangle, text: 'Partially Paid' };
      default:
        return { class: 'non-paid', icon: faClock, text: 'Non-Paid' };
    }
  };

  const getOverdueClass = (days) => {
    if (days > 30) return 'critical';
    if (days > 15) return 'warning';
    return 'normal';
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSupplierFilter('');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading outstanding bills...</p>
      </div>
    );
  }

  return (
    <div className="purchase-history-container">
      <div className="page-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faMoneyBillWave} className="header-icon" />
            Outstanding Bills
          </h1>
        </div>
        <Link to="/purchase/new" state={{ backgroundLocation: location }} className="btn btn-primary">
          <FontAwesomeIcon icon={faFileInvoice} />
          <span>New Purchase</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card total-outstanding">
          <div className="summary-icon">
            <FontAwesomeIcon icon={faMoneyBillWave} />
          </div>
          <div className="summary-details">
            <span className="summary-label">Total Outstanding</span>
            <span className="summary-value">{formatCurrency(summary.total_outstanding)}</span>
            <span className="summary-sub">{summary.total_bills} bills</span>
          </div>
        </div>

        <div className="summary-card non-paid">
          <div className="summary-icon">
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div className="summary-details">
            <span className="summary-label">Non-Paid Bills</span>
            <span className="summary-value">{summary.non_paid_count}</span>
            <span className="summary-sub">No payment made</span>
          </div>
        </div>

        <div className="summary-card partially-paid">
          <div className="summary-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="summary-details">
            <span className="summary-label">Partially Paid</span>
            <span className="summary-value">{summary.partially_paid_count}</span>
            <span className="summary-sub">Partial payments made</span>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-card">
        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="filters-title">
            <FontAwesomeIcon icon={faFilter} />
            <h3>Filters</h3>
            {(searchQuery || supplierFilter) && (
              <span className="active-filters-badge">
                {[searchQuery, supplierFilter].filter(Boolean).length}
              </span>
            )}
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
                  placeholder="Invoice #, Supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faBuilding} />
                  Supplier
                </label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.map(supplier => (
                    <option key={supplier} value={supplier}>{supplier}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="filter-actions">
              <button onClick={clearFilters} className="btn btn-outline-secondary">
                Clear Filters
              </button>
              <span className="result-count">
                {filteredPurchases.length} {filteredPurchases.length === 1 ? 'bill' : 'bills'} found
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        {filteredPurchases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <h3>No Outstanding Bills</h3>
            <p>All purchases are paid or no bills match your criteria.</p>
            <Link to="/purchase/new" className="btn btn-primary">
              <FontAwesomeIcon icon={faFileInvoice} />
              Create New Purchase
            </Link>
          </div>
        ) : (
          <table className="purchase-table">
            <thead>
              <tr>
                <th className="text-left">Invoice #</th>
                <th className="text-left">Date</th>
                <th className="text-left">Supplier</th>
                <th className="text-left">Company</th>
                <th className="amount-col text-right">Total</th>
                <th className="amount-col text-right">Paid</th>
                <th className="amount-col text-right">Balance</th>
                <th className="text-center">Status</th>
                <th className="text-center">Days Overdue</th>
                <th className="text-center">Actions</th>
               </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(purchase => {
                const statusInfo = getStatusBadge(purchase.payment_status);
                const daysOverdue = purchase.days_overdue || 0;
                
                return (
                  <tr key={purchase.id}>
                    <td className="text-left">
                      <span className="invoice-badge">{purchase.invoice_no}</span>
                    </td>
                    <td className="text-left">{formatDate(purchase.purchase_date)}</td>
                    <td className="text-left">
                      <div className="supplier-info">
                        <span className="supplier-name">{purchase.supplier_name}</span>
                        {purchase.check_number && (
                          <span className="invoice-ref">Ref: {purchase.check_number}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-left">
                      <span className="company-badge">{purchase.company_name}</span>
                    </td>
                    <td className="amount-col total-col text-right">{formatCurrency(purchase.total_with_vat)}</td>
                    <td className="amount-col text-right">{formatCurrency(purchase.paid_amount)}</td>
                    <td className="amount-col due-amount text-right">{formatCurrency(purchase.balance_amount)}</td>
                    <td className="text-center">
                      <span className={`payment-badge ${statusInfo.class}`}>
                        <FontAwesomeIcon icon={statusInfo.icon} />
                        {statusInfo.text}
                      </span>
                    </td>
                    <td className="text-center">
                      {daysOverdue > 0 ? (
                        <span className={`days-badge ${getOverdueClass(daysOverdue)}`}>
                          {daysOverdue} days
                        </span>
                      ) : (
                        <span className="days-badge normal">Today</span>
                      )}
                    </td>
                    <td className="actions-cell text-center">
                      <Link to={`/purchase/${purchase.id}`} state={{ backgroundLocation: location }} className="action-btn view" title="View Details">
                        <FontAwesomeIcon icon={faEye} />
                      </Link>
                      <button 
                        onClick={() => handleMakePayment(purchase)}
                        className="action-btn payment"
                        title="Make Payment"
                      >
                        <FontAwesomeIcon icon={faCreditCard} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPurchase && (
        <PaymentModal
          purchase={selectedPurchase}
          onClose={() => setShowPaymentModal(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
};

export default NonPaidPurchases;