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
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [companies, setCompanies] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [vatFilter, setVatFilter] = useState('all');
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

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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

    const refreshPurchases = () => {
      fetchData();
    };

    window.addEventListener('purchase-payment-updated', refreshPurchases);
    return () => {
      window.removeEventListener('purchase-payment-updated', refreshPurchases);
    };
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

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(purchase => {
        const invoiceNumber = String(purchase.invoice_no || purchase.invoice_number || '');
        const supplierName = String(purchase.supplier_name || '');
        return invoiceNumber.toLowerCase().includes(query) || supplierName.toLowerCase().includes(query);
      });
    }

    if (companyFilter) {
      // Filter by company_id (matching the selected company.id from dropdown)
      filtered = filtered.filter(purchase =>
        String(purchase.company_id) === String(companyFilter) ||
        String(purchase.company_name || '').toLowerCase() === String(
          companies.find(c => String(c.id) === String(companyFilter))?.name || ''
        ).toLowerCase()
      );
    }

    if (startDate) {
      filtered = filtered.filter(purchase => {
        if (!purchase.purchase_date) return false;
        return dayjs(purchase.purchase_date).format('YYYY-MM-DD') >= startDate;
      });
    }

    if (endDate) {
      filtered = filtered.filter(purchase => {
        if (!purchase.purchase_date) return false;
        return dayjs(purchase.purchase_date).format('YYYY-MM-DD') <= endDate;
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(purchase => String(purchase.payment_status).toLowerCase() === String(statusFilter).toLowerCase());
    }

    if (vatFilter !== 'all') {
      filtered = filtered.filter(purchase => {
        const hasVat = parseFloat(purchase.vat_amount || 0) > 0;
        return vatFilter === 'with_vat' ? hasVat : !hasVat;
      });
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
  }, [purchases, debouncedSearchQuery, companyFilter, startDate, endDate, statusFilter, vatFilter, sortConfig, quickFilter]);

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
    setSearchQuery('');
    setCompanyFilter('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('all');
    setVatFilter('all');
    setQuickFilter('all');
  };

  const hasActiveFilters = searchQuery || companyFilter || startDate || endDate || statusFilter !== 'all' || vatFilter !== 'all' || quickFilter !== 'all';

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

      <header className="responsive-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <h2 style={{ fontWeight: 'bold', margin: '0' }}>Purchasing Summary Report</h2>
      </header>

      {/* Search and Filter Bar */}
      <div className="search-filters-container">
        <div className="filter-group filter-group--date-range">
          <label>Date Range</label>
          <div className="date-range-group">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="date-range-separator">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="filter-group">
          <label>Search</label>
          <div className="search-input-wrapper">
            <FontAwesomeIcon icon={faSearch} className="search-input-icon" />
            <input
              type="text"
              placeholder="Search Invoice No. / Supplier"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-group">
          <label>Company</label>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Paid Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Non-Paid">Non-Paid</option>
          </select>
        </div>
        <div className="filter-group">
          <label>VAT</label>
          <select value={vatFilter} onChange={(e) => setVatFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="with_vat">With VAT</option>
            <option value="without_vat">Without VAT</option>
          </select>
        </div>
      </div>

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
                    <th className="sortable-header text-left" onClick={() => handleSort('purchase_date')}>
                      Date
                      {sortConfig.key === 'purchase_date' && (
                        <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />
                      )}
                    </th>
                    <th className="sortable-header text-left" onClick={() => handleSort('invoice_no')}>
                      Invoice No.
                      {sortConfig.key === 'invoice_no' && (
                        <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />
                      )}
                    </th>
                    <th className="text-left">Supplier Name</th>
                    <th className="text-left">Company</th>
                    <th className="sortable-header amount-col text-right" onClick={() => handleSort('subtotal')}>
                      Amount
                      {sortConfig.key === 'subtotal' && (
                        <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />
                      )}
                    </th>
                    <th className="sortable-header amount-col text-right" onClick={() => handleSort('vat_amount')}>
                      VAT 18%
                      {sortConfig.key === 'vat_amount' && (
                        <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />
                      )}
                    </th>
                    <th className="sortable-header amount-col text-right" onClick={() => handleSort('total_with_vat')}>
                      Total Amount
                      {sortConfig.key === 'total_with_vat' && (
                        <FontAwesomeIcon icon={sortConfig.direction === 'asc' ? faArrowUp : faArrowDown} className="sort-indicator" />
                      )}
                    </th>
                    <th className="text-left">Payment Method</th>
                    <th className="amount-col text-right">Paid Amount</th>
                    <th className="amount-col text-right">Balance</th>
                    <th>Paid Status</th>
                    <th className="actions-col">View Button</th>
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
                        <td className="text-left">
                          <div className="date-cell">
                            <span className="date-main">{formatDate(purchase.purchase_date)}</span>
                          </div>
                        </td>
                        <td className="text-left">
                          <span className="invoice-number">{invoiceNumber}</span>
                        </td>
                        <td className="text-left">
                          <span className="supplier-name">{purchase.supplier_name}</span>
                        </td>
                        <td className="text-left">
                          <span style={{ fontSize: '13px', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{purchase.company_name || 'N/A'}</span>
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
                          <div 
                            className="status-badge"
                            style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
                          >
                            <FontAwesomeIcon icon={statusConfig.icon} />
                            <span>{statusConfig.textFull}</span>
                          </div>
                        </td>
                        <td className="actions-col text-center" onClick={(e) => e.stopPropagation()}>
                          <Link to={`/purchase/${purchase.id}`} style={{ textDecoration: 'none', background: '#3b82f6', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <FontAwesomeIcon icon={faEye} /> View
                          </Link>
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