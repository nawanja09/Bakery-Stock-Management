// src/components/adjustments/tabs/RecordAdjustmentsTab.jsx
//
// Adjustment Summary tab for the "Petty Cash Adjustment" (Petty Cash Voucher),
// Cash Expense, and "Expense Adjustment" (Expense Bill) categories. Lists
// only records that were edited and saved from the Adjustments section
// (rm_adjustment_records), with a From / To Date filter. The date range
// filters on the DATE THE ADJUSTMENT WAS RECORDED (rar.updated_at) - not the
// voucher/expense/bill's own date - so a back-dated record only shows up
// under the day it was actually adjusted.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync, faFileAlt, faCalendarAlt, faFilter, faChevronLeft,
  faChevronRight, faSearch, faTimes
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import ExpenseBillAdjustmentEditor from '../ExpenseBillAdjustmentEditor';
import FinancialReceiptAdjustmentEditor from '../FinancialReceiptAdjustmentEditor';

const EMPTY_FILTERS = { startDate: '', endDate: '', search: '' };

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');
const formatDateTime = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleString() : '-');
const renderChanges = (row) => {
  const before = typeof row.original_values === 'string' ? JSON.parse(row.original_values) : row.original_values;
  const after = typeof row.updated_values === 'string' ? JSON.parse(row.updated_values) : row.updated_values;
  if (!before || !after) return '-';
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) =>
    String(before[key] ?? '') !== String(after[key] ?? ''));
  return <details><summary>{keys.length} changed field{keys.length === 1 ? '' : 's'}</summary>
    <div style={{ minWidth: '260px' }}>{keys.map((key) => <div key={key}><strong>{key}:</strong> {String(before[key] ?? '—')} → {String(after[key] ?? '—')}</div>)}</div>
  </details>;
};

// category -> table definition
export const RECORD_TAB_CONFIG = {
  'Petty Cash Voucher': {
    title: 'Petty Cash Adjustments',
    searchPlaceholder: 'Voucher no., payee, expense type...',
    columns: [
      { key: 'adjustment_date', label: 'Adjustment Date', render: (r) => formatDateTime(r.adjustment_date) },
      { key: 'voucher_number', label: 'Voucher No.', render: (r) => <strong>{r.voucher_number}</strong> },
      { key: 'voucher_date', label: 'Date', render: (r) => formatDate(r.voucher_date) },
      { key: 'payee_name', label: 'Payee' },
      { key: 'expense_type', label: 'Expense Type' },
      { key: 'sub_expense_type', label: 'Sub Expense Type' },
      { key: 'company_name', label: 'Company' },
      { key: 'amount', label: 'Amount', className: 'text-right font-mono', render: (r) => formatCurrency(r.amount) },
      { key: 'adjusted_by', label: 'Adjusted By', render: (r) => r.adjusted_by || '-' },
    ],
  },
  'Expense Bill': {
    title: 'Expense Adjustments',
    searchPlaceholder: 'Bill no., payee, expense type...',
    columns: [
      { key: 'adjustment_date', label: 'Adjustment Date', render: (r) => formatDateTime(r.adjustment_date) },
      { key: 'bill_number', label: 'Bill No.', render: (r) => <strong>{r.bill_number || '-'}</strong> },
      { key: 'bill_date', label: 'Date', render: (r) => formatDate(r.bill_date) },
      { key: 'payee_name', label: 'Payee' },
      { key: 'expense_type', label: 'Expense Type' },
      { key: 'sub_expense_type', label: 'Sub Expense Type' },
      { key: 'company_name', label: 'Company' },
      { key: 'total_bill_amount', label: 'Total', className: 'text-right font-mono', render: (r) => formatCurrency(r.total_bill_amount) },
      { key: 'payment_status', label: 'Status' },
      { key: 'adjusted_by', label: 'Adjusted By', render: (r) => r.adjusted_by || '-' },
    ],
  },
  'Cash Receive': {
    title: 'Cash Receive Adjustments',
    searchPlaceholder: 'Reference no., company, receive type...',
    columns: [
      { key: 'adjustment_date', label: 'Adjustment Date', render: (r) => formatDateTime(r.adjustment_date) },
      { key: 'date', label: 'Receipt Date', render: (r) => formatDate(r.date) },
      { key: 'reference_number', label: 'Reference No.' },
      { key: 'company_name', label: 'Company' },
      { key: 'receive_type', label: 'Receive Type' },
      { key: 'amount', label: 'Amount', className: 'text-right font-mono', render: (r) => formatCurrency(r.amount) },
      { key: 'remark', label: 'Description / Remark' },
      { key: 'adjusted_by', label: 'Adjusted By', render: (r) => r.adjusted_by || '-' },
    ],
  },
  'Bank Receive': {
    title: 'Bank Receive Adjustments',
    searchPlaceholder: 'Reference no., company, bank account...',
    columns: [
      { key: 'adjustment_date', label: 'Adjustment Date', render: (r) => formatDateTime(r.adjustment_date) },
      { key: 'date', label: 'Receipt Date', render: (r) => formatDate(r.date) },
      { key: 'reference_number', label: 'Reference No.' },
      { key: 'company_name', label: 'Company' },
      { key: 'bank_name', label: 'Bank Account', render: (r) => `${r.bank_name || '-'}${r.account_number ? ` — ${r.account_number}` : ''}` },
      { key: 'receive_type', label: 'Receive Type' },
      { key: 'amount', label: 'Amount', className: 'text-right font-mono', render: (r) => formatCurrency(r.amount) },
      { key: 'remark', label: 'Description / Remark' },
      { key: 'card_status', label: 'Status', render: (r) => r.card_status || '-' },
      { key: 'adjusted_by', label: 'Adjusted By', render: (r) => r.adjusted_by || '-' },
    ],
  },
};

const RecordAdjustmentsTab = ({ category }) => {
  const config = RECORD_TAB_CONFIG[category];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingFinancialRecord, setEditingFinancialRecord] = useState(null);
  const itemsPerPage = 10;

  const invalidRange = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);

  const fetchRows = useCallback(async () => {
    if (invalidRange) { setRows([]); setLoading(false); return; }
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.search.trim()) params.append('search', filters.search.trim());
      const res = await api.get(`/adjustments/summary/${encodeURIComponent(category)}?${params.toString()}`);
      setRows(res.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error(`Error fetching ${category} adjustments:`, err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [category, filters, invalidRange]);

  // Debounce only the free-text search; date changes apply immediately.
  useEffect(() => {
    const timer = setTimeout(fetchRows, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchRows, filters.search]);

  if (!config) return null;

  const hasExpenseEdit = category === 'Expense Bill';
  const hasFinancialEdit = ['Cash Receive', 'Bank Receive'].includes(category);
  const hasLegacyAuditColumns = !['Petty Cash Voucher', 'Expense Bill', 'Cash Receive', 'Bank Receive'].includes(category);
  const colCount = config.columns.length + (hasExpenseEdit || hasFinancialEdit ? 1 : 0) + (hasLegacyAuditColumns ? 2 : 0);
  const searchTerm = filters.search.trim().toLowerCase();
  const visibleRows = searchTerm ? rows.filter((row) => config.columns.some((column) =>
    String(row[column.key] ?? '').toLowerCase().includes(searchTerm))) : rows;
  const totalPages = Math.ceil(visibleRows.length / itemsPerPage);
  const paginatedData = visibleRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      {/* Filter Section */}
      <div className="card filter-card">
        <div className="filter-header">
          <h4><FontAwesomeIcon icon={faFilter} /> Filter {config.title}</h4>
          <button type="button" className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
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
                value={filters.search}
                placeholder={config.searchPlaceholder}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> From Date</label>
              <input
                type="date"
                value={filters.startDate}
                max={filters.endDate || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="filter-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> To Date</label>
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="filter-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                <FontAwesomeIcon icon={faSync} /> Reset
              </button>
            </div>
            {invalidRange && (
              <div className="alert-message error" style={{ flexBasis: '100%' }}>From Date cannot be after To Date.</div>
            )}
          </div>
        )}
      </div>

      {/* Table Data Card */}
      <div className="card data-card">
        <div className="data-card-header">
          <h3>{config.title}</h3>
          <div className="data-card-actions">
            <span className="pagination-entries">{formatNumber(visibleRows.length)} entries found</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={fetchRows} disabled={loading} title="Refresh Records">
              <FontAwesomeIcon icon={faSync} spin={loading} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faSync} spin style={{ fontSize: '28px', opacity: 0.5 }} />
            <p>Loading adjustment records...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="adjustments-table">
                <thead>
                  <tr>
                    {config.columns.map((col) => (
                      <th key={col.key} className={col.className && col.className.includes('text-right') ? 'text-right' : undefined}>{col.label}</th>
                    ))}
                    {(hasExpenseEdit || hasFinancialEdit) && <th>Actions</th>}
                    {hasLegacyAuditColumns && <th>Adjusted By</th>}
                    {hasLegacyAuditColumns && <th>Adjusted On</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? paginatedData.map((r) => (
                    <tr key={hasExpenseEdit ? r.adjustment_id : r.id}>
                      {config.columns.map((col) => (
                        <td key={col.key} className={col.className}>
                          {col.render ? col.render(r) : (r[col.key] ?? '-')}
                        </td>
                      ))}
                      {hasExpenseEdit && <td><button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={Number(r.paid_amount) > 0}
                        title={Number(r.paid_amount) > 0 ? 'Payments are recorded against this bill, so it cannot be edited' : 'Edit this expense'}
                        onClick={() => setEditingExpenseId(String(r.expense_id))}
                      >Edit</button></td>}
                      {hasFinancialEdit && <td><button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={r.source === 'card' && r.card_status !== 'Pending'}
                        title={r.source === 'card' && r.card_status !== 'Pending' ? 'Completed card receipts cannot be edited' : 'Edit this receive record'}
                        onClick={() => setEditingFinancialRecord({
                          id: String(r.source_record_id),
                          source: r.source
                        })}
                      >Edit</button></td>}
                      {hasLegacyAuditColumns && <td>{r.updated_by_name || '-'}</td>}
                      {hasLegacyAuditColumns && <td>{formatDateTime(r.rm_adjusted_at)}</td>}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={colCount} className="empty-state">
                        <FontAwesomeIcon icon={faFileAlt} />
                        <strong>No adjustment records found.</strong>
                        <span className="empty-state-subtitle">
                          {filters.startDate || filters.endDate
                            ? 'No adjustments fall inside the selected date range.'
                            : 'Records appear here after they are edited from the Adjustments section.'}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, rows.length)} of {rows.length} entries
                </span>
                <div className="pagination-controls">
                  <button type="button" className="page-btn" aria-label="Previous Page" disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}>
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5 || currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    return (
                      <button key={pageNum} type="button" onClick={() => setCurrentPage(pageNum)}
                        className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}>
                        {pageNum}
                      </button>
                    );
                  })}
                  <button type="button" className="page-btn" aria-label="Next Page" disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}>
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {editingExpenseId !== null && (
        // Backdrop is inert: an outside click must not discard the edits.
        <div role="dialog" aria-modal="true" aria-label="Edit expense adjustment" className="modal-overlay">
          <div className="modal-content" style={{ width: 'min(960px, 96vw)', maxWidth: '960px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()}>
            <ExpenseBillAdjustmentEditor
              embeddedId={editingExpenseId}
              onCancel={() => setEditingExpenseId(null)}
              onSaved={() => { setEditingExpenseId(null); fetchRows(); }}
            />
          </div>
        </div>
      )}
      {editingFinancialRecord !== null && (
        // Backdrop is inert: an outside click must not discard the edits.
        <div role="dialog" aria-modal="true" aria-label="Edit financial receive adjustment" className="modal-overlay">
          <div className="modal-content" style={{ width: 'min(960px, 96vw)', maxWidth: '960px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()}>
            <FinancialReceiptAdjustmentEditor
              embeddedId={editingFinancialRecord.id}
              category={category}
              source={editingFinancialRecord.source}
              onCancel={() => setEditingFinancialRecord(null)}
              onSaved={() => { setEditingFinancialRecord(null); fetchRows(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordAdjustmentsTab;
