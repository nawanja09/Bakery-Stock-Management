// src/components/Expenses/HiddenExpenses.jsx
//
// Hidden Expenses screen — report-only expense records (PickMe rides,
// credit card charges, etc.). These are saved separately from every
// other expense table and NEVER touch the Cash Ledger or Bank Ledger:
// creating, editing or deleting a Hidden Expense here posts nothing to
// the Cash Book or Bank Book. They only ever show up on the Expenses
// Report, clearly labelled as "Hidden Expense".
//
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faTimes,
  faPlus,
  faEdit,
  faTrash,
  faSync,
  faSpinner,
  faUserSecret
} from '@fortawesome/free-solid-svg-icons';
import './Expenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

// ── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const TYPE_OPTIONS = ['PickMe', 'Credit Card Charge'];

const emptyForm = {
  expense_date: today(),
  amount:       '',
  type:         '',
  description:  ''
};

// ── component ─────────────────────────────────────────────────────────────────

const HiddenExpenses = () => {
  const { showPopup } = usePopup();

  // UI state
  const [isLoading,  setIsLoading]  = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isEditing,  setIsEditing]  = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [showForm,   setShowForm]   = useState(true);

  // Data
  const [records, setRecords] = useState([]);

  // Form
  const [formData, setFormData] = useState(emptyForm);

  // ── data fetching ─────────────────────────────────────────────────────────

  const fetchRecords = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await api.get('/hidden-expenses');
      setRecords(res.data || []);
    } catch (err) {
      console.error('Error fetching hidden expenses:', err);
      showPopup('error', 'Failed to load hidden expenses');
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── form handlers ─────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({ ...emptyForm, expense_date: today() });
    setIsEditing(false);
    setEditingId(null);
  };

  const handleEdit = (record) => {
    setFormData({
      expense_date: record.expense_date || today(),
      amount:       String(record.amount || ''),
      type:         record.type || '',
      description:  record.description || ''
    });
    setIsEditing(true);
    setEditingId(record.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { expense_date, amount, type } = formData;

    if (!expense_date || !amount || !type) {
      showPopup('error', 'Please fill all required fields: Date, Amount and Type');
      return;
    }
    if (parseFloat(amount) <= 0) {
      showPopup('error', 'Amount must be greater than zero');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        expense_date: formData.expense_date,
        amount:       parseFloat(formData.amount),
        type:         formData.type,
        description:  formData.description || null
      };

      if (isEditing) {
        await api.put(`/hidden-expenses/${editingId}`, payload);
        showPopup('success', 'Hidden expense updated successfully');
      } else {
        await api.post('/hidden-expenses', payload);
        showPopup('success', 'Hidden expense saved successfully');
      }

      await fetchRecords();
      resetForm();
    } catch (err) {
      console.error('Error saving hidden expense:', err);
      showPopup('error', err.response?.data?.error || 'Failed to save hidden expense');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this hidden expense?')) return;

    try {
      await api.delete(`/hidden-expenses/${id}`);
      showPopup('success', 'Hidden expense deleted successfully');
      await fetchRecords();
    } catch (err) {
      console.error('Error deleting hidden expense:', err);
      showPopup('error', err.response?.data?.error || 'Failed to delete hidden expense');
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title">
          <FontAwesomeIcon icon={faUserSecret} className="page-title-icon" />
          <span>Hidden Expenses</span>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowForm(v => !v)}
            title={showForm ? 'Hide Form' : 'Show Form'}
          >
            <FontAwesomeIcon icon={showForm ? faTimes : faPlus} />
            <span>{showForm ? 'Hide Form' : 'New Entry'}</span>
          </button>
          <button className="btn btn-secondary" onClick={fetchRecords}>
            <FontAwesomeIcon icon={faSync} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: -6, marginBottom: 16 }}>
        Report-only records — Hidden Expenses never post to the Cash Ledger or Bank Ledger.
        They only appear on the Expenses Report, clearly marked as Hidden Expenses.
      </p>

      {/* ── Entry Form ── */}
      {showForm && (
        <div className="form-container">
          <h3 className="form-section-title">
            {isEditing ? 'Edit Hidden Expense' : 'New Hidden Expense'}
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">

              {/* Date */}
              <div className="form-group">
                <label className="form-label required-label">Date</label>
                <input
                  type="date"
                  name="expense_date"
                  className="form-control"
                  value={formData.expense_date}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Amount */}
              <div className="form-group">
                <label className="form-label required-label">Amount</label>
                <input
                  type="number"
                  name="amount"
                  className="form-control"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              {/* Type */}
              <div className="form-group">
                <label className="form-label required-label">Type</label>
                <select
                  name="type"
                  className="form-control"
                  value={formData.type}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Type --</option>
                  {TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Description (full-width) */}
              <div className="form-group form-group-full">
                <label className="form-label">Description</label>
                <textarea
                  name="description"
                  className="form-control"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>

            </div>

            {/* Form Actions */}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading
                  ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving…</>
                  : <><FontAwesomeIcon icon={faSave} /> {isEditing ? 'Update' : 'Save'}</>
                }
              </button>
              {isEditing && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetForm}
                  disabled={isLoading}
                >
                  <FontAwesomeIcon icon={faTimes} /> Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── History Table ── */}
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Hidden Expense Records</h3>
          {isFetching && <FontAwesomeIcon icon={faSpinner} spin style={{ color: 'var(--color-primary)' }} />}
        </div>

        <div className="table-responsive">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted" style={{ padding: '24px' }}>
                    {isFetching ? 'Loading…' : 'No hidden expense records found.'}
                  </td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr key={rec.id}>
                    <td className="date-cell">{rec.expense_date}</td>
                    <td>{rec.type}</td>
                    <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.description || '—'}
                    </td>
                    <td className="text-right amount-cell">
                      {parseFloat(rec.amount).toFixed(2)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEdit(rec)}
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(rec.id)}
                          title="Delete"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HiddenExpenses;