// src/components/Finance/BankTransfer.jsx
// Bank-to-Bank Transfer — moves funds between two company bank accounts.
// Uses a single atomic DB transaction so total company bank balance is preserved.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRightArrowLeft,
  faSpinner,
  faCheckCircle,
  faArrowRight,
  faUniversity,
  faExclamationTriangle,
  faInfoCircle,
  faMoneyBillTransfer
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FundTransfer.css';

const fmt = (v) =>
  parseFloat(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const BankTransfer = () => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState({
    from_bank_id: '',
    to_bank_id: '',
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    reference_number: '',
    remark: ''
  });

  // Load all active bank accounts once on mount
  useEffect(() => {
    setLoadingBanks(true);
    api.get('/finance/bank/accounts/all')
      .then(res => {
        const list = res.data || [];
        setBankAccounts(list);
        if (list.length >= 2) {
          setFormData(prev => ({
            ...prev,
            from_bank_id: String(list[0].id),
            to_bank_id: String(list[1].id)
          }));
        } else if (list.length === 1) {
          setFormData(prev => ({ ...prev, from_bank_id: String(list[0].id) }));
        }
      })
      .catch(() => setBankAccounts([]))
      .finally(() => setLoadingBanks(false));
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setMessage(null);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    if (!formData.from_bank_id) return setMessage({ type: 'error', text: 'Please select a From bank account.' });
    if (!formData.to_bank_id)   return setMessage({ type: 'error', text: 'Please select a To bank account.' });
    if (formData.from_bank_id === formData.to_bank_id)
      return setMessage({ type: 'error', text: 'From and To bank accounts must be different.' });
    if (!formData.date)         return setMessage({ type: 'error', text: 'Transfer date is required.' });
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0)       return setMessage({ type: 'error', text: 'Transfer amount must be greater than 0.' });
    if (!currentUser?.id)       return setMessage({ type: 'error', text: 'Session expired — please log in again.' });

    // Client-side balance pre-check
    const fromBank = bankAccounts.find(b => String(b.id) === String(formData.from_bank_id));
    if (fromBank && amt > parseFloat(fromBank.current_balance || 0)) {
      return setMessage({
        type: 'error',
        text: `Insufficient balance in ${fromBank.bank_name}. Available: Rs. ${fmt(fromBank.current_balance)}`
      });
    }

    setSubmitting(true);
    try {
      const res = await api.post('/finance/bank/transfer', {
        from_bank_id: formData.from_bank_id,
        to_bank_id:   formData.to_bank_id,
        amount:        amt,
        date:          formData.date,
        reference_number: formData.reference_number || null,
        remark:        formData.remark || null,
        created_by:    currentUser.id
      });

      setMessage({ type: 'success', text: 'Bank-to-Bank transfer completed successfully!' });

      // Update local balances optimistically
      if (res.data?.from_balance !== undefined || res.data?.to_balance !== undefined) {
        setBankAccounts(prev => prev.map(b => {
          if (String(b.id) === String(formData.from_bank_id)) return { ...b, current_balance: res.data.from_balance };
          if (String(b.id) === String(formData.to_bank_id))   return { ...b, current_balance: res.data.to_balance };
          return b;
        }));
      }

      setFormData(prev => ({ ...prev, amount: '', reference_number: '', remark: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Transfer failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const fromBank = bankAccounts.find(b => String(b.id) === String(formData.from_bank_id));
  const toBank   = bankAccounts.find(b => String(b.id) === String(formData.to_bank_id));

  const fromLabel = fromBank
    ? `${fromBank.bank_name}${fromBank.account_number ? ` (${fromBank.account_number})` : ''}`
    : 'From Bank';
  const toLabel = toBank
    ? `${toBank.bank_name}${toBank.account_number ? ` (${toBank.account_number})` : ''}`
    : 'To Bank';

  return (
    <div className="ft-page">
      {/* Header */}
      <div className="ft-page-header">
        <div className="ft-page-header-icon">
          <FontAwesomeIcon icon={faMoneyBillTransfer} />
        </div>
        <div>
          <h1 className="ft-page-title">Bank to Bank Transfer</h1>
          <p className="ft-page-subtitle">Transfer funds between two company bank accounts</p>
        </div>
      </div>

      <div className="ft-layout">
        {/* LEFT — Form */}
        <div className="ft-form-card">

          {loadingBanks ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              <FontAwesomeIcon icon={faSpinner} spin /> Loading bank accounts…
            </div>
          ) : bankAccounts.length < 2 ? (
            <div className="ft-message ft-message-error">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>At least two active bank accounts are required for a bank-to-bank transfer.</span>
            </div>
          ) : (
            <>
              {/* From / To bank row */}
              <div className="ft-section ft-accounts-row">
                {/* From Bank */}
                <div className="ft-account-box ft-account-from">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faUniversity} />
                    <span>From Bank Account <span className="ft-required">*</span></span>
                  </div>
                  <select
                    name="from_bank_id"
                    className="ft-select ft-select-inline"
                    value={formData.from_bank_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select bank account</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}{b.company ? ` (${b.company})` : ''}
                      </option>
                    ))}
                  </select>
                  {fromBank && (
                    <div className="ft-account-balance">
                      Balance: <strong>Rs. {fmt(fromBank.current_balance)}</strong>
                    </div>
                  )}
                </div>

                <div className="ft-flow-arrow">
                  <FontAwesomeIcon icon={faArrowRight} />
                </div>

                {/* To Bank */}
                <div className="ft-account-box ft-account-to">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faUniversity} />
                    <span>To Bank Account <span className="ft-required">*</span></span>
                  </div>
                  <select
                    name="to_bank_id"
                    className="ft-select ft-select-inline"
                    value={formData.to_bank_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select bank account</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}{b.company ? ` (${b.company})` : ''}
                      </option>
                    ))}
                  </select>
                  {toBank && (
                    <div className="ft-account-balance">
                      Balance: <strong>Rs. {fmt(toBank.current_balance)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Same-bank warning */}
              {formData.from_bank_id && formData.to_bank_id && formData.from_bank_id === formData.to_bank_id && (
                <div className="ft-message ft-message-error">
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <span>From and To bank accounts must be different.</span>
                </div>
              )}

              {/* Date + Amount */}
              <div className="ft-section ft-row-2">
                <div>
                  <label className="ft-label">Transfer Date <span className="ft-required">*</span></label>
                  <input
                    type="date"
                    name="date"
                    className="ft-input"
                    value={formData.date}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label className="ft-label">Transfer Amount (Rs.) <span className="ft-required">*</span></label>
                  <input
                    type="number"
                    name="amount"
                    className="ft-input"
                    min="0.01"
                    step="0.01"
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              {/* Reference + Remark */}
              <div className="ft-section">
                <label className="ft-label">Reference / Transaction No</label>
                <input
                  type="text"
                  name="reference_number"
                  className="ft-input"
                  value={formData.reference_number}
                  onChange={handleChange}
                  placeholder="e.g. B2B-00001 (optional)"
                />
              </div>

              <div className="ft-section">
                <label className="ft-label">Description / Remarks</label>
                <textarea
                  name="remark"
                  className="ft-textarea"
                  rows={2}
                  value={formData.remark}
                  onChange={handleChange}
                  placeholder="e.g. Transfer between company bank accounts (optional)"
                />
              </div>

              {/* Message */}
              {message && (
                <div className={`ft-message ft-message-${message.type}`}>
                  <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle} />
                  <span>{message.text}</span>
                </div>
              )}

              {/* Submit */}
              <button
                className="ft-submit-btn"
                type="button"
                disabled={submitting || formData.from_bank_id === formData.to_bank_id}
                onClick={handleSubmit}
              >
                {submitting
                  ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing…</>
                  : <><FontAwesomeIcon icon={faArrowRightArrowLeft} /> Confirm Transfer</>}
              </button>
            </>
          )}
        </div>

        {/* RIGHT — Summary panel */}
        <aside className="ft-summary-panel">
          <div className="ft-summary-header">
            <FontAwesomeIcon icon={faInfoCircle} />
            <span>Transaction Summary</span>
          </div>

          <div className="ft-summary-body">
            <div className="ft-summary-row">
              <span className="ft-summary-lbl">From Bank</span>
              <span className="ft-summary-val">{fromLabel}</span>
            </div>
            <div className="ft-summary-row">
              <span className="ft-summary-lbl">To Bank</span>
              <span className="ft-summary-val">{toLabel}</span>
            </div>

            {fromBank && (
              <div className="ft-summary-row">
                <span className="ft-summary-lbl">From Balance</span>
                <span className="ft-summary-val">Rs. {fmt(fromBank.current_balance)}</span>
              </div>
            )}
            {toBank && (
              <div className="ft-summary-row">
                <span className="ft-summary-lbl">To Balance</span>
                <span className="ft-summary-val">Rs. {fmt(toBank.current_balance)}</span>
              </div>
            )}

            {formData.amount && parseFloat(formData.amount) > 0 && (
              <div className="ft-summary-row ft-summary-amount">
                <span className="ft-summary-lbl">Transfer Amount</span>
                <span className="ft-summary-val-big">Rs. {fmt(formData.amount)}</span>
              </div>
            )}

            <div className="ft-summary-divider" />

            <div className="ft-ledger-info">
              <div className="ft-ledger-title">Ledger Postings</div>
              <div className="ft-ledger-row">
                <span className="ft-ledger-account">{fromLabel}</span>
                <span className="ft-ledger-credit">Credit (OUT)</span>
              </div>
              <div className="ft-ledger-row">
                <span className="ft-ledger-account">{toLabel}</span>
                <span className="ft-ledger-debit">Debit (IN)</span>
              </div>
            </div>

            <div className="ft-summary-note">
              <FontAwesomeIcon icon={faInfoCircle} />
              Both ledger entries are recorded as <strong>Bank Transfer</strong> — not as income or expense. Total company bank balance remains unchanged.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BankTransfer;
