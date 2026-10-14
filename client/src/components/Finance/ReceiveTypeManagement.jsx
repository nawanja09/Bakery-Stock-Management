// src/components/Finance/ReceiveTypeManagement.jsx
// Management UI for Cash/Bank Receive Types — backed by the receive_types SQL table.
// Reuses the shared RMManagementList component for consistent look and behaviour.
import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import api from '../../api';
import { usePopup } from '../context/PopupContext';

import { useConfirm } from '../common/ui';
const ReceiveTypeManagement = () => {
  const confirm = useConfirm();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [editTypeName, setEditTypeName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await api.get('/receive-types/all');
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      showPopup('error', 'Failed to load receive types');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/receive-types', { type_name: newTypeName.trim() });
      showPopup('success', res.data?.message || 'Receive type added');
      setNewTypeName('');
      setShowAddForm(false);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add receive type');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editTypeName.trim() || !editingRecord) return;
    setSubmitting(true);
    try {
      const res = await api.put(`/receive-types/${editingRecord.id}`, { type_name: editTypeName.trim() });
      showPopup('success', res.data?.message || 'Receive type updated');
      setEditingRecord(null);
      setEditTypeName('');
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update receive type');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record) => {
    const isActive = record.status === 1;
    const action = isActive ? 'deactivate' : 'activate';
    if (!await confirm(`Are you sure you want to ${action} "${record.type_name}"?`)) return;
    try {
      if (isActive) {
        await api.delete(`/receive-types/${record.id}`);
        showPopup('success', `"${record.type_name}" deactivated`);
      } else {
        await api.patch(`/receive-types/${record.id}/restore`);
        showPopup('success', `"${record.type_name}" activated`);
      }
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to ${action} receive type`);
    }
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditTypeName(record.type_name);
    setShowAddForm(false);
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const t = searchTerm.trim().toLowerCase();
    return records.filter(r => r.type_name.toLowerCase().includes(t));
  }, [records, searchTerm]);

  return (
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>Cash / Bank Receive Types</h2>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingRecord(null); }}>
          <FiPlus size={16} /> Add Receive Type
        </button>
      </div>

      <div className="filters-section">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input
            type="text"
            placeholder="Search receive types..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-primary)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Director, Investor, Loan Receipt"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              required
              style={{ flex: 1, minWidth: 200, height: 'var(--input-height)', padding: '0 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Edit Form */}
      {editingRecord && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-warning)' }}>
          <form onSubmit={handleEdit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
              Editing: <em style={{ color: 'var(--color-text-primary)', fontStyle: 'normal' }}>{editingRecord.type_name}</em>
            </label>
            <input
              type="text"
              autoFocus
              value={editTypeName}
              onChange={e => setEditTypeName(e.target.value)}
              required
              style={{ flex: 1, minWidth: 200, height: 'var(--input-height)', padding: '0 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary)', fontSize: 'var(--font-size-sm)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingRecord(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            Loading receive types…
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <p>{records.length === 0 ? 'No receive types found. Add your first type to get started.' : `No results for "${searchTerm}".`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>RECEIVE TYPE</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(rec => (
                  <tr key={rec.id}>
                    <td><strong>{rec.type_name}</strong></td>
                    <td>
                      <span className={`badge ${rec.status === 1 ? 'badge-success' : 'badge-neutral'}`}>
                        {rec.status === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn-icon edit" onClick={() => openEdit(rec)} title="Edit">
                          <FiEdit size={14} />
                        </button>
                        <button
                          type="button"
                          className={`btn-icon ${rec.status === 1 ? 'delete' : 'edit'}`}
                          onClick={() => handleToggleStatus(rec)}
                          title={rec.status === 1 ? 'Deactivate' : 'Activate'}
                        >
                          {rec.status === 1
                            ? <FiToggleLeft size={14} />
                            : <FiToggleRight size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && records.length > 0 && (
        <p className="text-muted text-right font-sm" style={{ paddingRight: '8px' }}>
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default ReceiveTypeManagement;
