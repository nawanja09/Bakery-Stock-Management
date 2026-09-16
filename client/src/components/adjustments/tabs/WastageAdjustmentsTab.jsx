// src/components/adjustments/tabs/WastageAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSync, faFileAlt, faTrash, faBox, faCalendarAlt, 
  faFilter, faEdit, faChevronLeft, faChevronRight, 
  faSearch, faTimes 
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const WASTAGE_REASONS = ['Expired', 'Damaged', 'Overproduction', 'Poor Storage', 'Forecasting errors', 'Human error', 'Other'];
const EMPTY_FILTERS = { reason: 'all', item_id: 'all', startDate: '', endDate: '' };

const WastageAdjustmentsTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    api.get('/items').then((res) => setItems(res.data || [])).catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.reason !== 'all') params.append('reason', filters.reason);
      if (filters.item_id !== 'all') params.append('item_id', filters.item_id);
      if (filters.startDate && filters.endDate) {
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
      }
      const res = await api.get(`/adjustments/summary/Wastage?${params.toString()}`);
      setRows(res.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching wastage adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchRows(); }, [filters, fetchRows]);

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const paginatedData = rows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      {/* Filter Section */}
      <div className="card filter-card">
        <div className="filter-header">
          <h4>
            <FontAwesomeIcon icon={faFilter} /> Filter Wastage Adjustments
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
              <label><FontAwesomeIcon icon={faTrash} /> Wastage Reason</label>
              <select 
                value={filters.reason} 
                onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}
              >
                <option value="all">All Reasons</option>
                {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faBox} /> Item</label>
              <select 
                value={filters.item_id} 
                onChange={(e) => setFilters((f) => ({ ...f, item_id: e.target.value }))}
              >
                <option value="all">All Items</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> Start Date</label>
              <input 
                type="date" 
                value={filters.startDate} 
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} 
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> End Date</label>
              <input 
                type="date" 
                value={filters.endDate} 
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} 
              />
            </div>
            <div className="filter-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setFilters(EMPTY_FILTERS)}
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
          <h3>Wastage Records</h3>
          <div className="data-card-actions">
            <span className="pagination-entries">
              {formatNumber(rows.length)} entries found
            </span>
            <button 
              type="button" 
              className="btn btn-sm btn-secondary" 
              onClick={fetchRows}
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
            <p>Loading wastage adjustment records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th>Note #</th>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Approved By</th>
                    <th className="text-right">Total Loss</th>
                    <th className="text-center" style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? paginatedData.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.wastage_note_number}</strong>
                      </td>
                      <td>{new Date(r.date).toLocaleDateString()}</td>
                      <td>
                        <span className="status-badge draft">
                          {r.reason}
                        </span>
                      </td>
                      <td>{r.approved_by || '-'}</td>
                      <td className="text-right font-mono font-bold text-danger">
                        {formatCurrency(r.total_loss)}
                      </td>
                      <td className="text-center">
                        <button 
                          type="button"
                          className="btn btn-sm btn-secondary" 
                          onClick={() => navigate(`/wastage/edit/${r.id}`, { state: { backgroundLocation: location } })}
                          title="Edit Wastage Record"
                        >
                          <FontAwesomeIcon icon={faEdit} /> Edit
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        <FontAwesomeIcon icon={faFileAlt} />
                        <strong>No wastage records found.</strong>
                        <span className="empty-state-subtitle">
                          Try adjusting your filter selections or date range.
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
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, rows.length)} of {rows.length} entries
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
    </div>
  );
};

export default WastageAdjustmentsTab;
