// src/components/adjustments/tabs/InvoiceAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const EMPTY_FILTERS = { supplier_id: 'all', invoice_no: '', startDate: '', endDate: '', payment_status: 'all' };

const InvoiceAdjustmentsTab = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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

      const res = await api.get(`/purchases?${params.toString()}`);
      setRows(res.data || []);
    } catch (err) {
      console.error('Error fetching invoice adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(fetchRows, filters.invoice_no ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, fetchRows]);

  return (
    <div>
      <div className="filter-card">
        <div className="filter-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div className="filter-group">
            <label>Supplier</label>
            <select value={filters.supplier_id} onChange={(e) => setFilters((f) => ({ ...f, supplier_id: e.target.value }))}>
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Invoice Number</label>
            <input type="text" value={filters.invoice_no} onChange={(e) => setFilters((f) => ({ ...f, invoice_no: e.target.value }))} placeholder="Search invoice #" />
          </div>
          <div className="filter-group">
            <label>Start Date</label>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="filter-group">
            <label>End Date</label>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={filters.payment_status} onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}>
              <option value="all">All</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Non-Paid">Non-Paid</option>
            </select>
          </div>
          <div className="filter-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
              <FontAwesomeIcon icon={faSync} /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <h3>Invoice Records</h3>
          <span className="pagination-entries">{formatNumber(rows.length)} entries found</span>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-responsive">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.invoice_no}</td>
                    <td>{r.supplier_name}</td>
                    <td>{new Date(r.purchase_date).toLocaleDateString()}</td>
                    <td>{formatCurrency(r.total_with_vat)}</td>
                    <td>{formatCurrency(r.paid_amount)}</td>
                    <td>{formatCurrency(r.balance_amount)}</td>
                    <td><span className="status-badge">{r.payment_status}</span></td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/purchase/edit/${r.id}`)}>Edit</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="8" className="empty-state">
                    <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: '28px', opacity: 0.3 }} /><br />No invoice records found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceAdjustmentsTab;