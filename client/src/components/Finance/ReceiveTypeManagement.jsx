// src/components/Finance/ReceiveTypeManagement.jsx
// Management UI for Cash/Bank Receive Types — backed by the receive_types SQL table.
// Reuses the shared RMManagementList component for consistent look and behaviour.
import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import api from '../../api';
import { usePopup } from '../context/PopupContext';

const ReceiveTypeManagement = () => {
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
    if (!window.confirm(`Are you sure you want to ${action} "${record.type_name}"?`)) return;
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
    <div className="rm-mgmt-container">
      <div className="rm-mgmt-header">
        <div className="rm-mgmt-header-top">
          <div>
            <h2>Cash / Bank Receive Types</h2>
          </div>
          <button className="btn-add-rm" onClick={() => { setShowAddForm(true); setEditingRecord(null); }}>
            <FiPlus size={16} /> Add Receive Type
          </button>
        </div>
        <div className="rm-mgmt-search">
          <FiSearch />
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
        <form className="rm-inline-form" onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Director, Investor, Loan Receipt"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              required
              style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
            />
            <button type="submit" className="btn-add-rm" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" style={{ padding: '0.45rem 0.9rem', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', fontSize: '0.9rem' }} onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Edit Form */}
      {editingRecord && (
        <form className="rm-inline-form" onSubmit={handleEdit}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Editing: <em>{editingRecord.type_name}</em></label>
            <input
              type="text"
              autoFocus
              value={editTypeName}
              onChange={e => setEditTypeName(e.target.value)}
              required
              style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #6366f1', fontSize: '0.9rem' }}
            />
            <button type="submit" className="btn-add-rm" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" style={{ padding: '0.45rem 0.9rem', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', fontSize: '0.9rem' }} onClick={() => setEditingRecord(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rm-mgmt-table-container">
        {loading ? (
          <div className="rm-mgmt-loading">Loading receive types…</div>
        ) : filteredRecords.length === 0 ? (
          <div className="rm-mgmt-no-data">
            <p>{records.length === 0 ? 'No receive types found. Add your first type to get started.' : `No results for "${searchTerm}".`}</p>
          </div>
        ) : (
          <table className="rm-mgmt-table">
            <thead>
              <tr>
                <th>RECEIVE TYPE</th>
                <th>STATUS</th>
                <th className="rm-action-col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(rec => (
                <tr key={rec.id}>
                  <td className="rm-name-cell">{rec.type_name}</td>
                  <td className="rm-status-cell">
                    <span className={`rm-status-badge ${rec.status === 1 ? 'active' : 'inactive'}`}>
                      <span className="rm-status-dot" />
                      {rec.status === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="rm-action-cell">
                    <button type="button" className="rm-btn-edit" onClick={() => openEdit(rec)}>
                      <FiEdit size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className={rec.status === 1 ? 'rm-btn-delete' : 'rm-btn-edit'}
                      onClick={() => handleToggleStatus(rec)}
                      title={rec.status === 1 ? 'Deactivate' : 'Activate'}
                    >
                      {rec.status === 1
                        ? <><FiToggleLeft size={14} /> Deactivate</>
                        : <><FiToggleRight size={14} /> Activate</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && records.length > 0 && (
        <p className="rm-count-badge">
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default ReceiveTypeManagement;
