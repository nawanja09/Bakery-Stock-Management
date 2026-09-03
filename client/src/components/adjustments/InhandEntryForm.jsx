// client/src/components/adjustments/InhandEntryForm.jsx
//
// Modal-style form for creating / editing an Inhand Adjustment entry.
// Dynamically shows Cash In or Cheque In fields based on payment_type.

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faSpinner, faMoneyBillWave, faUniversity,
  faCheckCircle, faExclamationCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';

const EMPTY_FORM = {
  transaction_date : new Date().toISOString().slice(0, 10),
  payment_type     : 'Cash In',
  company_id       : '',
  bank_id          : '',
  cheque_number    : '',
  bank_name        : '',
  cheque_date      : '',
  amount           : '',
  party_name       : '',
  remark           : ''
};

const InhandEntryForm = ({ existingEntry = null, onClose, onSaved }) => {
  const currentUser   = JSON.parse(localStorage.getItem('user') || 'null');
  const isEdit        = !!existingEntry;

  const [formData, setFormData]   = useState(isEdit ? {
    transaction_date : existingEntry.transaction_date,
    payment_type     : existingEntry.payment_type,
    company_id       : existingEntry.company_id || '',
    bank_id          : existingEntry.bank_id    || '',
    cheque_number    : existingEntry.cheque_number || '',
    bank_name        : existingEntry.cheque_bank_name || '',
    cheque_date      : existingEntry.cheque_date || '',
    amount           : existingEntry.amount || '',
    party_name       : existingEntry.party_name || '',
    remark           : existingEntry.remark || ''
  } : { ...EMPTY_FORM });

  const [companies,    setCompanies]    = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashBalance,  setCashBalance]  = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [message,      setMessage]      = useState(null);
  const [loadingData,  setLoadingData]  = useState(true);

  // ── Load companies ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/purchases/companies'),
      api.get('/finance/bank/accounts')
    ])
      .then(([compRes, bankRes]) => {
        const compList = compRes.data || [];
        const bankList = bankRes.data || [];
        setCompanies(compList);
        setBankAccounts(bankList);

        if (!isEdit) {
          setFormData(prev => ({
            ...prev,
            company_id : compList.length > 0 ? String(compList[0].id) : '',
            bank_id    : bankList.length > 0 ? String(bankList[0].id) : ''
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [isEdit]);

  // ── Load cash balance when company changes (Cash In only) ─────────────────
  useEffect(() => {
    if (formData.payment_type !== 'Cash In' || !formData.company_id) {
      setCashBalance(null);
      return;
    }
    api.get(`/finance/cash/balance/${formData.company_id}`)
      .then(res => setCashBalance(res.data?.balance ?? 0))
      .catch(() => setCashBalance(null));
  }, [formData.company_id, formData.payment_type]);

  // ── Auto-fill bank_name when bank account is selected ─────────────────────
  useEffect(() => {
    if (formData.payment_type !== 'Cheque In') return;
    const bank = bankAccounts.find(b => String(b.id) === String(formData.bank_id));
    if (bank) setFormData(prev => ({ ...prev, bank_name: bank.bank_name }));
  }, [formData.bank_id, formData.payment_type, bankAccounts]);

  useEffect(() => {
    if (submitting) return undefined;
    const handleEscape = event => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, submitting]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setMessage(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    // Client-side validation
    if (!formData.transaction_date)
      return setMessage({ type: 'error', text: 'Transaction date is required.' });
    if (!formData.amount || parseFloat(formData.amount) <= 0)
      return setMessage({ type: 'error', text: 'Amount must be greater than zero.' });
    if (formData.payment_type === 'Cash In' && !formData.company_id)
      return setMessage({ type: 'error', text: 'Please select a company (cash account).' });
    if (formData.payment_type === 'Cheque In') {
      if (!formData.bank_id)       return setMessage({ type: 'error', text: 'Please select a bank account.' });
      if (!formData.cheque_number) return setMessage({ type: 'error', text: 'Cheque number is required.' });
      if (!formData.cheque_date)   return setMessage({ type: 'error', text: 'Cheque date is required.' });
    }

    const payload = {
      transaction_date : formData.transaction_date,
      payment_type     : formData.payment_type,
      amount           : parseFloat(formData.amount),
      party_name       : formData.party_name || null,
      remark           : formData.remark     || null,
      company_id       : formData.payment_type === 'Cash In'   ? formData.company_id  : null,
      bank_id          : formData.payment_type === 'Cheque In' ? formData.bank_id      : null,
      cheque_number    : formData.payment_type === 'Cheque In' ? formData.cheque_number : null,
      bank_name        : formData.payment_type === 'Cheque In' ? formData.bank_name    : null,
      cheque_date      : formData.payment_type === 'Cheque In' ? formData.cheque_date  : null,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/inhand/${existingEntry.id}`, payload);
        setMessage({ type: 'success', text: 'Entry updated successfully.' });
      } else {
        await api.post('/inhand', payload);
        setMessage({ type: 'success', text: 'Inhand entry created as Draft.' });
        setFormData({ ...EMPTY_FORM });
      }
      setTimeout(() => { onSaved?.(); onClose?.(); }, 1200);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save entry.' });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBank = bankAccounts.find(b => String(b.id) === String(formData.bank_id));

  return (
    <div className="ih-form-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="ih-form-modal">
        {/* Header */}
        <div className="ih-form-header">
          <div className="ih-form-title">
            <FontAwesomeIcon
              icon={formData.payment_type === 'Cash In' ? faMoneyBillWave : faUniversity}
              className="ih-title-icon"
            />
            <div>
              <h2>{isEdit ? 'Edit Inhand Entry' : 'New Inhand Entry'}</h2>
              {isEdit && <span className="ih-ref-badge">{existingEntry.reference_no}</span>}
            </div>
          </div>
          <button className="ih-close-btn" onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`ih-message ih-message-${message.type}`}>
            <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationCircle} />
            {message.text}
          </div>
        )}

        {loadingData ? (
          <div className="ih-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
        ) : (
          <form className="ih-form" onSubmit={handleSubmit}>

            {/* Payment Type Selector */}
            <div className="ih-payment-type-row">
              {['Cash In', 'Cheque In'].map(pt => (
                <button
                  key={pt}
                  type="button"
                  className={`ih-type-btn ${formData.payment_type === pt ? 'active' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, payment_type: pt }))}
                >
                  <FontAwesomeIcon icon={pt === 'Cash In' ? faMoneyBillWave : faUniversity} />
                  {pt}
                </button>
              ))}
            </div>

            {/* Row: Date + Amount */}
            <div className="ih-form-row">
              <div className="ih-form-group">
                <label>Transaction Date <span className="required">*</span></label>
                <input
                  type="date" name="transaction_date"
                  value={formData.transaction_date} onChange={handleChange} required
                />
              </div>
              <div className="ih-form-group">
                <label>Amount (Rs.) <span className="required">*</span></label>
                <input
                  type="number" name="amount" min="0.01" step="0.01"
                  value={formData.amount} onChange={handleChange}
                  placeholder="0.00" required
                />
              </div>
            </div>

            {/* ── Cash In fields ── */}
            {formData.payment_type === 'Cash In' && (
              <>
                <div className="ih-form-group">
                  <label>Company (Cash Account) <span className="required">*</span></label>
                  <select name="company_id" value={formData.company_id} onChange={handleChange} required>
                    <option value="">Select company</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {cashBalance !== null && (
                  <div className="ih-balance-chip">
                    Current Cash Balance: <strong>Rs. {parseFloat(cashBalance).toFixed(2)}</strong>
                  </div>
                )}
              </>
            )}

            {/* ── Cheque In fields ── */}
            {formData.payment_type === 'Cheque In' && (
              <>
                <div className="ih-form-group">
                  <label>Bank Account <span className="required">*</span></label>
                  <select name="bank_id" value={formData.bank_id} onChange={handleChange} required>
                    <option value="">Select bank account</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedBank && (
                  <div className="ih-balance-chip">
                    {selectedBank.bank_name} Balance: <strong>Rs. {parseFloat(selectedBank.current_balance || 0).toFixed(2)}</strong>
                  </div>
                )}
                <div className="ih-form-row">
                  <div className="ih-form-group">
                    <label>Cheque Number <span className="required">*</span></label>
                    <input
                      type="text" name="cheque_number"
                      value={formData.cheque_number} onChange={handleChange}
                      placeholder="e.g. 001234" required
                    />
                  </div>
                  <div className="ih-form-group">
                    <label>Cheque Date <span className="required">*</span></label>
                    <input
                      type="date" name="cheque_date"
                      value={formData.cheque_date} onChange={handleChange} required
                    />
                  </div>
                </div>
                <div className="ih-form-group">
                  <label>Cheque Bank Name</label>
                  <input
                    type="text" name="bank_name"
                    value={formData.bank_name} onChange={handleChange}
                    placeholder="Name of the issuing bank"
                  />
                  <small className="ih-hint">Auto-filled from account selection, editable if different</small>
                </div>
              </>
            )}

            {/* Party Name + Remark */}
            <div className="ih-form-group">
              <label>Party Name (Payer)</label>
              <input
                type="text" name="party_name"
                value={formData.party_name} onChange={handleChange}
                placeholder="e.g. Customer name, donor, etc."
              />
            </div>
            <div className="ih-form-group">
              <label>Remark</label>
              <textarea
                name="remark" rows={2}
                value={formData.remark} onChange={handleChange}
                placeholder="Optional notes..."
              />
            </div>

            {/* Submit */}
            <div className="ih-form-footer">
              <button className="ih-cancel-btn" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button className="ih-submit-btn" type="submit" disabled={submitting}>
                {submitting
                  ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                  : isEdit ? 'Update Entry' : 'Save as Draft'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default InhandEntryForm;
