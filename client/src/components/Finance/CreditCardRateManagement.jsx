// src/components/Finance/CreditCardRateManagement.jsx
// Management -> Credit Card Rate: the card commission rate (%) of each
// Branch / Department (departments master), backed by /api/credit-card-rates.
// The Card Ledger applies the ACTIVE rate of each department when card
// transactions are realised ("Visa Card Payment commission").
// Same look and behaviour as Receive Types: Add, Edit, Activate / Deactivate
// (no hard delete). Only one ACTIVE rate per Branch / Department; the server
// enforces it too. View-only roles (QB) see the list without actions.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FiSearch, FiPlus, FiEdit, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import { canWrite, getRawAuthRole } from '../../config/rolePermissions';

import { useConfirm } from '../common/ui';
const EMPTY_FORM = { department_id: '', rate: '' };

// Mirrors the server rule (services/creditCardRateService.js parseRatePercent).
export const validateRate = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return 'Credit Card Rate (%) is required';
  if (!/^\d*(\.\d*)?$/.test(text) || text === '.') return 'Credit Card Rate (%) must be a number between 0 and 100';
  if ((text.split('.')[1] || '').length > 2) return 'Credit Card Rate (%) can have at most 2 decimal places';
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 100) return 'Credit Card Rate (%) must be between 0 and 100';
  return '';
};

const fmtRate = (rate) => `${(Number.parseFloat(rate) || 0).toFixed(2)}%`;

const inputStyle = {
  height: 'var(--input-height)', padding: '0 0.75rem', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)'
};

const CreditCardRateManagement = () => {
  const confirm = useConfirm();
  const { showPopup } = usePopup();
  const writable = canWrite(getRawAuthRole());
  const [records, setRecords] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/credit-card-rates');
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to load credit card rates');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchAll();
    api.get('/departments')
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartments([]));
  }, [fetchAll]);

  // Departments that already have an ACTIVE rate (other than the one being edited).
  const activeDepartments = useMemo(() => new Set(
    records.filter((r) => Number(r.status) === 1 && r.id !== editingRecord?.id).map((r) => Number(r.department_id))
  ), [records, editingRecord]);

  const openAdd = () => {
    setFormMode('add'); setEditingRecord(null); setForm(EMPTY_FORM); setFormError('');
  };
  const openEdit = (record) => {
    setFormMode('edit'); setEditingRecord(record); setFormError('');
    setForm({ department_id: String(record.department_id), rate: String(Number.parseFloat(record.rate)) });
  };
  const closeForm = () => { setFormMode(null); setEditingRecord(null); setForm(EMPTY_FORM); setFormError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.department_id) return setFormError('Branch / Department is required');
    const rateError = validateRate(form.rate);
    if (rateError) return setFormError(rateError);
    const keepsActive = formMode === 'add' || Number(editingRecord?.status) === 1;
    if (keepsActive && activeDepartments.has(Number(form.department_id))) {
      return setFormError('This Branch / Department already has an active Credit Card Rate. Edit it, or deactivate it first.');
    }

    setSubmitting(true);
    setFormError('');
    const payload = { department_id: Number(form.department_id), rate: String(form.rate).trim() };
    try {
      const res = formMode === 'add'
        ? await api.post('/credit-card-rates', payload)
        : await api.put(`/credit-card-rates/${editingRecord.id}`, payload);
      showPopup('success', res.data?.message || 'Credit Card Rate saved');
      closeForm();
      await fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save credit card rate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record) => {
    const isActive = Number(record.status) === 1;
    const action = isActive ? 'deactivate' : 'activate';
    const warning = isActive ? ' Card transactions of this Branch / Department cannot be realised without an active rate.' : '';
    if (!await confirm(`Are you sure you want to ${action} the Credit Card Rate of "${record.department_name}"?${warning}`)) return;
    try {
      const res = await api.patch(`/credit-card-rates/${record.id}/${action}`);
      showPopup('success', res.data?.message || `Credit Card Rate ${action}d`);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to ${action} credit card rate`);
    }
  };

  const filteredRecords = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return records;
    return records.filter((r) => String(r.department_name || '').toLowerCase().includes(t));
  }, [records, searchTerm]);

  return (
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>Credit Card Rate</h2>
          <p className="text-muted font-sm" style={{ margin: '4px 0 0' }}>
            Card commission per Branch / Department, applied when card transactions are realised in the Card Ledger.
          </p>
        </div>
        {writable && (
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <FiPlus size={16} /> Add Credit Card Rate
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input
            type="text"
            placeholder="Search Branch / Department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {formMode && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: `4px solid var(${formMode === 'add' ? '--color-primary' : '--color-warning'})` }}>
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '2 1 220px' }}>
              <label htmlFor="ccr-department" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Branch / Department</label>
              <select
                id="ccr-department"
                value={form.department_id}
                onChange={(e) => { setForm((f) => ({ ...f, department_id: e.target.value })); setFormError(''); }}
                style={inputStyle}
                autoFocus
              >
                <option value="">Select Branch / Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{activeDepartments.has(Number(d.id)) ? ' (has an active rate)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
              <label htmlFor="ccr-rate" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Credit Card Rate (%)</label>
              <input
                id="ccr-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 2.00"
                value={form.rate}
                onChange={(e) => { setForm((f) => ({ ...f, rate: e.target.value })); setFormError(''); }}
                style={{ ...inputStyle, textAlign: 'right' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : formMode === 'add' ? 'Save' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={submitting}>Cancel</button>
            {formError && (
              <div role="alert" style={{ flexBasis: '100%', color: 'var(--color-danger, #b91c1c)', fontSize: 'var(--font-size-sm)' }}>{formError}</div>
            )}
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-spinner"></div>
            Loading credit card rates…
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <p>{records.length === 0 ? 'No credit card rates yet. Add a rate for each Branch / Department that takes card payments.' : `No results for "${searchTerm}".`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>BRANCH / DEPARTMENT</th>
                  <th style={{ textAlign: 'right' }}>CREDIT CARD RATE (%)</th>
                  <th>STATUS</th>
                  {writable && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => {
                  const active = Number(rec.status) === 1;
                  return (
                    <tr key={rec.id}>
                      <td><strong>{rec.department_name || `Department #${rec.department_id}`}</strong></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRate(rec.rate)}</td>
                      <td>
                        <span className={`badge ${active ? 'badge-success' : 'badge-neutral'}`}>{active ? 'Active' : 'Inactive'}</span>
                      </td>
                      {writable && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-icon edit" onClick={() => openEdit(rec)} title="Edit" aria-label={`Edit ${rec.department_name}`}>
                              <FiEdit size={14} />
                            </button>
                            <button
                              type="button"
                              className={`btn-icon ${active ? 'delete' : 'edit'}`}
                              onClick={() => handleToggleStatus(rec)}
                              title={active ? 'Deactivate' : 'Activate'}
                              aria-label={`${active ? 'Deactivate' : 'Activate'} ${rec.department_name}`}
                            >
                              {active ? <FiToggleLeft size={14} /> : <FiToggleRight size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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

export default CreditCardRateManagement;
