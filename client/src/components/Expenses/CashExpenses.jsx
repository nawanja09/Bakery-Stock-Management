// src/components/Expenses/CashExpenses.jsx
//
// Cash Expenses screen — records a cash-based expense against a Company's
// Cash Book (cash_accounts). One cashbook per company (1:1 from cash_accounts),
// so selecting a Company automatically determines the Cashbook.
//
// Business Rule:
//   The Cashbook dropdown is filtered to match the selected Company.
//   When Company = JH → only "JH - Cash Book" is shown.
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
  faWallet
} from '@fortawesome/free-solid-svg-icons';
import './Expenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import useExpenseTypes, { withSavedOption, findExpenseTypeId } from './useExpenseTypes';

// ── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  expense_date:   today(),
  voucher_number: '',
  company_id:     '',
  expense_type_id:     '',
  expense_type:        '',
  sub_expense_type_id: '',
  sub_expense_type:    '',
  description:    '',
  amount:         ''
};

// ── component ─────────────────────────────────────────────────────────────────

const CashExpenses = () => {
  const { showPopup } = usePopup();

  // UI state
  const [isLoading,    setIsLoading]    = useState(false);
  const [isFetching,   setIsFetching]   = useState(false);
  const [isEditing,    setIsEditing]    = useState(false);
  const [editingId,    setEditingId]    = useState(null);
  const [showForm,     setShowForm]     = useState(true);

  // Data
  const [records,      setRecords]      = useState([]);
  const [companies,    setCompanies]    = useState([]);
  // Expenses Type / Sub Expenses Type come from Expenses Type Management.
  // Sub types are loaded per selected Expenses Type.
  const { expenseTypes, subExpenseTypes, loadSubExpenseTypes, setSubExpenseTypes } = useExpenseTypes();
  const [suggestedVoucherNo, setSuggestedVoucherNo] = useState('');

  // Form
  const [formData, setFormData] = useState(emptyForm);

  // ── derived: cashbook label for the selected company ──────────────────────
  // cash_accounts has a UNIQUE constraint on company_id, so each company has
  // exactly one cashbook. We display it as "<CompanyName> - Cash Book".
  const selectedCompany = companies.find(c => String(c.id) === String(formData.company_id));
  const cashbookLabel   = selectedCompany ? `${selectedCompany.name} - Cash Book` : '';

  // ── data fetching ─────────────────────────────────────────────────────────

  const fetchVoucherSuggestion = useCallback(async () => {
    try {
      const res = await api.get('/cash-expenses/next-voucher-number');
      if (res.data.voucher_number) setSuggestedVoucherNo(res.data.voucher_number);
    } catch (err) {
      console.error('Error fetching voucher suggestion:', err);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await api.get('/cash-expenses');
      setRecords(res.data || []);
    } catch (err) {
      console.error('Error fetching cash expenses:', err);
      showPopup('error', 'Failed to load cash expenses');
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/purchases/companies');
      setCompanies(res.data || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchCompanies();
    fetchVoucherSuggestion();
  }, [fetchRecords, fetchCompanies, fetchVoucherSuggestion]);

  // Pre-fill voucher number once the suggestion loads (and form is empty)
  useEffect(() => {
    if (suggestedVoucherNo && !isEditing) {
      setFormData(prev => prev.voucher_number ? prev : { ...prev, voucher_number: suggestedVoucherNo });
    }
  }, [suggestedVoucherNo, isEditing]);

  // ── form handlers ─────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Changing the Expenses Type clears the Sub Expenses Type and loads only
  // that type's sub types.
  const handleExpenseTypeChange = (e) => {
    const id = e.target.value;
    const type = expenseTypes.find(t => String(t.id) === String(id));
    setFormData(prev => ({
      ...prev,
      expense_type_id: id,
      expense_type: type ? type.name : '',
      sub_expense_type_id: '',
      sub_expense_type: ''
    }));
    loadSubExpenseTypes(id);
  };

  const handleSubExpenseTypeChange = (e) => {
    const id = e.target.value;
    const sub = subExpenseTypes.find(s => String(s.id) === String(id));
    setFormData(prev => ({
      ...prev,
      sub_expense_type_id: id,
      sub_expense_type: sub ? sub.name : ''
    }));
  };

  const resetForm = useCallback(async () => {
    setFormData({ ...emptyForm, expense_date: today() });
    setSubExpenseTypes([]);
    setIsEditing(false);
    setEditingId(null);
    // Re-fetch next voucher number
    try {
      const res = await api.get('/cash-expenses/next-voucher-number');
      if (res.data.voucher_number) {
        setFormData(prev => ({ ...prev, voucher_number: res.data.voucher_number }));
        setSuggestedVoucherNo(res.data.voucher_number);
      }
    } catch (_) {}
  }, [setSubExpenseTypes]);

  const handleEdit = (record) => {
    const savedTypeId = findExpenseTypeId(expenseTypes, record.expense_type_id, record.expense_type);
    loadSubExpenseTypes(savedTypeId);
    setFormData({
      expense_date:   record.expense_date   || today(),
      voucher_number: record.voucher_number || '',
      company_id:     String(record.company_id || ''),
      expense_type_id:     savedTypeId,
      expense_type:        record.expense_type || '',
      sub_expense_type_id: record.sub_expense_type_id ? String(record.sub_expense_type_id) : '',
      sub_expense_type:    record.sub_expense_type || '',
      description:    record.description    || '',
      amount:         String(record.amount  || '')
    });
    setIsEditing(true);
    setEditingId(record.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { expense_date, voucher_number, company_id, expense_type_id, amount } = formData;

    if (!expense_date || !voucher_number.trim() || !company_id || !expense_type_id || !amount) {
      showPopup('error', 'Please fill all required fields: Date, Voucher No., Company, Expense Type and Amount');
      return;
    }
    if (subExpenseTypes.length > 0 && !formData.sub_expense_type_id) {
      showPopup('error', 'Please select a Sub Expenses Type');
      return;
    }
    if (parseFloat(amount) <= 0) {
      showPopup('error', 'Amount must be greater than zero');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        expense_date:   formData.expense_date,
        voucher_number: formData.voucher_number.trim(),
        company_id:     formData.company_id,
        expense_type_id:     formData.expense_type_id,
        expense_type:        formData.expense_type,
        sub_expense_type_id: formData.sub_expense_type_id || null,
        description:    formData.description || null,
        amount:         parseFloat(formData.amount)
      };

      if (isEditing) {
        await api.put(`/cash-expenses/${editingId}`, payload);
        showPopup('success', 'Cash expense updated successfully');
      } else {
        await api.post('/cash-expenses', payload);
        showPopup('success', 'Cash expense saved successfully');
      }

      await fetchRecords();
      await resetForm();
    } catch (err) {
      console.error('Error saving cash expense:', err);
      showPopup('error', err.response?.data?.error || 'Failed to save cash expense');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this cash expense? This will reverse the ledger entry.')) return;

    try {
      await api.delete(`/cash-expenses/${id}`);
      showPopup('success', 'Cash expense deleted successfully');
      await fetchRecords();
    } catch (err) {
      console.error('Error deleting cash expense:', err);
      showPopup('error', err.response?.data?.error || 'Failed to delete cash expense');
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title">
          <FontAwesomeIcon icon={faWallet} className="page-title-icon" />
          <span>Cash Expenses</span>
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
          <button className="btn btn-secondary" onClick={() => { fetchRecords(); fetchVoucherSuggestion(); }}>
            <FontAwesomeIcon icon={faSync} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Entry Form ── */}
      {showForm && (
        <div className="form-container">
          <h3 className="form-section-title">
            {isEditing ? 'Edit Cash Expense' : 'New Cash Expense'}
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

              {/* Voucher No. */}
              <div className="form-group">
                <label className="form-label required-label">
                  Voucher No.
                  {suggestedVoucherNo && !isEditing && (
                    <span className="form-hint"> (suggested: {suggestedVoucherNo})</span>
                  )}
                </label>
                <input
                  type="text"
                  name="voucher_number"
                  className="form-control"
                  value={formData.voucher_number}
                  onChange={handleChange}
                  placeholder="e.g. CE-001"
                  required
                />
              </div>

              {/* Company */}
              <div className="form-group">
                <label className="form-label required-label">Company</label>
                <select
                  name="company_id"
                  className="form-control"
                  value={formData.company_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Company --</option>
                  {companies.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Cashbook — derived from selected company (1 cashbook per company) */}
              <div className="form-group">
                <label className="form-label">
                  Cashbook
                  <span className="form-hint"> (filtered by Company)</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={cashbookLabel}
                  readOnly
                  placeholder={formData.company_id ? '' : 'Select a Company first'}
                  style={{ backgroundColor: 'var(--color-background)', cursor: 'default' }}
                />
                {formData.company_id && (
                  <span className="field-note" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 3, display: 'block' }}>
                    ✓ Showing only the cashbook for the selected company
                  </span>
                )}
              </div>

              {/* Expense Type */}
              <div className="form-group">
                <label className="form-label required-label">Expenses Type</label>
                <select
                  name="expense_type_id"
                  className="form-control"
                  value={formData.expense_type_id}
                  onChange={handleExpenseTypeChange}
                  required
                >
                  <option value="">-- Select Expense Type --</option>
                  {withSavedOption(expenseTypes, formData.expense_type_id, formData.expense_type).map(et => (
                    <option key={et.id} value={et.id}>{et.name}</option>
                  ))}
                </select>
              </div>

              {/* Sub Expenses Type — options depend on the selected Expenses Type */}
              <div className="form-group">
                <label className={`form-label${subExpenseTypes.length > 0 ? ' required-label' : ''}`}>Sub Expenses Type</label>
                <select
                  name="sub_expense_type_id"
                  className="form-control"
                  value={formData.sub_expense_type_id}
                  onChange={handleSubExpenseTypeChange}
                  required={subExpenseTypes.length > 0}
                  disabled={!formData.expense_type_id}
                >
                  <option value="">{formData.expense_type_id ? '-- Select Sub Expense Type --' : 'Select Expense Type First'}</option>
                  {withSavedOption(subExpenseTypes, formData.sub_expense_type_id, formData.sub_expense_type).map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
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
          <h3 className="table-title">Cash Expense Records</h3>
          {isFetching && <FontAwesomeIcon icon={faSpinner} spin style={{ color: 'var(--color-primary)' }} />}
        </div>

        <div className="table-responsive">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Company</th>
                <th>Cashbook</th>
                <th>Expense Type</th>
                <th>Sub Expense Type</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted" style={{ padding: '24px' }}>
                    {isFetching ? 'Loading…' : 'No cash expense records found.'}
                  </td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr key={rec.id}>
                    <td className="date-cell">{rec.expense_date}</td>
                    <td><code>{rec.voucher_number}</code></td>
                    <td>{rec.company_name || '—'}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      {rec.company_name ? `${rec.company_name} - Cash Book` : '—'}
                    </td>
                    <td>{rec.expense_type}</td>
                    <td>{rec.sub_expense_type || '—'}</td>
                    <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

export default CashExpenses;
