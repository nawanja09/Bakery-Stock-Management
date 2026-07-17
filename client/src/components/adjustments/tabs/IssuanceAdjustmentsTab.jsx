// src/components/adjustments/tabs/IssuanceAdjustmentsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatNumber } from '../../../utils/formatters';

const EMPTY_FILTERS = { department_id: 'all', item_id: 'all', startDate: '', endDate: '' };

const IssuanceAdjustmentsTab = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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
      const res = await api.get(`/issuances?${params.toString()}`);
      setRows(res.data || []);
    } catch (err) {
      console.error('Error fetching issuance adjustments:', err);
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
            <label>Department</label>
            <select value={filters.department_id} onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))}>
              <option value="all">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
          <h3>Issuance Records</h3>
          <span className="pagination-entries">{formatNumber(rows.length)} entries found</span>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-responsive">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Department</th>
                  <th>Received By</th>
                  <th>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{new Date(r.issuance_date).toLocaleString()}</td>
                    <td>{r.department_name}</td>
                    <td>{r.received_by}</td>
                    <td>{(r.items || []).length} item(s)</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/issuance/edit/${r.id}`)}>Edit</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="empty-state">
                    <FontAwesomeIcon icon={faFileAlt} style={{ fontSize: '28px', opacity: 0.3 }} /><br />No issuance records found.
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

export default IssuanceAdjustmentsTab;