// src/components/adjustments/tabs/PurchasingPaymentAdjustmentsTab.jsx
//
// Shows the per-record purchasing-payment adjustment audit trail. Each audit
// row is tied to the exact payment_history_id and purchase_id saved in RM
// Adjustment, rather than being inferred from another live payment row.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSync, faFileInvoiceDollar, faFilter, faBuilding, 
  faFileInvoice, faCalendarAlt, faCheckCircle, faChevronLeft, 
  faChevronRight, faSearch, faTimes
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const EMPTY_FILTERS = { supplier_id: 'all', invoice_no: '', startDate: '', endDate: '', payment_status: 'all' };

const PurchasingPaymentAdjustmentsTab = () => {
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
      const res = await api.get('/purchases/payment-adjustments');
      setAllRows(res.data || []);
    } catch (err) {
      console.error('Error fetching purchasing payment records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Apply client-side filters whenever allRows or filters change
  useEffect(() => {
    let data = [...allRows];
    if (filters.supplier_id !== 'all') {
      data = data.filter((r) => String(r.supplier_id || '') === String(filters.supplier_id));
    }
    if (filters.invoice_no.trim()) {
      const term = filters.invoice_no.trim().toLowerCase();
      data = data.filter((r) => r.invoice_no?.toLowerCase().includes(term));
    }
    if (filters.startDate) {
      data = data.filter((r) => r.updated_payment_date && r.updated_payment_date >= filters.startDate);
    }
    if (filters.endDate) {
      data = data.filter((r) => r.updated_payment_date && r.updated_payment_date <= filters.endDate);
    }
    if (filters.payment_status !== 'all') {
      data = data.filter((r) => r.status === filters.payment_status);
    }
    setRows(data);
    setCurrentPage(1);
  }, [allRows, filters]);

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
            <FontAwesomeIcon icon={faFilter} /> Filter Adjustments
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
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
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
              <label><FontAwesomeIcon icon={faCheckCircle} /> Adjustment Status</label>
              <select 
                value={filters.payment_status} 
                onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
              >
                <option value="all">All</option>
                <option value="Adjusted">Adjusted</option>
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
          <h3>Purchasing Payment Adjustments</h3>
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
            <p>Loading payment adjustment records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Supplier</th>
                    <th>Original Date</th>
                    <th>Updated Date</th>
                    <th>Voucher No.</th>
                    <th className="text-right">Original Amount</th>
                    <th className="text-right">Updated Amount</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? paginatedData.map((r) => (
                    <tr key={`payment-adjustment-${r.id}`}>
                      <td>
                        <strong>{r.invoice_no || '-'}</strong>
                      </td>
                      <td>{r.supplier_name || '-'}</td>
                      <td>{r.original_payment_date ? new Date(r.original_payment_date).toLocaleDateString() : '-'}</td>
                      <td>{r.updated_payment_date ? new Date(r.updated_payment_date).toLocaleDateString() : '-'}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>
                          {r.voucher_number || '-'}
                        </span>
                      </td>
                      <td className="text-right font-mono">{formatCurrency(r.original_amount)}</td>
                      <td className="text-right font-mono font-bold text-primary">{formatCurrency(r.adjusted_amount)}</td>
                      <td className="text-center">
                        <span className="status-badge adjusted">
                          <FontAwesomeIcon icon={faCheckCircle} />
                          {r.status || 'Adjusted'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="8" className="empty-state">
                        <FontAwesomeIcon icon={faFileInvoiceDollar} />
                        <strong>No purchasing payment adjustments found.</strong>
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

export default PurchasingPaymentAdjustmentsTab;
