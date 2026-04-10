// src/components/purchase/PurchaseHistory.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  faStore
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

// Custom hook for responsive detection
const useResponsive = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    let timeoutId;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return {
    isMobile: windowSize.width < 640,
    isTablet: windowSize.width >= 640 && windowSize.width < 1024,
    isLaptop: windowSize.width >= 1024 && windowSize.width < 1440,
    isDesktop: windowSize.width >= 1440 && windowSize.width < 1920,
    isLargeDesktop: windowSize.width >= 1920,
    width: windowSize.width
  };
};

// Custom hook for debounced search
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const PurchaseHistory = () => {
  const responsive = useResponsive();
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [companies, setCompanies] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState(() => {
    return window.innerWidth < 768 ? 'cards' : 'table';
  });
  const [sortConfig, setSortConfig] = useState({ key: 'purchase_date', direction: 'desc' });
  const [selectedPurchases, setSelectedPurchases] = useState(new Set());
  const [hoveredRow, setHoveredRow] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const tableRef = useRef(null);

  const debouncedSearch = useDebounce(searchInput, 300);

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

  useEffect(() => {
    if (responsive.isMobile && viewMode === 'table') {
      setViewMode('cards');
    }
  }, [responsive.isMobile, viewMode]);

  useEffect(() => {
    let filtered = purchases;

    if (quickFilter !== 'all') {
      const now = dayjs();
      filtered = filtered.filter(purchase => {
        const purchaseDate = dayjs(purchase.purchase_date);
        switch(quickFilter) {
          case 'today':
            return purchaseDate.isToday();
          case 'yesterday':
            return purchaseDate.isYesterday();
          case 'week':
            return purchaseDate.isAfter(now.subtract(7, 'day'));
          case 'month':
            return purchaseDate.isAfter(now.subtract(30, 'day'));
          default:
            return true;
        }
      });
    }

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(purchase => {
        const invoiceNumber = purchase.invoice_no || purchase.invoice_number || '';
        return invoiceNumber.toLowerCase().includes(query) ||
          (purchase.supplier_name || '').toLowerCase().includes(query) ||
          (purchase.company_name || '').toLowerCase().includes(query) ||
          (purchase.check_number || '').toLowerCase().includes(query);
      });
    }

    if (companyFilter) {
      filtered = filtered.filter(purchase =>
        purchase.company_id?.toString() === companyFilter
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

    if (statusFilter !== 'all') {
      filtered = filtered.filter(purchase => purchase.payment_status === statusFilter);
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        if (sortConfig.key === 'purchase_date') {
          return sortConfig.direction === 'asc' 
            ? dayjs(a.purchase_date).diff(dayjs(b.purchase_date))
            : dayjs(b.purchase_date).diff(dayjs(a.purchase_date));
        }
        
        const aValue = parseFloat(a[sortConfig.key]) || 0;
        const bValue = parseFloat(b[sortConfig.key]) || 0;
        
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    setFilteredPurchases(filtered);
  }, [purchases, debouncedSearch, companyFilter, startDate, endDate, statusFilter, sortConfig, quickFilter]);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const formatCurrency = (amount) => {
    const numAmount = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numAmount);
  };

  const formatCompactCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    if (num >= 1000000) {
      return `LKR ${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `LKR ${(num / 1000).toFixed(1)}K`;
    }
    return formatCurrency(num);
  };

  const formatDate = (date) => {
    return dayjs(date).format('MMM DD, YYYY');
  };

  const formatMobileDate = (date) => {
    const d = dayjs(date);
    if (d.isToday()) return 'Today';
    if (d.isYesterday()) return 'Yesterday';
    return d.format('MMM DD');
  };

  const getStatusConfig = (status) => {
    const configs = {
      'Paid': {
        class: 'paid',
        icon: faCheckCircle,
        text: 'Paid',
        color: '#10b981',
        bgColor: '#d1fae5'
      },
      'Partially Paid': {
        class: 'partially-paid',
        icon: faExclamationTriangle,
        text: 'Partial',
        textFull: 'Partially Paid',
        color: '#f59e0b',
        bgColor: '#fef3c7'
      },
      'Non-Paid': {
        class: 'non-paid',
        icon: faClock,
        text: 'Unpaid',
        textFull: 'Non-Paid',
        color: '#ef4444',
        bgColor: '#fee2e2'
      }
    };
    return configs[status] || configs['Non-Paid'];
  };

  const clearFilters = () => {
    setSearchInput('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setQuickFilter('all');
  };

  const hasActiveFilters = searchInput || companyFilter || startDate || endDate || statusFilter !== 'all' || quickFilter !== 'all';

  const summary = {
    total_purchases: filteredPurchases.length,
    total_amount: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.total_with_vat) || 0), 0),
    total_paid: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.paid_amount) || 0), 0),
    total_balance: filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.balance_amount) || 0), 0),
    paid_count: filteredPurchases.filter(p => p.payment_status === 'Paid').length,
    non_paid_count: filteredPurchases.filter(p => p.payment_status === 'Non-Paid').length,
    partially_paid_count: filteredPurchases.filter(p => p.payment_status === 'Partially Paid').length,
  };

  const paymentCompletionRate = summary.total_purchases > 0 
    ? ((summary.paid_count / summary.total_purchases) * 100).toFixed(1)
    : 0;

  const exportToCSV = () => {
    const headers = ['Invoice #', 'Date', 'Supplier', 'Company', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filteredPurchases.map(p => [
      p.invoice_no || p.invoice_number || 'N/A',
      formatDate(p.purchase_date),
      p.supplier_name,
      p.company_name,
      p.total_with_vat,
      p.paid_amount,
      p.balance_amount,
      p.payment_status
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  const toggleSelectAll = () => {
    if (selectedPurchases.size === filteredPurchases.length) {
      setSelectedPurchases(new Set());
      setShowBatchActions(false);
    } else {
      setSelectedPurchases(new Set(filteredPurchases.map(p => p.id)));
      setShowBatchActions(true);
    }
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedPurchases);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPurchases(newSelected);
    setShowBatchActions(newSelected.size > 0);
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Delete ${selectedPurchases.size} purchase(s)?`)) {
      try {
        setPurchases(purchases.filter(p => !selectedPurchases.has(p.id)));
        setSelectedPurchases(new Set());
        setShowBatchActions(false);
      } catch (error) {
        console.error('Error deleting purchases:', error);
      }
    }
  };

  const MobileFilterSheet = () => (
    <div className={`mobile-filter-sheet ${showMobileFilters ? 'active' : ''}`}>
      <div className="filter-sheet-header">
        <h3>Filters</h3>
        <button onClick={() => setShowMobileFilters(false)}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
      
      <div className="filter-sheet-content">
        <div className="filter-section">
          <label>Quick Filters</label>
          <div className="quick-filters-grid">
            {['all', 'today', 'yesterday', 'week', 'month'].map(filter => (
              <button
                key={filter}
                className={`quick-filter-btn ${quickFilter === filter ? 'active' : ''}`}
                onClick={() => setQuickFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <label>Company</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="mobile-select"
          >
            <option value="">All Companies</option>
            {companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-section">
          <label>Date Range</label>
          <div className="mobile-date-range">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End"
            />
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
        <button className="btn-clear-mobile" onClick={clearFilters}>
          Clear All
        </button>
        <button className="btn-apply-mobile" onClick={() => setShowMobileFilters(false)}>
          Apply Filters
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="loading-container-responsive">
        <div className="loading-shimmer">
          <div className="shimmer-header"></div>
          <div className="shimmer-stats"></div>
          <div className="shimmer-filters"></div>
          <div className="shimmer-content"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`purchase-responsive-container ${responsive.isMobile ? 'mobile' : ''} ${responsive.isTablet ? 'tablet' : ''} ${responsive.isLaptop ? 'laptop' : ''} ${responsive.isDesktop ? 'desktop' : ''} ${responsive.isLargeDesktop ? 'large-desktop' : ''}`}>
      
      {responsive.isMobile && <MobileFilterSheet />}

      {/* Header */}
      <header className="responsive-header">
        <div className="header-main">
          <div className="header-title-section">
            {responsive.isMobile && (
              <button className="mobile-menu-btn" onClick={() => setShowMobileMenu(!showMobileMenu)}>
                <FontAwesomeIcon icon={faBars} />
              </button>
            )}
            <div className="title-wrapper">
              <h1 className="responsive-title">
                <FontAwesomeIcon icon={faFileInvoice} className="title-icon" />
                Purchase History
              </h1>
              <p className="title-subtitle">Track and manage your procurement activities</p>
            </div>
          </div>
          
          <div className="header-actions-responsive">
            {!responsive.isMobile && (
              <>
                <button className="action-btn-secondary" onClick={exportToCSV} title="Export">
                  <FontAwesomeIcon icon={faDownload} />
                  <span className="btn-text">Export</span>
                </button>
                <button className="action-btn-secondary" onClick={() => window.print()} title="Print">
                  <FontAwesomeIcon icon={faPrint} />
                  <span className="btn-text">Print</span>
                </button>
              </>
            )}
            
            <div className="view-toggle-responsive">
              <button 
                className={`toggle-option ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                disabled={responsive.isMobile}
                title="Table View"
              >
                <FontAwesomeIcon icon={faList} />
              </button>
              <button 
                className={`toggle-option ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                title="Card View"
              >
                <FontAwesomeIcon icon={faThLarge} />
              </button>
            </div>

            <Link to="/purchase/new" className="btn-primary-responsive">
              <FontAwesomeIcon icon={faPlus} />
              <span className="btn-text">New Purchase</span>
            </Link>
          </div>
        </div>

        {responsive.isMobile && showMobileMenu && (
          <div className="mobile-menu-dropdown">
            <button onClick={exportToCSV}>
              <FontAwesomeIcon icon={faDownload} /> Export CSV
            </button>
            <button onClick={() => window.print()}>
              <FontAwesomeIcon icon={faPrint} /> Print
            </button>
            <button onClick={() => { clearFilters(); setShowMobileMenu(false); }}>
              <FontAwesomeIcon icon={faTimes} /> Clear Filters
            </button>
          </div>
        )}
      </header>

      {/* Stats Cards - Single Row Layout */}
      <div className="stats-row-responsive">
        <div className="stat-card-row primary">
          <div className="stat-row-content">
            <div className="stat-row-icon">
              <FontAwesomeIcon icon={faWallet} />
            </div>
            <div className="stat-row-info">
              <span className="stat-row-label">Total Spend</span>
              <span className="stat-row-value">
                {responsive.isMobile ? formatCompactCurrency(summary.total_amount) : formatCurrency(summary.total_amount)}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card-row success">
          <div className="stat-row-content">
            <div className="stat-row-icon">
              <FontAwesomeIcon icon={faCheckCircle} />
            </div>
            <div className="stat-row-info">
              <span className="stat-row-label">Paid</span>
              <span className="stat-row-value">
                {responsive.isMobile ? formatCompactCurrency(summary.total_paid) : formatCurrency(summary.total_paid)}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card-row warning">
          <div className="stat-row-content">
            <div className="stat-row-icon">
              <FontAwesomeIcon icon={faExclamationTriangle} />
            </div>
            <div className="stat-row-info">
              <span className="stat-row-label">Pending</span>
              <span className="stat-row-value">
                {responsive.isMobile ? formatCompactCurrency(summary.total_balance) : formatCurrency(summary.total_balance)}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card-row info">
          <div className="stat-row-content">
            <div className="stat-row-icon">
              <FontAwesomeIcon icon={faChartPie} />
            </div>
            <div className="stat-row-info">
              <span className="stat-row-label">Completion</span>
              <span className="stat-row-value">{paymentCompletionRate}%</span>
              <span className="stat-row-subtext">({summary.paid_count} of {summary.total_purchases})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="quick-stats-row">
        <div className="stat-chip-row">
          <span className="chip-dot paid"></span>
          <span>Paid: {summary.paid_count}</span>
        </div>
        <div className="stat-chip-row">
          <span className="chip-dot partial"></span>
          <span>Partial: {summary.partially_paid_count}</span>
        </div>
        <div className="stat-chip-row">
          <span className="chip-dot unpaid"></span>
          <span>Unpaid: {summary.non_paid_count}</span>
        </div>
        <div className="stat-chip-row total">
          <span>Total: {summary.total_purchases}</span>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-section-responsive">
        <div className="search-wrapper-responsive">
          <FontAwesomeIcon icon={faSearch} className="search-icon-abs" />
          <input
            type="text"
            placeholder="Search by invoice, supplier, or company..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input-responsive"
          />
          {searchInput && (
            <button className="clear-search-btn" onClick={() => setSearchInput('')}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        {responsive.isMobile ? (
          <button 
            className={`filter-fab ${hasActiveFilters ? 'active' : ''}`}
            onClick={() => setShowMobileFilters(true)}
          >
            <FontAwesomeIcon icon={faFilter} />
            {hasActiveFilters && <span className="filter-badge-mobile"></span>}
          </button>
        ) : (
          <button 
            className={`filter-btn-responsive ${hasActiveFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <FontAwesomeIcon icon={faFilter} />
            <span>Filters</span>
            {hasActiveFilters && <span className="filter-count-badge"></span>}
          </button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="active-filters-responsive">
          <div className="filters-scroll">
            {quickFilter !== 'all' && (
              <div className="filter-tag-responsive">
                <span>{quickFilter.charAt(0).toUpperCase() + quickFilter.slice(1)}</span>
                <button onClick={() => setQuickFilter('all')}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
            {companyFilter && (
              <div className="filter-tag-responsive">
                <span>{companies.find(c => c.id.toString() === companyFilter)?.name}</span>
                <button onClick={() => setCompanyFilter('')}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
            {startDate && (
              <div className="filter-tag-responsive">
                <span>From {formatMobileDate(startDate)}</span>
                <button onClick={() => setStartDate('')}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
            {endDate && (
              <div className="filter-tag-responsive">
                <span>To {formatMobileDate(endDate)}</span>
                <button onClick={() => setEndDate('')}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
            {statusFilter !== 'all' && (
              <div className="filter-tag-responsive">
                <span>{statusFilter}</span>
                <button onClick={() => setStatusFilter('all')}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            )}
          </div>
          <button className="clear-filters-link" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {/* Expanded Filters Panel */}
      {!responsive.isMobile && showFilters && (
        <div className="filters-panel-responsive">
          <div className="filters-grid-responsive">
            <div className="filter-group-responsive">
              <label>Quick Date</label>
              <div className="quick-date-buttons">
                {['all', 'today', 'week', 'month'].map(filter => (
                  <button
                    key={filter}
                    className={`quick-date-btn ${quickFilter === filter ? 'active' : ''}`}
                    onClick={() => setQuickFilter(filter)}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group-responsive">
              <label>Company</label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="filter-select-responsive"
              >
                <option value="">All Companies</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group-responsive">
              <label>Date Range</label>
              <div className="date-inputs-responsive">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="date-input"
                />
                <span className="date-separator">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="date-input"
                />
              </div>
            </div>

            <div className="filter-group-responsive">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select-responsive"
              >
                <option value="all">All Status</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Non-Paid">Non-Paid</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Batch Actions Bar */}
      {showBatchActions && selectedPurchases.size > 0 && (
        <div className="batch-bar-responsive">
          <div className="batch-info">
            <button className="batch-close" onClick={() => { setSelectedPurchases(new Set()); setShowBatchActions(false); }}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
            <span className="batch-count">{selectedPurchases.size} selected</span>
          </div>
          <div className="batch-actions-group">
            <button className="batch-action-btn" onClick={exportToCSV}>
              <FontAwesomeIcon icon={faDownload} />
              {!responsive.isMobile && <span>Export</span>}
            </button>
            {!responsive.isMobile && (
              <button className="batch-action-btn" onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} />
                <span>Print</span>
              </button>
            )}
            <button className="batch-action-btn danger" onClick={handleBatchDelete}>
              <FontAwesomeIcon icon={faTrash} />
              {!responsive.isMobile && <span>Delete</span>}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="content-area-responsive">
        {filteredPurchases.length === 0 ? (
          <div className="empty-state-responsive">
            <div className="empty-icon">
              <FontAwesomeIcon icon={faFileInvoice} />
            </div>
            <h3>No purchases found</h3>
            <p>{hasActiveFilters ? 'Try adjusting your filters' : 'Create your first purchase'}</p>
            {!hasActiveFilters && (
              <Link to="/purchase/new" className="btn-primary-responsive">
                <FontAwesomeIcon icon={faPlus} />
                Create Purchase
              </Link>
            )}
          </div>
        ) : viewMode === 'table' && !responsive.isMobile ? (
          <div className="table-responsive-wrapper">
            <div className="table-container-responsive" ref={tableRef}>
              <table className="data-table-responsive">
                <thead>
                  <tr>
                    <th className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedPurchases.size === filteredPurchases.length && filteredPurchases.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('invoice_no')}>
                      Invoice #
                      {sortConfig.key === 'invoice_no' && (
                        <FontAwesomeIcon 
                          icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown}
                          className="sort-indicator"
                        />
                      )}
                    </th>
                    <th className="sortable-header" onClick={() => handleSort('purchase_date')}>
                      Date
                      {sortConfig.key === 'purchase_date' && (
                        <FontAwesomeIcon 
                          icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown}
                          className="sort-indicator"
                        />
                      )}
                    </th>
                    <th>Supplier</th>
                    <th>Company</th>
                    <th className="sortable-header amount-col" onClick={() => handleSort('total_with_vat')}>
                      Total
                      {sortConfig.key === 'total_with_vat' && (
                        <FontAwesomeIcon 
                          icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown}
                          className="sort-indicator"
                        />
                      )}
                    </th>
                    <th className="amount-col">Paid</th>
                    <th className="amount-col">Balance</th>
                    <th>Status</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map(purchase => {
                    const statusConfig = getStatusConfig(purchase.payment_status);
                    const invoiceNumber = purchase.invoice_no || purchase.invoice_number || 'N/A';
                    const paidPercentage = (parseFloat(purchase.paid_amount) / parseFloat(purchase.total_with_vat)) * 100;
                    
                    return (
                      <tr 
                        key={purchase.id}
                        className={`data-row ${hoveredRow === purchase.id ? 'hovered' : ''} ${selectedPurchases.has(purchase.id) ? 'selected' : ''}`}
                        onMouseEnter={() => setHoveredRow(purchase.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => window.location.href = `/purchase/${purchase.id}`}
                      >
                        <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedPurchases.has(purchase.id)}
                            onChange={() => toggleSelect(purchase.id)}
                          />
                        </td>
                        <td>
                          <div className="invoice-cell">
                            <FontAwesomeIcon icon={faReceipt} className="invoice-icon" />
                            <span className="invoice-number">{invoiceNumber}</span>
                          </div>
                        </td>
                        <td>
                          <div className="date-cell">
                            <span className="date-main">{formatDate(purchase.purchase_date)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="supplier-cell">
                            <span className="supplier-name">{purchase.supplier_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="company-tag">{purchase.company_name}</span>
                        </td>
                        <td className="amount-cell">
                          <span className="amount-value">{formatCurrency(purchase.total_with_vat)}</span>
                        </td>
                        <td className="amount-cell">
                          <span className="amount-paid">{formatCurrency(purchase.paid_amount)}</span>
                          {purchase.payment_status === 'Partially Paid' && (
                            <div className="mini-progress-bar">
                              <div className="mini-progress-fill" style={{ width: `${paidPercentage}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="amount-cell">
                          <span className={`amount-balance ${purchase.balance_amount > 0 ? 'due' : 'zero'}`}>
                            {formatCurrency(purchase.balance_amount)}
                          </span>
                        </td>
                        <td>
                          <div 
                            className="status-badge"
                            style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
                          >
                            <FontAwesomeIcon icon={statusConfig.icon} />
                            <span>{statusConfig.textFull}</span>
                          </div>
                        </td>
                        <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons-group">
                            <Link to={`/purchase/${purchase.id}`} className="action-btn-icon view">
                              <FontAwesomeIcon icon={faEye} />
                            </Link>
                            <Link to={`/purchase/edit/${purchase.id}`} className="action-btn-icon edit">
                              <FontAwesomeIcon icon={faEdit} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="cards-grid-responsive">
            {filteredPurchases.map(purchase => {
              const statusConfig = getStatusConfig(purchase.payment_status);
              const invoiceNumber = purchase.invoice_no || purchase.invoice_number || 'N/A';
              const paidPercentage = (parseFloat(purchase.paid_amount) / parseFloat(purchase.total_with_vat)) * 100;
              
              return (
                <div 
                  key={purchase.id} 
                  className={`purchase-card-responsive ${selectedPurchases.has(purchase.id) ? 'selected' : ''}`}
                >
                  <div className="card-checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={selectedPurchases.has(purchase.id)}
                      onChange={() => toggleSelect(purchase.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  
                  <div className="card-content" onClick={() => window.location.href = `/purchase/${purchase.id}`}>
                    <div className="card-header-responsive">
                      <div className="card-status-icon" style={{ backgroundColor: statusConfig.color }}>
                        <FontAwesomeIcon icon={statusConfig.icon} />
                      </div>
                      <div className="card-invoice-info">
                        <span className="invoice-label">Invoice</span>
                        <span className="invoice-value">{invoiceNumber}</span>
                      </div>
                      <div className="card-date-info">
                        <span className="date-value">{formatMobileDate(purchase.purchase_date)}</span>
                      </div>
                    </div>
                    
                    <div className="card-body-responsive">
                      <div className="card-supplier-row">
                        <FontAwesomeIcon icon={faStore} className="row-icon" />
                        <span className="supplier-value">{purchase.supplier_name}</span>
                      </div>
                      <div className="card-company-row">
                        <FontAwesomeIcon icon={faBuilding} className="row-icon" />
                        <span className="company-value">{purchase.company_name}</span>
                      </div>
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
                      <div 
                        className="status-pill"
                        style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
                      >
                        {statusConfig.textFull}
                      </div>
                      <div className="card-actions-group" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/purchase/${purchase.id}`} className="card-action-btn view">
                          <FontAwesomeIcon icon={faEye} />
                        </Link>
                        <Link to={`/purchase/edit/${purchase.id}`} className="card-action-btn edit">
                          <FontAwesomeIcon icon={faEdit} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      {responsive.isMobile && (
        <Link to="/purchase/new" className="mobile-fab">
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