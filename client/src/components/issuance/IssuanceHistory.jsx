import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCalendarAlt, faFilter, faPlus, faEye, 
  faEdit, faSync, faChevronLeft, faChevronRight, 
  faBuilding, faTimes, faTruckLoading, faFileAlt 
} from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';
import { formatNumber, formatQuantity } from '../../utils/formatters';

const ModalPortal = ({ children, onClose }) => {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="issuance-modal-overlay" onClick={onClose}>
      <div className="issuance-modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
};

// Modal version of IssuanceDetails for popup use - FIXED UI
const IssuanceDetailsModal = ({ id, onClose }) => {
  const [issuance, setIssuance] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchIssuance = async () => {
      try {
        const response = await api.get(`/issuances/${id}`);
        setIssuance(response.data);
      } catch (err) {
        showPopup('error', 'Failed to fetch issuance details');
      } finally {
        setLoading(false);
      }
    };
    fetchIssuance();
  }, [id, showPopup]);

  if (loading) return (
    <div className="empty-state" style={{ minHeight: '200px' }}>
      <FontAwesomeIcon icon={faSync} spin style={{ fontSize: '28px', opacity: 0.5 }} />
      <p>Loading issuance details...</p>
    </div>
  );
  
  if (!issuance) return (
    <div className="empty-state" style={{ minHeight: '200px' }}>
      <p>No issuance data found</p>
      <button onClick={onClose} className="btn btn-secondary">Close</button>
    </div>
  );

  return (
    <div className="issuance-detail-modal">
      {/* Header */}
      <div className="detail-modal-header">
        <div className="detail-modal-title">
          <h2>Issuance Details</h2>
          <span className="detail-id">#{issuance.id}</span>
        </div>
        <button className="btn-close-modal" onClick={onClose}>&#10005;</button>
      </div>

      {/* Information Cards */}
      <div className="detail-info-grid">
        <div className="detail-info-card">
          <span className="detail-label">Date & Time</span>
          <span className="detail-value">{new Date(issuance.issuance_date).toLocaleString()}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Department</span>
          <span className="detail-value">{issuance.department_name || 'N/A'}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Received By</span>
          <span className="detail-value">{issuance.received_by || 'N/A'}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Time of Day</span>
          <span className="detail-value">{issuance.remarks || 'N/A'}</span>
        </div>
        {issuance.approved_by && (
          <div className="detail-info-card">
            <span className="detail-label">Approved By</span>
            <span className="detail-value">{issuance.approved_by}</span>
          </div>
        )}
        {issuance.check_number && (
          <div className="detail-info-card">
            <span className="detail-label">Check Number</span>
            <span className="detail-value">{issuance.check_number}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="detail-items-section">
        <h3>Issued Items</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="adjustments-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th className="text-right">Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {issuance.items && issuance.items.length > 0 ? (
                issuance.items.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td><span className="status-badge neutral">{item.item_code || 'N/A'}</span></td>
                    <td><strong>{item.item_name}</strong></td>
                    <td className="text-right font-mono font-bold">{formatQuantity(item.quantity)}</td>
                    <td>{item.unit || 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No items found in this issuance</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="detail-modal-footer">
        <button onClick={onClose} className="btn btn-secondary">Close</button>
      </div>
    </div>
  );
};

const IssuanceHistory = () => {
  const navigate = useNavigate();
  const [issuances, setIssuances] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssuanceId, setSelectedIssuanceId] = useState(null);
  const [showFilters, setShowFilters] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleView = (id) => setSelectedIssuanceId(id);
  const handleEdit = (id) => navigate(`/issuance/edit/${id}`);

  const fetchIssuances = async () => {
    try {
      setLoading(true);
      const [issRes, deptRes] = await Promise.all([
        api.get('/issuances'),
        api.get('/departments').catch(() => ({ data: [] }))
      ]);
      const sorted = (issRes.data || []).sort((a, b) => new Date(b.issuance_date) - new Date(a.issuance_date));
      setIssuances(sorted);
      setDepartments(deptRes.data || []);
    } catch (error) {
      console.error('Error fetching issuances:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssuances();
  }, []);

  const clearFilters = () => {
    setSearch('');
    setDepartmentId('all');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  // Apply filters
  const filteredIssuances = issuances.filter((issuance) => {
    const issuanceDate = new Date(issuance.issuance_date);
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate + 'T23:59:59') : null;

    const matchesDate =
      (!from || issuanceDate >= from) &&
      (!to || issuanceDate <= to);

    const matchesDept = 
      departmentId === 'all' || 
      String(issuance.department_id) === String(departmentId) ||
      issuance.department_name?.toLowerCase() === departmentId.toLowerCase();

    const term = search.trim().toLowerCase();
    const matchesSearch = !term || (
      String(issuance.id).includes(term) ||
      issuance.department_name?.toLowerCase().includes(term) ||
      issuance.received_by?.toLowerCase().includes(term) ||
      issuance.remarks?.toLowerCase().includes(term)
    );

    return matchesDate && matchesDept && matchesSearch;
  });

  const totalPages = Math.ceil(filteredIssuances.length / itemsPerPage);
  const paginatedData = filteredIssuances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="issuance-page-container">
      {/* Page Header with Actions */}
      <div className="header-with-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2>
            <FontAwesomeIcon icon={faTruckLoading} style={{ marginRight: '10px', color: 'var(--color-primary)' }} />
            RM Issue Summary
          </h2>
          <span className="pagination-entries">
            {formatNumber(filteredIssuances.length)} records
          </span>
        </div>
        <div className="header-actions">
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => navigate('/issuance/issue')}
          >
            <FontAwesomeIcon icon={faPlus} /> Add New Issuance
          </button>
        </div>
      </div>

      {/* Filter Section Card */}
      <div className="card filter-card">
        <div className="filter-header">
          <h4>
            <FontAwesomeIcon icon={faFilter} /> Filter Issuance Records
          </h4>
          <button 
            type="button" 
            className="filter-toggle" 
            onClick={() => setShowFilters(!showFilters)}
          >
            <FontAwesomeIcon icon={showFilters ? faTimes : faSearch} />
            {showFilters ? ' Hide Filters' : ' Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="filter-form adjustment-filter-form">
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faSearch} /> Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                placeholder="Search ID, department, received by..."
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faBuilding} /> Department</label>
              <select
                value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value); setCurrentPage(1); }}
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="filter-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={clearFilters}
              >
                <FontAwesomeIcon icon={faSync} /> Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Data Card */}
      <div className="card data-card">
        <div className="data-card-header">
          <h3>Issuance Records</h3>
          <div className="data-card-actions">
            <span className="pagination-entries">
              {formatNumber(filteredIssuances.length)} entries found
            </span>
            <button 
              type="button" 
              className="btn btn-sm btn-secondary" 
              onClick={fetchIssuances}
              disabled={loading}
              title="Refresh Records"
            >
              <FontAwesomeIcon icon={faSync} spin={loading} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faSync} spin style={{ fontSize: '28px', opacity: 0.5 }} />
            <p>Loading issuance records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>ID</th>
                    <th>Date & Time</th>
                    <th>Department</th>
                    <th>Received By</th>
                    <th>Time of Day</th>
                    <th className="text-center" style={{ width: '160px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((issuance) => (
                      <tr key={issuance.id}>
                        <td>
                          <strong>#{formatNumber(issuance.id)}</strong>
                        </td>
                        <td>
                          {new Date(issuance.issuance_date).toLocaleDateString()}
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            {new Date(issuance.issuance_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td>
                          <span className="status-badge neutral">
                            {issuance.department_name || 'N/A'}
                          </span>
                        </td>
                        <td>{issuance.received_by || '-'}</td>
                        <td>
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {issuance.remarks || '-'}
                          </span>
                        </td>
                        <td className="text-center actions-column">
                          <div className="table-actions" style={{ justifyContent: 'center' }}>
                            <button 
                              type="button"
                              className="btn btn-sm btn-outline" 
                              onClick={() => handleView(issuance.id)}
                              title="View Issuance Details"
                            >
                              <FontAwesomeIcon icon={faEye} /> View
                            </button>
                            <button 
                              type="button"
                              className="btn btn-sm btn-secondary" 
                              onClick={() => handleEdit(issuance.id)}
                              title="Edit Issuance"
                            >
                              <FontAwesomeIcon icon={faEdit} /> Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        <FontAwesomeIcon icon={faTruckLoading} />
                        <strong>No issuance records found.</strong>
                        <span className="empty-state-subtitle">
                          Try adjusting your search criteria or date filters.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination">
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredIssuances.length)} of {filteredIssuances.length} entries
                </span>
                <div className="pagination-controls">
                  <button 
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} 
                    disabled={currentPage === 1}
                    className="page-btn"
                    aria-label="Previous Page"
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
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button 
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} 
                    disabled={currentPage === totalPages}
                    className="page-btn"
                    aria-label="Next Page"
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedIssuanceId && (
        <ModalPortal onClose={() => setSelectedIssuanceId(null)}>
          <IssuanceDetailsModal id={selectedIssuanceId} onClose={() => setSelectedIssuanceId(null)} />
        </ModalPortal>
      )}
    </div>
  );
};

export default IssuanceHistory;