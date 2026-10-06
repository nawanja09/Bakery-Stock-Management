// src/components/Finance/OtherLedgerManagement.jsx
//
// Management -> Other Ledgers (Director, Biyagama, AR, Short, Excess, ...).
// Follows the Receive Types management pattern. The balance is derived on the
// server from the ledger transactions and is read-only here. Ledgers are never
// deleted - "Inactive" hides one from new transactions but keeps its history.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FiSearch, FiPlus, FiEdit, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import usePermissions from '../../hooks/usePermissions';

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OtherLedgerManagement = () => {
  const { canWrite } = usePermissions();
  const { showPopup } = usePopup();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/other-ledgers');
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      showPopup('error', 'Failed to load Other Ledgers');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return showPopup('error', 'Name is required');
    setSubmitting(true);
    try {
      await api.post('/other-ledgers', { name: newName.trim() });
      showPopup('success', 'Other Ledger added');
      setNewName('');
      setShowAddForm(false);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add Other Ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (!editName.trim()) return showPopup('error', 'Name is required');
    setSubmitting(true);
    try {
      await api.put(`/other-ledgers/${editingRecord.id}`, { name: editName.trim() });
      showPopup('success', 'Other Ledger updated');
      setEditingRecord(null);
      setEditName('');
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update Other Ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record) => {
    const makeActive = record.status !== 1;
    const message = makeActive
      ? `Activate "${record.name}"?`
      : `Make "${record.name}" inactive? It will no longer appear in new transactions, but its history is kept.`;
    if (!window.confirm(message)) return;
    try {
      await api.patch(`/other-ledgers/${record.id}/status`, { status: makeActive ? 1 : 0 });
      showPopup('success', makeActive ? `"${record.name}" activated` : `"${record.name}" made inactive`);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to change status');
    }
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditName(record.name);
    setShowAddForm(false);
  };

  const filteredRecords = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    return t ? records.filter((r) => r.name.toLowerCase().includes(t)) : records;
  }, [records, searchTerm]);

  const inputStyle = { flex: 1, minWidth: 200, height: 'var(--input-height)', padding: '0 0.75rem', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' };

  return (
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>Other Ledgers</h2>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingRecord(null); }}>
            <FiPlus size={16} /> Add Other Ledger
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input type="text" placeholder="Search Other Ledgers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {showAddForm && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-primary)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text" autoFocus maxLength={100} required
              placeholder="e.g. Director, Biyagama, AR, Short, Excess"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ ...inputStyle, border: '1px solid var(--color-border)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
          </form>
        </div>
      )}

      {editingRecord && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-warning)' }}>
          <form onSubmit={handleEdit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
              Editing: <em style={{ color: 'var(--color-text-primary)', fontStyle: 'normal' }}>{editingRecord.name}</em>
            </label>
            <input
              type="text" autoFocus maxLength={100} required
              value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ ...inputStyle, border: '1px solid var(--color-primary)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingRecord(null)}>Cancel</button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-state"><div className="loading-spinner"></div>Loading Other Ledgers…</div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <p>{records.length === 0 ? 'No Other Ledgers yet. Add your first one to get started.' : `No results for "${searchTerm}".`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th style={{ textAlign: 'right' }}>BALANCE</th>
                  <th style={{ textAlign: 'center' }}>EDIT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} style={rec.status === 1 ? undefined : { opacity: 0.65 }}>
                    <td><strong>{rec.name}</strong></td>
                    <td style={{ textAlign: 'right' }}>{fmt(rec.balance)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {canWrite ? (
                        <button type="button" className="btn-icon edit" onClick={() => openEdit(rec)} title="Edit"><FiEdit size={14} /></button>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${rec.status === 1 ? 'badge-success' : 'badge-neutral'}`}>
                          {rec.status === 1 ? 'Active' : 'Inactive'}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            className={`btn-icon ${rec.status === 1 ? 'delete' : 'edit'}`}
                            onClick={() => handleToggleStatus(rec)}
                            title={rec.status === 1 ? 'Make inactive' : 'Activate'}
                          >
                            {rec.status === 1 ? <FiToggleLeft size={14} /> : <FiToggleRight size={14} />}
                          </button>
                        )}
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

export default OtherLedgerManagement;
