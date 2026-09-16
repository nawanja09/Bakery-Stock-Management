// src/components/adjustments/tabs/InvoiceAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSync, faFileAlt, faBuilding, faFileInvoice, 
  faCalendarAlt, faCheckCircle, faFilter, faEdit, 
  faChevronLeft, faChevronRight, faSearch, faTimes 
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const EMPTY_FILTERS = { supplier_id: 'all', invoice_no: '', startDate: '', endDate: '', payment_status: 'all' };

const InvoiceAdjustmentsTab = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [suppliers, setSuppliers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    api.get('/suppliers').then((res) => setSuppliers(res.data || [])).catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.supplier_id !== 'all') params.append('supplier_id', filters.supplier_id);
      if (filters.invoice_no) params.append('invoice_no', filters.invoice_no);
      if (filters.startDate && filters.endDate) {
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
      }
      if (filters.payment_status !== 'all') params.append('payment_status', filters.payment_status);

      const res = await api.get(`/adjustments/summary/Invoice?${params.toString()}`);
      setRows(res.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching invoice adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(fetchRows, filters.invoice_no ? 400 : 0);
    return () => clearTimeout(t);
  }, [filters, fetchRows]);

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const paginatedData = rows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'completed';
      case 'partially paid': return 'pending';
      case 'non-paid': return 'cancelled';
      default: return 'neutral';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      {/* Filter Section */}
      <div className="card filter-card">
        <div className="filter-header">
          <h4>
            <FontAwesomeIcon icon={faFilter} /> Filter Invoice Adjustments
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
              <label><FontAwesomeIcon icon={faBuilding} /> Supplier</label>
              <select 
                value={filters.supplier_id} 
                onChange={(e) => setFilters((f) => ({ ...f, supplier_id: e.target.value }))}
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faFileInvoice} /> Invoice Number</label>
              <input 
                type="text" 
                value={filters.invoice_no} 
                onChange={(e) => setFilters((f) => ({ ...f, invoice_no: e.target.value }))} 
                placeholder="Search invoice #" 
              />
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
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCheckCircle} /> Status</label>
              <select 
                value={filters.payment_status} 
                onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
              >
                <option value="all">All</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Non-Paid">Non-Paid</option>
              </select>
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
          <h3>Invoice Records</h3>
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
            <p>Loading invoice records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th className="text-center">Status</th>
                    <th className="text-center" style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? paginatedData.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.invoice_no}</strong></td>
                      <td>{r.supplier_name}</td>
                      <td>{new Date(r.purchase_date).toLocaleDateString()}</td>
                      <td className="text-right font-mono">{formatCurrency(r.total_with_vat)}</td>
                      <td className="text-right font-mono text-success">{formatCurrency(r.paid_amount)}</td>
                      <td className="text-right font-mono font-bold text-danger">{formatCurrency(r.balance_amount)}</td>
                      <td className="text-center">
                        <span className={`status-badge ${getStatusBadgeClass(r.payment_status)}`}>
                          {r.payment_status}
                        </span>
                      </td>
                      <td className="text-center">
                        <button 
                          type="button"
                          className="btn btn-sm btn-secondary" 
                          onClick={() => navigate(`/purchase/edit/${r.id}`, { state: { backgroundLocation: location } })}
                          title="Edit Invoice Record"
                        >
                          <FontAwesomeIcon icon={faEdit} /> Edit
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="8" className="empty-state">
                        <FontAwesomeIcon icon={faFileAlt} />
                        <strong>No invoice records found.</strong>
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

export default InvoiceAdjustmentsTab;
