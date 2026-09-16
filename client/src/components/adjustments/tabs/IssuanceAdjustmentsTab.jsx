// src/components/adjustments/tabs/IssuanceAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSync, faFileAlt, faBuilding, faBox, faCalendarAlt, 
  faFilter, faEdit, faChevronLeft, faChevronRight, 
  faSearch, faTimes 
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatNumber } from '../../../utils/formatters';

const EMPTY_FILTERS = { department_id: 'all', item_id: 'all', startDate: '', endDate: '' };

const IssuanceAdjustmentsTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    api.get('/departments').then((res) => setDepartments(res.data || [])).catch(() => {});
    api.get('/items').then((res) => setItems(res.data || [])).catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.department_id !== 'all') params.append('department_id', filters.department_id);
      if (filters.item_id !== 'all') params.append('item_id', filters.item_id);
      if (filters.startDate && filters.endDate) {
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
      }
      const res = await api.get(`/adjustments/summary/Issuance?${params.toString()}`);
      setRows(res.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching issuance adjustments:', err);
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
            <FontAwesomeIcon icon={faFilter} /> Filter Issuance Adjustments
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
              <label><FontAwesomeIcon icon={faBuilding} /> Department</label>
              <select 
                value={filters.department_id} 
                onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))}
              >
                <option value="all">All Departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
          <h3>Issuance Records</h3>
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
            <p>Loading issuance adjustment records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date & Time</th>
                    <th>Department</th>
                    <th>Received By</th>
                    <th className="text-center">Items</th>
                    <th className="text-center" style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? paginatedData.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>#{formatNumber(r.id)}</strong>
                      </td>
                      <td>
                        {new Date(r.issuance_date).toLocaleDateString()}
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {new Date(r.issuance_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        <span className="status-badge neutral">
                          {r.department_name || 'N/A'}
                        </span>
                      </td>
                      <td>{r.received_by || '-'}</td>
                      <td className="text-center">
                        <span className="status-badge adjusted">
                          {r.item_count ?? (r.items || []).length} item(s)
                        </span>
                      </td>
                      <td className="text-center">
                        <button 
                          type="button"
                          className="btn btn-sm btn-secondary" 
                          onClick={() => navigate(`/issuance/edit/${r.id}`, { state: { backgroundLocation: location } })}
                          title="Edit Issuance Record"
                        >
                          <FontAwesomeIcon icon={faEdit} /> Edit
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        <FontAwesomeIcon icon={faFileAlt} />
                        <strong>No issuance records found.</strong>
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

export default IssuanceAdjustmentsTab;
