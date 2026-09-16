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
import './Adjustments.css';

// Category -> { endpoint, columns, editor }
const CATEGORY_CONFIG = {
  Invoice: {
    endpoint: '/purchases',
    label: 'Invoice',
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
  'Purchasing Payment Adjustment': {
    endpoint: '/purchases/payments/adjustable',
    label: 'Purchasing Payment Adjustment',
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
};

const CategoryAdjustmentPanel = ({ category, onAdjustmentSaved }) => {
  const config = CATEGORY_CONFIG[category];

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

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
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  if (!config) return null;

  // ---- Editing an existing record ----
  if (selectedId) {
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
  const filtered = term
    ? records.filter((row) => config.matches(row, term))
    : records;

  return (
    <div className="form-section">
      <h3 className="form-section-title">
        <FontAwesomeIcon icon={faSearch} /> Select {config.label} Record to Adjust
      </h3>

      <div className="form-group" style={{ maxWidth: '420px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder={`Search ${config.label.toLowerCase()} records...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                      onClick={() => setSelectedId(row.id)}
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