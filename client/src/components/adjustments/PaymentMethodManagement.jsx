// src/components/adjustments/PaymentMethodManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faCheckCircle, faExclamationCircle,
  faToggleOn, faToggleOff, faSave, faTimes, faCreditCard
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';

const PaymentMethodManagement = () => {
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
    if (!window.confirm(`Delete "${method.name}"? This can't be undone.`)) return;

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
    <div className="adjustments-container">
      <div className="adjustments-header">
        <div className="adjustments-header-left">
          <h1>Payment Method Management</h1>
        </div>
      </div>

      {message.text && (
        <div className={`alert-message ${message.type}`}>
          <FontAwesomeIcon icon={message.type === 'error' ? faExclamationCircle : faCheckCircle} />
          {message.text}
        </div>
      )}

      <div className="form-section">
        <h3 className="form-section-title">
          <FontAwesomeIcon icon={faPlus} /> Add Payment Method
        </h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', maxWidth: '480px' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Payment Method Name</label>
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

      <div className="form-section">
        <h3 className="form-section-title">
          <FontAwesomeIcon icon={faCreditCard} /> Payment Methods
        </h3>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-responsive">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th style={{ width: '180px' }}>Actions</th>
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
                        />
                      ) : (
                        m.name
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${m.is_active ? 'success' : 'draft'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {editingId === m.id ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => saveEdit(m.id)} title="Save">
                            <FontAwesomeIcon icon={faSave} />
                          </button>{' '}
                          <button className="btn btn-sm btn-secondary" onClick={cancelEdit} title="Cancel">
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => startEdit(m)} title="Rename">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => toggleActive(m)}
                            title={m.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <FontAwesomeIcon icon={m.is_active ? faToggleOn : faToggleOff} />
                          </button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m)} title="Delete">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </>
                      )}
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