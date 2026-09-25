// src/components/adjustments/CategoryAdjustmentPanel.jsx
//
// Renders the record picker + embedded edit workflow for the "Invoice",
// "Issuance", and "Wastage" adjustment categories on the RM Adjustments page.
// Reuses the existing list APIs and existing Edit* components -- no new
// tables, no new routes, no duplicated save/validation logic.
import React, { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faArrowLeft, faSpinner, faInbox } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import EditPurchase from '../purchase/EditPurchase';
import EditIssuance from '../issuance/EditIssuance';
import EditWastage from '../wastage/EditWastage';
import PurchasingPaymentAdjustmentEditor from './PurchasingPaymentAdjustmentEditor';
import PettyCashVoucherAdjustmentEditor from './PettyCashVoucherAdjustmentEditor';
import ExpenseBillAdjustmentEditor from './ExpenseBillAdjustmentEditor';
import './Adjustments.css';

// Category -> { endpoint, columns, editor }
const CATEGORY_CONFIG = {
  Invoice: {
    endpoint: '/purchases',
    label: 'Invoice',
    dateKey: 'purchase_date',
    getRows: (data) => data,
    columns: [
      { key: 'invoice_no', label: 'Invoice No.' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'purchase_date', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
      { key: 'payment_status', label: 'Status' },
    ],
    matches: (row, term) =>
      row.invoice_no?.toLowerCase().includes(term) ||
      row.supplier_name?.toLowerCase().includes(term),
    Editor: EditPurchase,
  },
  Issuance: {
    endpoint: '/issuances',
    label: 'Issuance',
    dateKey: 'issuance_date',
    getRows: (data) => data,
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'department_name', label: 'Department' },
      { key: 'issuance_date', label: 'Date', format: (v) => new Date(v).toLocaleString() },
      { key: 'received_by', label: 'Received By' },
    ],
    matches: (row, term) =>
      row.department_name?.toLowerCase().includes(term) ||
      row.received_by?.toLowerCase().includes(term) ||
      String(row.id).includes(term),
    Editor: EditIssuance,
  },
  Wastage: {
    endpoint: '/wastages',
    label: 'Wastage',
    dateKey: 'date',
    getRows: (data) => data,
    columns: [
      { key: 'wastage_note_number', label: 'Note #' },
      { key: 'reason', label: 'Reason' },
      { key: 'date', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
      { key: 'approved_by', label: 'Approved By' },
    ],
    matches: (row, term) =>
      row.wastage_note_number?.toLowerCase().includes(term) ||
      row.approved_by?.toLowerCase().includes(term) ||
      row.reason?.toLowerCase().includes(term),
    Editor: EditWastage,
  },
  // This key must exactly match the value emitted by StoresBalance. Keeping
  // the selected composite payment/invoice ID intact is what makes an edit
  // apply to the intended payment allocation rather than another invoice.
  'Purchasing Payment': {
    endpoint: '/purchases/payments/adjustable',
    label: 'Purchasing Payment',
    dateKey: 'payment_date',
    getRows: (data) => data,
    columns: [
      { key: 'invoice_no', label: 'Invoice No.' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'payment_date', label: 'Payment Date', format: (v) => new Date(v).toLocaleDateString() },
      { key: 'amount', label: 'Amount', format: (v) => `Rs. ${parseFloat(v || 0).toFixed(2)}` },
      { key: 'voucher_number', label: 'Voucher No.' },
    ],
    matches: (row, term) =>
      row.invoice_no?.toLowerCase().includes(term) ||
      row.supplier_name?.toLowerCase().includes(term) ||
      row.voucher_number?.toLowerCase().includes(term),
    Editor: PurchasingPaymentAdjustmentEditor,
  },
  // ---- Petty Cash / Expenses ------------------------------------------
  // Editing moved here from the Petty Cash page. Every save is logged in the
  // Adjustment Summary (the editors send X-RM-Adjustment).
  'Petty Cash Voucher': {
    endpoint: '/expenses/petty-cash/vouchers?limit=1000',
    // Internal key/value stays 'Petty Cash Voucher' (matches the backend
    // category and rm_adjustment_records rows); only the displayed label is
    // "Petty Cash Adjustment".
    label: 'Petty Cash Adjustment',
    dateKey: 'date',
    getRows: (data) => data,
    columns: [
      { key: 'voucher_number', label: 'Voucher No.' },
      { key: 'date', label: 'Date', format: (v) => (v ? new Date(v).toLocaleDateString() : '-') },
      { key: 'payee', label: 'Payee' },
      { key: 'expense_type', label: 'Expense Type' },
      { key: 'amount', label: 'Amount', format: (v) => `Rs. ${parseFloat(v || 0).toFixed(2)}` },
    ],
    matches: (row, term) =>
      row.voucher_number?.toLowerCase().includes(term) ||
      row.payee?.toLowerCase().includes(term) ||
      row.expense_type?.toLowerCase().includes(term),
    Editor: PettyCashVoucherAdjustmentEditor,
  },
  'Expense Bill': {
    endpoint: '/new-expenses',
    // Internal key/value stays 'Expense Bill' (matches the backend category
    // and rm_adjustment_records rows); only the displayed label is
    // "Expense Adjustment".
    label: 'Expense Adjustment',
    dateKey: 'bill_date',
    getRows: (data) => data,
    columns: [
      { key: 'bill_number', label: 'Bill No.' },
      { key: 'bill_date', label: 'Date', format: (v) => (v ? new Date(v).toLocaleDateString() : '-') },
      { key: 'payee_name', label: 'Payee' },
      { key: 'expense_type', label: 'Expense Type' },
      { key: 'total_bill_amount', label: 'Total', format: (v) => `Rs. ${parseFloat(v || 0).toFixed(2)}` },
      { key: 'payment_status', label: 'Status' },
    ],
    matches: (row, term) =>
      row.bill_number?.toLowerCase().includes(term) ||
      row.payee_name?.toLowerCase().includes(term) ||
      row.expense_type?.toLowerCase().includes(term),
    // Editable for both Paid and Non-Paid bills - see server/routes/newExpenseRoutes.js
    // PUT /:id, which now allows edits regardless of paid_amount.
    Editor: ExpenseBillAdjustmentEditor,
  },
};

const CategoryAdjustmentPanel = ({ category, onAdjustmentSaved }) => {
  const config = CATEGORY_CONFIG[category];

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchRecords = useCallback(async () => {
    if (!config) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(config.endpoint);
      setRecords(config.getRows(response.data) || []);
    } catch (err) {
      console.error(`Error fetching ${category} records:`, err);
      setError(`Unable to load ${config.label.toLowerCase()} records. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [category, config]);

  useEffect(() => {
    setSelectedId(null);
    setSearch('');
    setDateFrom('');
    setDateTo('');
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  if (!config) return null;

  // ---- Editing an existing record ----
  if (selectedId !== null) {
    const { Editor } = config;
    return (
      <div className="form-section">
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: '16px' }}
          onClick={() => setSelectedId(null)}
        >
          <FontAwesomeIcon icon={faArrowLeft} /> Back to {config.label} List
        </button>
        <Editor
          embeddedId={selectedId}
          isRmAdjustment
          onCancel={() => setSelectedId(null)}
          onSaved={() => {
            setSelectedId(null);
            fetchRecords();
            if (onAdjustmentSaved) onAdjustmentSaved(category);
          }}
        />
      </div>
    );
  }

  // ---- Picking a record ----
  const term = search.trim().toLowerCase();
  let filtered = term
    ? records.filter((row) => config.matches(row, term))
    : records;

  // Date range filter, keyed off whichever date field this category uses.
  if (config.dateKey && (dateFrom || dateTo)) {
    filtered = filtered.filter((row) => {
      const raw = row[config.dateKey];
      if (!raw) return false;
      const rowDate = String(raw).slice(0, 10);
      if (dateFrom && rowDate < dateFrom) return false;
      if (dateTo && rowDate > dateTo) return false;
      return true;
    });
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">
        <FontAwesomeIcon icon={faSearch} /> Select {config.label} Record to Adjust
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <div className="form-group" style={{ maxWidth: '420px', marginBottom: 0 }}>
          <input
            type="text"
            placeholder={`Search ${config.label.toLowerCase()} records...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {config.dateKey && (
          <>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
              >
                Clear Dates
              </button>
            )}
          </>
        )}
      </div>

      {loading ? (
        <p><FontAwesomeIcon icon={faSpinner} spin /> Loading {config.label.toLowerCase()} records...</p>
      ) : error ? (
        <div className="alert-message error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faInbox} style={{ fontSize: '28px', opacity: 0.3 }} />
          <p>No {config.label.toLowerCase()} records found.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="adjustments-table">
            <thead>
              <tr>
                {config.columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th style={{ width: '90px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((row) => (
                <tr key={row.id}>
                  {config.columns.map((col) => (
                    <td key={col.key}>
                      {col.format ? col.format(row[col.key]) : (row[col.key] ?? '-')}
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => setSelectedId(String(row.id))}
                      disabled={config.canEdit ? !config.canEdit(row) : false}
                      title={config.canEdit && !config.canEdit(row) ? config.lockedReason : undefined}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 50 && (
            <p className="help-text">Showing first 50 of {filtered.length} results. Refine your search to narrow down.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryAdjustmentPanel;