// src/components/purchase/PurchaseHistory.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  faFilter,
  faReceipt,
  faDownload,
  faPrint,
  faTimes,
  faChevronRight,
  faChevronDown,
  faArrowUp,
  faArrowDown,
  faWallet,
  faChartPie,
  faTrash,
  faBars,
  faThLarge,
  faList,
  faChevronLeft,
  faEllipsisV,
  faFileExport,
  faMoneyBillWave,
  faUsers,
  faStore,
  faSyncAlt,
  faAngleLeft,
  faAngleRight,
} from '@fortawesome/free-solid-svg-icons';
import './PurchaseRedesigned.css';
import api from '../../api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

// ─── Helpers (defined once at module level — never recreated) ────────────────
const formatCurrency = (amount) => {
  const numAmount = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(numAmount);
};

const formatCompactCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  if (num >= 1000000) return `LKR ${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000)    return `LKR ${(num / 1000).toFixed(1)}K`;
  return formatCurrency(num);
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  const d = dayjs(date);
  return d.isValid() ? d.format('MMM DD, YYYY') : 'N/A';
};

const formatMobileDate = (date) => {
  if (!date) return 'N/A';
  const d = dayjs(date);
  if (!d.isValid()) return 'N/A';
  if (d.isToday())     return 'Today';
  if (d.isYesterday()) return 'Yesterday';
  return d.format('MMM DD');
};

const STATUS_CONFIGS = {
  'Paid':           { class: 'paid',          icon: faCheckCircle,       text: 'Paid',    textFull: 'Paid',           color: '#10b981', bgColor: '#d1fae5' },
  'Partially Paid': { class: 'partially-paid', icon: faExclamationTriangle, text: 'Partial', textFull: 'Partially Paid',  color: '#f59e0b', bgColor: '#fef3c7' },
  'Non-Paid':       { class: 'non-paid',       icon: faClock,             text: 'Unpaid',  textFull: 'Non-Paid',        color: '#ef4444', bgColor: '#fee2e2' },
};
const getStatusConfig = (status) => STATUS_CONFIGS[status] || STATUS_CONFIGS['Non-Paid'];

// ─── Custom hooks ─────────────────────────────────────────────────────────────
const useResponsive = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    let timeoutId;
    const onResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setWidth(window.innerWidth), 150);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timeoutId); };
  }, []);

  return useMemo(() => ({
    isMobile:      width < 640,
    isTablet:      width >= 640 && width < 1024,
    isLaptop:      width >= 1024 && width < 1440,
    isDesktop:     width >= 1440 && width < 1920,
    isLargeDesktop: width >= 1920,
    width,
  }), [width]);
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// ─── Memoized sub-components (outside parent → never recreated) ───────────────

/**
 * Single table row — only re-renders when its own purchase data changes.
 * Displays BOTH Delivery Date (purchase_date) and Invoice Date (invoice_date)
 * in separate columns.
 */
const PurchaseTableRow = React.memo(({ purchase, backgroundLocation }) => {
  const statusConfig = getStatusConfig(purchase.payment_status);
  const invoiceNumber = purchase.invoice_no || purchase.invoice_number || 'N/A';

  return (
    <tr
      className="data-row"
      onClick={() => (window.location.href = `/purchase/${purchase.id}`)}
    >
      {/* Delivery Date (purchase_date) */}
      <td className="text-left">
        <div className="date-main">{formatDate(purchase.purchase_date)}</div>
      </td>

      {/* Invoice Date (invoice_date) — NEW COLUMN */}
      <td className="text-left">
        {purchase.invoice_date ? (
          <div className="date-main">{formatDate(purchase.invoice_date)}</div>
        ) : (
          <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>Not set</span>
        )}
      </td>

      <td className="text-left">
        <span className="invoice-number">{invoiceNumber}</span>
      </td>
      <td className="text-left">
        <span className="supplier-name">{purchase.supplier_name}</span>
      </td>
      <td className="text-left">
        <span className="company-tag">{purchase.company_name || 'N/A'}</span>
      </td>
      <td className="amount-cell text-right">
        <span className="amount-value">{formatCurrency(purchase.subtotal || 0)}</span>
      </td>
      <td className="amount-cell text-right">
        <span className="amount-value">{formatCurrency(purchase.vat_amount || 0)}</span>
      </td>
      <td className="amount-cell text-right">
        <span className="amount-value">{formatCurrency(purchase.total_with_vat)}</span>
      </td>
      <td className="text-left">
        <span>{purchase.payment_method || 'N/A'}</span>
      </td>
      <td className="amount-cell text-right">
        <span className="amount-paid">{formatCurrency(purchase.paid_amount)}</span>
      </td>
      <td className="amount-cell text-right">
        <span className={`amount-balance ${purchase.balance_amount > 0 ? 'due' : 'zero'}`}>
          {formatCurrency(purchase.balance_amount)}
        </span>
      </td>
      <td className="text-center">
        <div className="status-badge" style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}>
          <FontAwesomeIcon icon={statusConfig.icon} />
          <span>{statusConfig.textFull}</span>
        </div>
      </td>
      <td className="actions-col text-center" onClick={(e) => e.stopPropagation()}>
        <Link
          to={`/purchase/${purchase.id}`}
          state={{ backgroundLocation }}
          style={{
            textDecoration: 'none', background: '#3b82f6', color: 'white',
            padding: '6px 12px', borderRadius: '4px', fontSize: '13px',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}
        >
          <FontAwesomeIcon icon={faEye} /> View
        </Link>
      </td>
    </tr>
  );
});
PurchaseTableRow.displayName = 'PurchaseTableRow';

/**
 * Single card (mobile view) — displays both dates distinctly.
 */
const PurchaseCard = React.memo(({ purchase, isSelected, onToggleSelect, backgroundLocation }) => {
  const statusConfig = getStatusConfig(purchase.payment_status);
  const invoiceNumber = purchase.invoice_no || purchase.invoice_number || 'N/A';
  const total = parseFloat(purchase.total_with_vat) || 0;
  const paid = parseFloat(purchase.paid_amount) || 0;
  const paidPercentage = total > 0 ? (paid / total) * 100 : 0;

  return (
    <div className={`purchase-card-responsive ${isSelected ? 'selected' : ''}`}>
      <div className="card-checkbox-wrapper">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(purchase.id)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="card-content" onClick={() => (window.location.href = `/purchase/${purchase.id}`)}>
        <div className="card-header-responsive">
          <div className="card-status-icon" style={{ backgroundColor: statusConfig.color }}>
            <FontAwesomeIcon icon={statusConfig.icon} />
          </div>
          <div className="card-invoice-info">
            <span className="invoice-label">Invoice</span>
            <span className="invoice-value">{invoiceNumber}</span>
          </div>
          <div className="card-date-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span className="date-value" title="Delivery Date">
              D: {formatMobileDate(purchase.purchase_date)}
            </span>
            {purchase.invoice_date && (
              <span className="date-value" title="Invoice Date" style={{ fontSize: '0.85em', color: '#6b7280' }}>
                I: {formatMobileDate(purchase.invoice_date)}
              </span>
            )}
          </div>
        </div>

        <div className="card-body-responsive">
          <div className="card-supplier-row">
            <FontAwesomeIcon icon={faStore} className="row-icon" />
            <span className="supplier-value">{purchase.supplier_name}</span>
          </div>
          <div className="card-company-row">
            <FontAwesomeIcon icon={faBuilding} className="row-icon" />
            <span className="company-value">{purchase.company_name || 'N/A'}</span>
          </div>
        </div>

        {/* Dates summary for mobile — explicit and clear */}
        <div className="card-dates-responsive" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', padding: '6px 0' }}>
          <span><strong>Delivery:</strong> {formatDate(purchase.purchase_date)}</span>
          <span><strong>Invoice:</strong> {purchase.invoice_date ? formatDate(purchase.invoice_date) : 'Not set'}</span>
        </div>

        <div className="card-financials-responsive">
          <div className="financial-row">
            <span>Total</span>
            <strong>{formatCurrency(purchase.total_with_vat)}</strong>
          </div>
          <div className="financial-row">
            <span>Paid</span>
            <span className="paid-text">{formatCurrency(purchase.paid_amount)}</span>
          </div>
          <div className="financial-row">
            <span>Balance</span>
            <span className={purchase.balance_amount > 0 ? 'balance-due' : 'balance-zero'}>
              {formatCurrency(purchase.balance_amount)}
            </span>
          </div>
        </div>

        {purchase.payment_status === 'Partially Paid' && (
          <div className="card-progress-section">
            <div className="card-progress-bar">
              <div className="card-progress-fill" style={{ width: `${paidPercentage}%` }} />
            </div>
            <span className="progress-percentage">{Math.round(paidPercentage)}%</span>
          </div>
        )}

        <div className="card-footer-responsive">
          <div className="status-pill" style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}>
            {statusConfig.textFull}
          </div>
          <div className="card-actions-group" onClick={(e) => e.stopPropagation()}>
            <Link to={`/purchase/${purchase.id}`} state={{ backgroundLocation }} className="card-action-btn view">
              <FontAwesomeIcon icon={faEye} />
            </Link>
            <Link to={`/purchase/edit/${purchase.id}`} state={{ backgroundLocation }} className="card-action-btn edit">
              <FontAwesomeIcon icon={faEdit} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
});
PurchaseCard.displayName = 'PurchaseCard';

/** Mobile filter sheet — defined outside parent so it is never recreated */
const MobileFilterSheet = React.memo(({
  show, onClose, companyFilter, setCompanyFilter,
  startDate, setStartDate, endDate, setEndDate,
  statusFilter, setStatusFilter, companies, clearFilters,
}) => (
  <div className={`mobile-filter-sheet ${show ? 'active' : ''}`}>
    <div className="filter-sheet-header">
      <h3>Filters</h3>
      <button onClick={onClose}><FontAwesomeIcon icon={faTimes} /></button>
    </div>

    <div className="filter-sheet-content">
      <div className="filter-section">
        <label>Company</label>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="mobile-select">
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="filter-section">
        <label>Date Range</label>
        <div className="mobile-date-range">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start" />
          <input type="date" value={endDate}   onChange={(e) => setEndDate(e.target.value)}   placeholder="End" />
        </div>
      </div>

      <div className="filter-section">
        <label>Payment Status</label>
        <div className="status-chips">
          {['all', 'Paid', 'Partially Paid', 'Non-Paid'].map(status => (
            <button
              key={status}
              className={`status-chip ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="filter-sheet-footer">
      <button className="btn-clear-mobile" onClick={clearFilters}>Clear All</button>
      <button className="btn-apply-mobile" onClick={onClose}>Apply Filters</button>
    </div>
  </div>
));
MobileFilterSheet.displayName = 'MobileFilterSheet';

// ─── Pagination component ──────────────────────────────────────────────────────
const Pagination = React.memo(({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination-container">
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <FontAwesomeIcon icon={faAngleLeft} />
      </button>
      <span className="pagination-info">
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <FontAwesomeIcon icon={faAngleRight} />
      </button>
    </div>
  );
});
Pagination.displayName = 'Pagination';

// ─── Main component ───────────────────────────────────────────────────────────
const PurchaseHistory = () => {
  const responsive = useResponsive();
  const backgroundLocation = useLocation();

  // ── Core data
  const [purchases, setPurchases]   = useState([]);
  const [companies, setCompanies]   = useState([]);
  const [loading, setLoading]       = useState(true);

  // ── Filters
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [vatFilter, setVatFilter]         = useState('all');
  const [quickFilter, setQuickFilter]     = useState('all');

  // ── UI
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState(() => (window.innerWidth < 768 ? 'cards' : 'table'));
  const [sortConfig, setSortConfig] = useState({ key: 'purchase_date', direction: 'desc' });
  const [selectedPurchases, setSelectedPurchases] = useState(new Set());
  const [showBatchActions, setShowBatchActions]   = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const tableRef = useRef(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // ── Fetch data once, with AbortController to prevent stale updates
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchData = async () => {
      try {
        const [purchasesRes, companiesRes] = await Promise.all([
          api.get('/purchases', { signal }),
          api.get('/purchases/companies', { signal }),
        ]);
        if (!signal.aborted) {
          setPurchases(purchasesRes.data);
          setCompanies(companiesRes.data);
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error fetching data:', error);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    fetchData();

    const refreshPurchases = () => { setLoading(true); fetchData(); };
    window.addEventListener('purchase-payment-updated', refreshPurchases);
    return () => {
      controller.abort();
      window.removeEventListener('purchase-payment-updated', refreshPurchases);
    };
  }, []);

  // ── Auto-switch to cards on mobile
  useEffect(() => {
    if (responsive.isMobile && viewMode === 'table') setViewMode('cards');
  }, [responsive.isMobile, viewMode]);

  // ── Reset page when any filter changes
  useEffect(() => { setCurrentPage(1); }, [
    debouncedSearchQuery, companyFilter, startDate, endDate,
    statusFilter, vatFilter, sortConfig, quickFilter,
  ]);

  // ── Memoized filtered + sorted result (no setState — computed from deps)
  const filteredPurchases = useMemo(() => {
    let result = purchases;

    if (quickFilter !== 'all') {
      const now = dayjs();
      result = result.filter(p => {
        const d = dayjs(p.purchase_date);
        if (!d.isValid()) return false;
        switch (quickFilter) {
          case 'today':     return d.isToday();
          case 'yesterday': return d.isYesterday();
          case 'week':      return d.isAfter(now.subtract(7, 'day'));
          case 'month':     return d.isAfter(now.subtract(30, 'day'));
          default:          return true;
        }
      });
    }

    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase();
      result = result.filter(p =>
        String(p.invoice_no || p.invoice_number || '').toLowerCase().includes(q) ||
        String(p.supplier_name || '').toLowerCase().includes(q)
      );
    }

    if (companyFilter) {
      const companyName = (companies.find(c => String(c.id) === String(companyFilter))?.name || '').toLowerCase();
      result = result.filter(p =>
        String(p.company_id) === String(companyFilter) ||
        String(p.company_name || '').toLowerCase() === companyName
      );
    }

    if (startDate) result = result.filter(p => p.purchase_date && dayjs(p.purchase_date).format('YYYY-MM-DD') >= startDate);
    if (endDate)   result = result.filter(p => p.purchase_date && dayjs(p.purchase_date).format('YYYY-MM-DD') <= endDate);

    if (statusFilter !== 'all') result = result.filter(p => String(p.payment_status).toLowerCase() === statusFilter.toLowerCase());

    if (vatFilter !== 'all') {
      result = result.filter(p => {
        const hasVat = parseFloat(p.vat_amount || 0) > 0;
        return vatFilter === 'with_vat' ? hasVat : !hasVat;
      });
    }

    if (sortConfig.key) {
      const sorted = [...result];
      sorted.sort((a, b) => {
        // Date-based sorting (handles both purchase_date and invoice_date)
        if (sortConfig.key === 'purchase_date' || sortConfig.key === 'invoice_date') {
          const dateA = dayjs(a[sortConfig.key]);
          const dateB = dayjs(b[sortConfig.key]);

          // Treat invalid/missing dates as oldest
          const aValid = dateA.isValid();
          const bValid = dateB.isValid();
          if (!aValid && !bValid) return 0;
          if (!aValid) return 1;
          if (!bValid) return -1;

          return sortConfig.direction === 'asc'
            ? dateA.diff(dateB)
            : dateB.diff(dateA);
        }

        // Numeric sorting for amounts, etc.
        const av = parseFloat(a[sortConfig.key]) || 0;
        const bv = parseFloat(b[sortConfig.key]) || 0;
        return sortConfig.direction === 'asc' ? av - bv : bv - av;
      });
      return sorted;
    }

    return result;
  }, [purchases, debouncedSearchQuery, companyFilter, startDate, endDate, statusFilter, vatFilter, sortConfig, quickFilter, companies]);

  // ── Memoized page slice (prevents re-slicing on unrelated state changes)
  const totalPages   = Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE));
  const safePage     = Math.min(currentPage, totalPages);
  const pagedPurchases = useMemo(
    () => filteredPurchases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredPurchases, safePage]
  );

  // ── Memoized summary (7 passes → computed once)
  const summary = useMemo(() => ({
    total_purchases:       filteredPurchases.length,
    total_amount:          filteredPurchases.reduce((s, p) => s + (parseFloat(p.total_with_vat) || 0), 0),
    total_paid:            filteredPurchases.reduce((s, p) => s + (parseFloat(p.paid_amount)    || 0), 0),
    total_balance:         filteredPurchases.reduce((s, p) => s + (parseFloat(p.balance_amount) || 0), 0),
    paid_count:            filteredPurchases.filter(p => p.payment_status === 'Paid').length,
    non_paid_count:        filteredPurchases.filter(p => p.payment_status === 'Non-Paid').length,
    partially_paid_count:  filteredPurchases.filter(p => p.payment_status === 'Partially Paid').length,
  }), [filteredPurchases]);

  const paymentCompletionRate = summary.total_purchases > 0
    ? ((summary.paid_count / summary.total_purchases) * 100).toFixed(1)
    : 0;

  // ── Derived flags
  const hasActiveFilters = useMemo(
    () => !!(searchQuery || companyFilter || startDate || endDate || statusFilter !== 'all' || vatFilter !== 'all' || quickFilter !== 'all'),
    [searchQuery, companyFilter, startDate, endDate, statusFilter, vatFilter, quickFilter]
  );

  // ── Stable callbacks
  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setVatFilter('all');
    setQuickFilter('all');
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedPurchases(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      setShowBatchActions(next.size > 0);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedPurchases(prev => {
      if (prev.size === filteredPurchases.length) {
        setShowBatchActions(false);
        return new Set();
      }
      setShowBatchActions(true);
      return new Set(filteredPurchases.map(p => p.id));
    });
  }, [filteredPurchases]);

  const exportToCSV = useCallback(() => {
    const headers = ['Invoice #', 'Delivery Date', 'Invoice Date', 'Supplier', 'Company', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filteredPurchases.map(p => [
      p.invoice_no || p.invoice_number || 'N/A',
      formatDate(p.purchase_date),
      formatDate(p.invoice_date),
      p.supplier_name, p.company_name,
      p.total_with_vat, p.paid_amount, p.balance_amount,
      p.payment_status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = window.URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `purchases-${dayjs().format('YYYY-MM-DD')}.csv` });
    a.click();
    window.URL.revokeObjectURL(url);
  }, [filteredPurchases]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (window.confirm(`Delete ${selectedPurchases.size} purchase(s)?`)) {
      setPurchases(prev => prev.filter(p => !selectedPurchases.has(p.id)));
      setSelectedPurchases(new Set());
      setShowBatchActions(false);
    }
  }, [selectedPurchases]);

  // ── Loading state
  if (loading) {
    return (
      <div className="loading-container-responsive">
        <div className="loading-shimmer">
          <div className="shimmer-header" />
          <div className="shimmer-stats" />
          <div className="shimmer-filters" />
          <div className="shimmer-content" />
        </div>
      </div>
    );
  }

  // ── Render
  return (
    <div className={`purchase-responsive-container erp-summary-page ${responsive.isMobile ? 'mobile' : ''} ${responsive.isTablet ? 'tablet' : ''} ${responsive.isLaptop ? 'laptop' : ''} ${responsive.isDesktop ? 'desktop' : ''} ${responsive.isLargeDesktop ? 'large-desktop' : ''}`}>

      {/* Mobile filter slide-over */}
      {responsive.isMobile && (
        <MobileFilterSheet
          show={showMobileFilters}
          onClose={() => setShowMobileFilters(false)}
          companyFilter={companyFilter}
          setCompanyFilter={setCompanyFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          companies={companies}
          clearFilters={clearFilters}
        />
      )}

      <header className="responsive-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <h2 style={{ fontWeight: 'bold', margin: '0' }}>Purchasing Summary Report</h2>
      </header>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="horizontal-filter-container">
        <div className="horizontal-filter-item">
          <label>Date Range</label>
          <div className="horizontal-date-range">
            <input type="date" className="horizontal-filter-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="date-range-separator">to</span>
            <input type="date" className="horizontal-filter-input" value={endDate}   onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="horizontal-filter-item">
          <label>Search</label>
          <div className="horizontal-search-wrapper">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              className="horizontal-filter-input"
              placeholder="Search Invoice No. / Supplier"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="horizontal-filter-item">
          <label>Company</label>
          <select className="horizontal-filter-select" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="horizontal-filter-item">
          <label>Paid Status</label>
          <select className="horizontal-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Non-Paid">Non-Paid</option>
          </select>
        </div>

        <div className="horizontal-filter-item">
          <label>VAT</label>
          <select className="horizontal-filter-select" value={vatFilter} onChange={(e) => setVatFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="with_vat">With VAT</option>
            <option value="without_vat">Without VAT</option>
          </select>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="content-area-responsive" ref={tableRef}>
        {filteredPurchases.length === 0 ? (
          <div className="empty-state-responsive">
            <div className="empty-icon"><FontAwesomeIcon icon={faFileInvoice} /></div>
            <h3>No purchases found</h3>
            <p>{hasActiveFilters ? 'Try adjusting your filters' : 'Create your first purchase'}</p>
            {!hasActiveFilters && (
              <Link to="/purchase/new" state={{ backgroundLocation }} className="btn-primary-responsive">
                <FontAwesomeIcon icon={faPlus} /> Create Purchase
              </Link>
            )}
          </div>
        ) : (
          <>
            {/*
              Both table and cards are kept in the DOM — only CSS display toggles.
              This avoids a full unmount/mount cycle when switching layouts.
            */}

            {/* ── Table view ── */}
            <div
              className="table-responsive-wrapper"
              style={{ display: viewMode === 'table' && !responsive.isMobile ? 'block' : 'none' }}
              aria-hidden={viewMode !== 'table'}
            >
              <div className="table-container-responsive">
                <table className="data-table-responsive">
                  <thead>
                    <tr>
                      <th className="sortable-header text-left" onClick={() => handleSort('purchase_date')}>
                        Delivery Date {sortConfig.key === 'purchase_date' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      {/* NEW: Invoice Date column */}
                      <th className="sortable-header text-left" onClick={() => handleSort('invoice_date')}>
                        Invoice Date {sortConfig.key === 'invoice_date' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      <th className="sortable-header text-left" onClick={() => handleSort('invoice_no')}>
                        Invoice No. {sortConfig.key === 'invoice_no' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      <th className="text-left">Supplier Name</th>
                      <th className="text-left">Company</th>
                      <th className="sortable-header amount-col text-right" onClick={() => handleSort('subtotal')}>
                        Amount {sortConfig.key === 'subtotal' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      <th className="sortable-header amount-col text-right" onClick={() => handleSort('vat_amount')}>
                        VAT 18% {sortConfig.key === 'vat_amount' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      <th className="sortable-header amount-col text-right" onClick={() => handleSort('total_with_vat')}>
                        Total Amount {sortConfig.key === 'total_with_vat' && <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />}
                      </th>
                      <th className="text-left">Payment Method</th>
                      <th className="amount-col text-right">Paid Amount</th>
                      <th className="amount-col text-right">Balance</th>
                      <th>Paid Status</th>
                      <th className="actions-col">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPurchases.map(purchase => (
                      <PurchaseTableRow key={purchase.id} purchase={purchase} backgroundLocation={backgroundLocation} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Card view ── */}
            <div
              className="cards-grid-responsive"
              style={{ display: viewMode !== 'table' || responsive.isMobile ? 'grid' : 'none' }}
              aria-hidden={viewMode === 'table' && !responsive.isMobile}
            >
              {pagedPurchases.map(purchase => (
                <PurchaseCard
                  key={purchase.id}
                  purchase={purchase}
                  isSelected={selectedPurchases.has(purchase.id)}
                  onToggleSelect={toggleSelect}
                  backgroundLocation={backgroundLocation}
                />
              ))}
            </div>

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      {/* Mobile FAB */}
      {responsive.isMobile && (
        <Link to="/purchase/new" state={{ backgroundLocation }} className="mobile-fab">
          <FontAwesomeIcon icon={faPlus} />
        </Link>
      )}

      {responsive.isMobile && showMobileFilters && (
        <div className="mobile-overlay" onClick={() => setShowMobileFilters(false)} />
      )}
    </div>
  );
};

export default PurchaseHistory;