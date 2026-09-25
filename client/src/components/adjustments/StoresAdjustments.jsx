import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCalendarAlt, faBox, faFileAlt, faChevronLeft, 
  faChevronRight, faTimes, faEye, faEdit, faTrash, faPrint,
  faDownload, faFilter, faSync, faPlus, faInfoCircle,
  faCheckCircle, faExclamationCircle, faClock, faBan
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';
import { formatCurrency, formatNumber, formatQuantity } from '../../utils/formatters';
import InvoiceAdjustmentsTab from './tabs/InvoiceAdjustmentsTab';
import IssuanceAdjustmentsTab from './tabs/IssuanceAdjustmentsTab';
import WastageAdjustmentsTab from './tabs/WastageAdjustmentsTab';
import PurchasingPaymentAdjustmentsTab from './tabs/PurchasingPaymentAdjustmentsTab';
import RecordAdjustmentsTab from './tabs/RecordAdjustmentsTab';

const SUMMARY_TABS = [
  { key: 'Department', label: 'Department Adjustments' },
  { key: 'Invoice', label: 'Invoice Adjustments' },
  { key: 'Issuance', label: 'Issuance Adjustments' },
  { key: 'Wastage', label: 'Wastage Adjustments' },
  { key: 'Purchasing Payment', label: 'Purchasing Payment' },
  { key: 'Petty Cash Voucher', label: 'Petty Cash Adjustment' },
  { key: 'Expense Bill', label: 'Expense Adjustment' },
];

// Reusable Skeleton Component
const TableSkeleton = ({ rows = 5, cols = 8 }) => (
  <div className="table-responsive">
    <table className="adjustments-table">
      <thead>
        <tr>
          {[...Array(cols)].map((_, i) => (
            <th key={i}><div className="skeleton skeleton-text" style={{ width: '80%' }} /></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...Array(rows)].map((_, i) => (
          <tr key={i}>
            {[...Array(cols)].map((_, j) => (
              <td key={j}>
                <div className="skeleton skeleton-text" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Reusable Status Badge
const StatusBadge = ({ status }) => {
  const statusMap = {
    'pending': { label: 'Pending', icon: faClock, className: 'pending' },
    'approved': { label: 'Approved', icon: faCheckCircle, className: 'approved' },
    'completed': { label: 'Completed', icon: faCheckCircle, className: 'completed' },
    'cancelled': { label: 'Cancelled', icon: faBan, className: 'cancelled' },
    'draft': { label: 'Draft', icon: faFileAlt, className: 'draft' },
  };

  const config = statusMap[status?.toLowerCase()] || statusMap['pending'];
  
  return (
    <span className={`status-badge ${config.className}`}>
      <FontAwesomeIcon icon={config.icon} />
      {config.label}
    </span>
  );
};

// Reusable Modal Component
const Modal = ({ isOpen, onClose, title, message, type = 'info', onConfirm, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
  if (!isOpen) return null;

  const typeIcons = {
    danger: faExclamationCircle,
    success: faCheckCircle,
    warning: faExclamationCircle,
    info: faInfoCircle
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-icon ${type}`}>
          <FontAwesomeIcon icon={typeIcons[type] || faInfoCircle} />
        </div>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          {onConfirm && (
            <button className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
              {confirmText}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Reusable Summary Card
const SummaryCard = ({ label, value, sub, icon, type = 'primary' }) => (
  <div className={`summary-card ${type}`}>
    <div className="summary-card-icon">
      <FontAwesomeIcon icon={icon} />
    </div>
    <div className="summary-card-label">{label}</div>
    <div className="summary-card-value">{value}</div>
    {sub && <div className="summary-card-sub">{sub}</div>}
  </div>
);

const StoresAdjustments = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Category tabs added on top of the existing Department (stock_adjustments) view.
  // Defaults to Department so existing behavior is unchanged unless another tab is picked.
  const [activeTab, setActiveTab] = useState('Department');

  // State
  const [adjustments, setAdjustments] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    item_id: 'all',
    status: 'all',
    reference_note: '',
    search: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Sorting
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Selected row details
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const [modalConfig, setModalConfig] = useState({ isOpen: false });

  // Fetch data
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchAdjustments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.item_id !== 'all') params.append('item_id', filters.item_id);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.reference_note) params.append('reference_note', filters.reference_note);
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/adjustments/summary/Department?${params.toString()}`);
      setAdjustments(response.data);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error fetching adjustments:', error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to load adjustments. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const shouldDebounce = Boolean(filters.search || filters.reference_note);
    const timer = setTimeout(() => {
      fetchAdjustments();
    }, shouldDebounce ? 400 : 0);
    return () => clearTimeout(timer);
  }, [filters.search, filters.reference_note, filters.startDate, filters.endDate, filters.item_id, filters.status, fetchAdjustments]);

  // Handlers
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAdjustments();
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      item_id: 'all',
      status: 'all',
      reference_note: '',
      search: ''
    });
    setTimeout(fetchAdjustments, 0);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = (adjustment) => {
    setModalConfig({
      isOpen: true,
      type: 'danger',
      title: 'Confirm Delete',
      message: `Are you sure you want to delete adjustment #${adjustment.id}? This action cannot be undone.`,
      onConfirm: () => confirmDelete(adjustment.id)
    });
  };

  const confirmDelete = async (id) => {
    try {
      await api.delete(`/adjustments/${id}`);
      setModalConfig({ isOpen: false });
      fetchAdjustments();
      setModalConfig({
        isOpen: true,
        type: 'success',
        title: 'Deleted Successfully',
        message: 'The adjustment record has been removed.'
      });
    } catch (error) {
      console.error('Error deleting adjustment:', error);
      setModalConfig({
        isOpen: true,
        type: 'error',
        title: 'Delete Failed',
        message: 'Unable to delete the adjustment. Please try again.'
      });
    }
  };

  const handleViewDetails = (adjustment) => {
    setSelectedAdjustment(selectedAdjustment?.id === adjustment.id ? null : adjustment);
  };

  const handlePrint = () => {
    window.print();
  };

  // Computed data
  const sortedAdjustments = useMemo(() => {
    const sorted = [...adjustments];
    sorted.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [adjustments, sortField, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedAdjustments.slice(start, start + itemsPerPage);
  }, [sortedAdjustments, currentPage]);

  const totalPages = Math.ceil(sortedAdjustments.length / itemsPerPage);

  // Summary stats
  const stats = useMemo(() => {
    const total = adjustments.length;
    const positive = adjustments.filter(a => parseFloat(a.variance) > 0).length;
    const negative = adjustments.filter(a => parseFloat(a.variance) < 0).length;
    const totalValue = adjustments.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    
    return { total, positive, negative, totalValue };
  }, [adjustments]);

  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Adjustment Summary</h2>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="card" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SUMMARY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'Invoice' && <InvoiceAdjustmentsTab />}
      {activeTab === 'Issuance' && <IssuanceAdjustmentsTab />}
      {activeTab === 'Wastage' && <WastageAdjustmentsTab />}
      {activeTab === 'Purchasing Payment' && <PurchasingPaymentAdjustmentsTab />}
      {['Petty Cash Voucher', 'Expense Bill'].includes(activeTab) && (
        <RecordAdjustmentsTab key={activeTab} category={activeTab} />
      )}

      {activeTab === 'Department' && (
      <>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        <SummaryCard 
          label="Total Adjustments" 
          value={stats.total} 
          icon={faFileAlt}
          type="primary"
        />
        <SummaryCard 
          label="Positive Adjustments" 
          value={stats.positive} 
          icon={faCheckCircle}
          type="success"
        />
        <SummaryCard 
          label="Negative Adjustments" 
          value={stats.negative} 
          icon={faExclamationCircle}
          type="danger"
        />
        <SummaryCard 
          label="Total Value Adjusted" 
          value={formatCurrency(stats.totalValue)} 
          icon={faBox}
          type="warning"
        />
      </div>

      {/* Filter Section */}
      <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        <div className="filter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
          <h4 style={{ margin: 0 }}><FontAwesomeIcon icon={faFilter} style={{ marginRight: '8px' }} /> Filter Adjustments</h4>
          <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? <FontAwesomeIcon icon={faTimes} /> : <FontAwesomeIcon icon={faSearch} />}
            {showFilters ? ' Hide Filters' : ' Show Filters'}
          </button>
        </div>
        
        {showFilters && (
          <form onSubmit={handleSearch} className="filter-form adjustment-filter-form">
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faSearch} /> Search</label>
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="Search items, notes..."
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> From Date</label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> To Date</label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="filter-actions">
              <button type="submit" className="btn btn-primary">
                <FontAwesomeIcon icon={faSearch} /> Apply Filters
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                <FontAwesomeIcon icon={faSync} /> Reset
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Adjustment Records</h3>
          <div className="data-card-actions">
            <span className="pagination-entries" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {formatNumber(adjustments.length)} entries found
            </span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={8} />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="report-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('date')} className={sortField === 'date' ? 'active' : ''}>
                      Date <span className="sort-icon">↕</span>
                    </th>
                    <th onClick={() => handleSort('item_name')} className={sortField === 'item_name' ? 'active' : ''}>
                      Item <span className="sort-icon">↕</span>
                    </th>
                    <th>System Qty</th>
                    <th>Actual Qty</th>
                    <th onClick={() => handleSort('variance')} className={sortField === 'variance' ? 'active' : ''}>
                      Variance <span className="sort-icon">↕</span>
                    </th>
                    <th onClick={() => handleSort('amount')} className={sortField === 'amount' ? 'active' : ''}>
                      Amount <span className="sort-icon">↕</span>
                    </th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((adj) => {
                      const varianceNum = parseFloat(adj.variance);
                      const isLoss = varianceNum < 0;
                      const isGain = varianceNum > 0;
                      
                      return (
                        <tr 
                          key={adj.id} 
                          className={selectedAdjustment?.id === adj.id ? 'selected-row' : ''}
                          onClick={() => handleViewDetails(adj)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>{new Date(adj.date).toLocaleDateString()} <br />
                            <small style={{ color: 'var(--text-light)', fontSize: '10px' }}>
                              {new Date(adj.date).toLocaleTimeString()}
                            </small>
                          </td>
                          <td>
                            <strong>{adj.item_name}</strong>
                            {adj.item_code && <div style={{ fontSize: '12px', color: 'var(--text-light)' }}>{adj.item_code}</div>}
                          </td>
                          <td>{formatQuantity(adj.system_qty)} {adj.unit}</td>
                          <td>{formatQuantity(adj.actual_qty)} {adj.unit}</td>
                          <td className={isLoss ? 'text-danger fw-bold' : isGain ? 'text-success fw-bold' : ''}>
                            {isGain ? '+' : ''}{formatQuantity(varianceNum)} {adj.unit}
                          </td>
                          <td className={isLoss ? 'text-danger fw-bold' : ''}>
                            {formatCurrency(adj.amount)}
                          </td>
                          <td><StatusBadge status={adj.status || 'completed'} /></td>
                          <td className="truncate-text" title={adj.reason}>{adj.reason}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button 
                                className="btn btn-sm btn-outline" 
                                onClick={() => handleViewDetails(adj)}
                                title="View Details"
                              >
                                <FontAwesomeIcon icon={faEye} />
                              </button>
                              <button 
                                className="btn btn-sm btn-secondary" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/adjustments/edit/${adj.id}`, { state: { backgroundLocation: location } });
                                }}
                                title="Edit"
                              >
                                <FontAwesomeIcon icon={faEdit} />
                              </button>
                              <button 
                                className="btn btn-sm btn-danger" 
                                onClick={() => handleDelete(adj)}
                                title="Delete"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="9" className="empty-state">
                        <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: '32px', display: 'block', marginBottom: '12px', opacity: 0.3 }} />
                        No adjustment records found.
                        <br />
                        <small style={{ color: 'var(--text-light)' }}>Try adjusting your filters or create a new adjustment.</small>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <div className="pagination-controls">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                    disabled={currentPage === 1}
                    className="page-btn"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                    disabled={currentPage === totalPages}
                    className="page-btn"
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
                <span className="page-info">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Details Panel */}
      {selectedAdjustment && (
        <div className="details-panel slide-up">
          <div className="details-panel-header">
            <h3>Adjustment Details</h3>
            <span className="close-btn" onClick={() => setSelectedAdjustment(null)}>×</span>
          </div>
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Adjusted By</span>
              <span className="detail-value">{selectedAdjustment.user_name || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Date & Time</span>
              <span className="detail-value">{new Date(selectedAdjustment.date).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Reference Note</span>
              <span className="detail-value">{selectedAdjustment.reference_note || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Unit Price</span>
              <span className="detail-value">{formatCurrency(selectedAdjustment.unit_price)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Status</span>
              <span className="detail-value"><StatusBadge status={selectedAdjustment.status || 'completed'} /></span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Variance</span>
              <span className={`detail-value ${parseFloat(selectedAdjustment.variance) < 0 ? 'text-danger' : 'text-success'}`}>
                {parseFloat(selectedAdjustment.variance) > 0 ? '+' : ''}
                {formatQuantity(selectedAdjustment.variance)} {selectedAdjustment.unit}
              </span>
            </div>
            <div className="detail-item full-width">
              <span className="detail-label">Reason</span>
              <span className="detail-value reason-text">{selectedAdjustment.reason}</span>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Modal */}
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      />
    </div>
  );
};

export default StoresAdjustments;
