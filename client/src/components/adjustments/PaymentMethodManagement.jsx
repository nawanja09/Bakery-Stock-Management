// src/components/adjustments/PaymentMethodManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faCheckCircle, faExclamationCircle,
  faToggleOn, faToggleOff, faSave, faTimes, faCreditCard
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';

import { useConfirm } from '../common/ui';
const PaymentMethodManagement = () => {
  const confirm = useConfirm();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const fetchMethods = useCallback(async () => {
    try {
      setLoading(true);
      // include_inactive=true so this management page can also show and
      // reactivate disabled methods; the Purchasing page dropdown calls
      // this same endpoint WITHOUT that flag, so it only ever sees active ones.
      const res = await api.get('/payment-methods?include_inactive=true');
      setMethods(res.data || []);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      setMessage({ type: 'error', text: 'Unable to load payment methods. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  const clearMessageLater = () => setTimeout(() => setMessage({ type: '', text: '' }), 3000);

  const handleAdd = async (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      setSubmitting(true);
      await api.post('/payment-methods', { name: trimmed });
      setMessage({ type: 'success', text: `"${trimmed}" added successfully.` });
      setNewName('');
      fetchMethods();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Unable to add payment method.' });
    } finally {
      setSubmitting(false);
      clearMessageLater();
    }
  };

  const startEdit = (method) => {
    setEditingId(method.id);
    setEditingName(method.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async (id) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;

    try {
      await api.put(`/payment-methods/${id}`, { name: trimmed });
      setMessage({ type: 'success', text: 'Payment method updated.' });
      cancelEdit();
      fetchMethods();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Unable to update payment method.' });
    } finally {
      clearMessageLater();
    }
  };

  const toggleActive = async (method) => {
    try {
      await api.put(`/payment-methods/${method.id}`, { is_active: method.is_active ? 0 : 1 });
      fetchMethods();
    } catch (err) {
      setMessage({ type: 'error', text: 'Unable to update status.' });
      clearMessageLater();
    }
  };

  const handleDelete = async (method) => {
    if (!await confirm(`Delete "${method.name}"? This can't be undone.`)) return;

    try {
      await api.delete(`/payment-methods/${method.id}`);
      setMessage({ type: 'success', text: 'Payment method deleted.' });
      fetchMethods();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Unable to delete payment method.' });
    } finally {
      clearMessageLater();
    }
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Payment Method Management</h2>
        </div>
      </header>

      {message.text && (
        <div className={`alert alert-${message.type}`}>
          <FontAwesomeIcon icon={message.type === 'error' ? faExclamationCircle : faCheckCircle} />
          {message.text}
        </div>
      )}

      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: 'var(--font-size-lg)' }}>
          <FontAwesomeIcon icon={faPlus} className="text-muted" /> Add Payment Method
        </h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', maxWidth: '480px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Payment Method Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Mobile Wallet"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <FontAwesomeIcon icon={faPlus} /> {submitting ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-light)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
            <FontAwesomeIcon icon={faCreditCard} className="text-muted" /> Payment Methods
          </h3>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            Loading...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {methods.length > 0 ? methods.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {editingId === m.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          style={{ minHeight: '32px', height: '32px' }}
                        />
                      ) : (
                        <strong>{m.name}</strong>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${m.is_active ? 'badge-success' : 'badge-neutral'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        {editingId === m.id ? (
                          <>
                            <button className="btn-icon edit" onClick={() => saveEdit(m.id)} title="Save">
                              <FontAwesomeIcon icon={faSave} />
                            </button>
                            <button className="btn-icon" onClick={cancelEdit} title="Cancel">
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn-icon edit" onClick={() => startEdit(m)} title="Rename">
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              className={`btn-icon ${m.is_active ? 'delete' : 'edit'}`}
                              onClick={() => toggleActive(m)}
                              title={m.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <FontAwesomeIcon icon={m.is_active ? faToggleOn : faToggleOff} />
                            </button>
                            <button className="btn-icon delete" onClick={() => handleDelete(m)} title="Delete">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="3" className="empty-state">No payment methods yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodManagement;