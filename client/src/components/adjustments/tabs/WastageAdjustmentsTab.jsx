// src/components/adjustments/tabs/WastageAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const WASTAGE_REASONS = ['Expired', 'Damaged', 'Overproduction', 'Poor Storage', 'Forecasting errors', 'Human error', 'Other'];
const EMPTY_FILTERS = { reason: 'all', item_id: 'all', startDate: '', endDate: '' };

const WastageAdjustmentsTab = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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
      const res = await api.get(`/wastages?${params.toString()}`);
      setRows(res.data || []);
    } catch (err) {
      console.error('Error fetching wastage adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchRows(); }, [filters, fetchRows]);

  return (
    <div>
      <div className="filter-card">
        <div className="filter-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div className="filter-group">
            <label>Wastage Reason</label>
            <select value={filters.reason} onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}>
              <option value="all">All Reasons</option>
              {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Item</label>
            <select value={filters.item_id} onChange={(e) => setFilters((f) => ({ ...f, item_id: e.target.value }))}>
              <option value="all">All Items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.item_code} - {i.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Start Date</label>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="filter-group">
            <label>End Date</label>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
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
          <h3>Wastage Records</h3>
          <span className="pagination-entries">{formatNumber(rows.length)} entries found</span>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-responsive">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>Note #</th>
                  <th>Date</th>
                  <th>Reason</th>
                  <th>Approved By</th>
                  <th>Total Loss</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.wastage_note_number}</td>
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>{r.reason}</td>
                    <td>{r.approved_by}</td>
                    <td>{formatCurrency(r.total_loss)}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/wastage/edit/${r.id}`)}>Edit</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="empty-state">
                    <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: '28px', opacity: 0.3 }} /><br />No wastage records found.
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

export default WastageAdjustmentsTab;