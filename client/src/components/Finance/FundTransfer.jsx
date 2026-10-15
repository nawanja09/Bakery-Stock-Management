// src/components/Finance/FundTransfer.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRightLeft,
  faSpinner,
  faCheckCircle,
  faArrowRight,
  faUniversity,
  faCashRegister,
  faExclamationTriangle,
  faInfoCircle,
  faMoneyBillTransfer
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FundTransfer.css';

// ─── Direction options ────────────────────────────────────────────────────────
const DIRECTIONS = [
  { value: 'CASH_TO_BANK', label: 'Cash → Bank', from: 'CASH', to: 'BANK' },
  { value: 'BANK_TO_CASH', label: 'Bank → Cash', from: 'BANK', to: 'CASH' }
];

// ─── Formatter ────────────────────────────────────────────────────────────────
const fmt = (v) =>
  parseFloat(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const FundTransfer = () => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

  // ── State ──────────────────────────────────────────────────────────────────
  const [companies, setCompanies]           = useState([]);
  const [bankAccounts, setBankAccounts]     = useState([]);
  const [loadingBanks, setLoadingBanks]     = useState(false);
  const [bankLoadError, setBankLoadError]   = useState(false);
  const [cashBalance, setCashBalance]       = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [message, setMessage]               = useState(null);

  const [formData, setFormData] = useState({
    company_id: '',
    direction: 'CASH_TO_BANK',     // CASH_TO_BANK | BANK_TO_CASH
    bank_id:   '',
    date:          new Date().toISOString().slice(0, 10),
    amount:        '',
    cheque_number: '',
    remark:        ''
  });

  const selectedDirection = DIRECTIONS.find(d => d.value === formData.direction);
  const selectedBank      = bankAccounts.find(b => String(b.id) === String(formData.bank_id));

  // ── Fetch companies on mount ───────────────────────────────────────────────
  useEffect(() => {
    api.get('/purchases/companies')
      .then(res => {
        const list = res.data || [];
        setCompanies(list);
        if (list.length > 0)
          setFormData(prev => ({ ...prev, company_id: String(list[0].id) }));
      })
      .catch(() => setCompanies([]));
  }, []);

  // ── Fetch bank accounts + cash balance when company changes ───────────────
  const loadAccountData = useCallback(() => {
    if (!formData.company_id) { setBankAccounts([]); setCashBalance(null); return; }
    let cancelled = false;

    setLoadingBanks(true);
    setBankLoadError(false);
    setBankAccounts([]);
    setFormData(prev => ({ ...prev, bank_id: '' }));
    api.get('/finance/bank/accounts', { params: { companyId: formData.company_id } })
      .then(res => {
        if (cancelled) return;
        const list = res.data || [];
        setBankAccounts(list);
        setFormData(prev => ({
          ...prev,
          bank_id: list.length > 0 ? String(list[0].id) : ''
        }));
      })
      .catch(() => { if (!cancelled) { setBankAccounts([]); setBankLoadError(true); } })
      .finally(() => { if (!cancelled) setLoadingBanks(false); });

    api.get(`/finance/cash/balance/${formData.company_id}`)
      .then(res => { if (!cancelled) setCashBalance(res.data?.balance ?? 0); })
      .catch(() => { if (!cancelled) setCashBalance(null); });

    return () => { cancelled = true; };
  }, [formData.company_id]);

  useEffect(loadAccountData, [loadAccountData]);

  // ── Generic field change ───────────────────────────────────────────────────
  const handleChange = e => {
    const { name, value } = e.target;
    setMessage(null);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    if (!formData.company_id)  return setMessage({ type: 'error', text: 'Please select a company.' });
    if (!formData.bank_id)     return setMessage({ type: 'error', text: 'Please select a bank account.' });
    if (!formData.date)        return setMessage({ type: 'error', text: 'Date is required.' });

    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0)      return setMessage({ type: 'error', text: 'Amount must be greater than 0.' });
    if (!currentUser?.id)      return setMessage({ type: 'error', text: 'Session expired — please log in again.' });

    // Client-side balance pre-check (server enforces this too, but gives
    // faster UX feedback). Cheque transfers now deduct the Bank Ledger
    // immediately on the Transfer Date (same as a non-cheque transfer), so
    // the balance check applies to both.
    const isCheque = formData.direction === 'BANK_TO_CASH' && !!formData.cheque_number?.trim();

    if (formData.direction === 'CASH_TO_BANK' && cashBalance !== null && amt > cashBalance) {
      return setMessage({
        type: 'error',
        text: `Insufficient cash balance. Available: Rs. ${fmt(cashBalance)}`
      });
    }
    if (formData.direction === 'BANK_TO_CASH' && selectedBank && amt > parseFloat(selectedBank.current_balance || 0)) {
      return setMessage({
        type: 'error',
        text: `Insufficient bank balance. Available: Rs. ${fmt(selectedBank.current_balance)}`
      });
    }

    setSubmitting(true);
    try {
      const res = await api.post('/finance/transfer', {
        company_id:   formData.company_id,
        from_account: selectedDirection.from,
        to_account:   selectedDirection.to,
        bank_id:      formData.bank_id,
        amount:       amt,
        date:         formData.date,
        remark:       formData.remark || null,
        cheque_number: formData.direction === 'BANK_TO_CASH' ? formData.cheque_number.trim() : null
      });

      setMessage({
        type: 'success',
        text: res.data?.message || (isCheque
          ? 'Cheque transfer recorded! Bank balance deducted today; Cash balance will update once the cheque is Released.'
          : 'Transfer completed successfully!')
      });

      // Optimistically update displayed balances from whatever the server
      // returned. Bank balance is always returned now (cheque transfers
      // deduct the Bank Ledger immediately); Cash balance only comes back
      // for non-cheque transfers, since a cheque's Cash leg isn't posted
      // until it's Released.
      if (res.data?.cash_balance !== null && res.data?.cash_balance !== undefined) setCashBalance(res.data.cash_balance);
      if (res.data?.bank_balance !== null && res.data?.bank_balance !== undefined) {
        setBankAccounts(prev =>
          prev.map(b =>
            String(b.id) === String(formData.bank_id)
              ? { ...b, current_balance: res.data.bank_balance }
              : b
          )
        );
      }

      setFormData(prev => ({ ...prev, amount: '', cheque_number: '', remark: '' }));
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || 'Transfer failed. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived values for the flow diagram ───────────────────────────────────
  const cashBal  = cashBalance !== null ? fmt(cashBalance) : '—';
  const bankBal  = selectedBank ? fmt(selectedBank.current_balance) : '—';
  const bankLabel = selectedBank
    ? `${selectedBank.bank_name}${selectedBank.account_number ? ` (${selectedBank.account_number})` : ''}`
    : 'Bank Account';

  const isCashToBank = formData.direction === 'CASH_TO_BANK';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-container erp-fund-transfer-page">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '20px' }}>
            <FontAwesomeIcon icon={faMoneyBillTransfer} />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>Cash / Bank Transfer</h2>
          </div>
        </div>
      </header>

      <div className="ft-layout">
        {/* ═══════════════════ LEFT — Form ═══════════════════ */}
        <div className="ft-form-card">

          {/* Company selector */}
          <div className="ft-section">
            <label className="ft-label">Company <span className="ft-required">*</span></label>
            <select
              name="company_id"
              className="ft-select"
              value={formData.company_id}
              onChange={handleChange}
              required
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Transfer Direction toggle */}
          <div className="ft-section">
            <label className="ft-label">Transfer Direction <span className="ft-required">*</span></label>
            <div className="ft-direction-toggle">
              {DIRECTIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  className={`ft-direction-btn ${formData.direction === d.value ? 'active' : ''}`}
                  onClick={() => { setMessage(null); setFormData(prev => ({ ...prev, direction: d.value })); }}
                >
                  <FontAwesomeIcon
                    icon={d.value === 'CASH_TO_BANK' ? faCashRegister : faUniversity}
                    className="ft-dir-icon"
                  />
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Context-aware account fields */}
          <div className="ft-section ft-accounts-row">
            {isCashToBank ? (
              <>
                {/* From: Cash */}
                <div className="ft-account-box ft-account-from">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faCashRegister} />
                    <span>Cash Account (From)</span>
                  </div>
                  <div className="ft-account-badge">Company Cash In Hand</div>
                  <div className="ft-account-balance">
                    Balance: <strong>Rs. {cashBal}</strong>
                  </div>
                </div>

                <div className="ft-flow-arrow">
                  <FontAwesomeIcon icon={faArrowRight} />
                </div>

                {/* To: Bank */}
                <div className="ft-account-box ft-account-to">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faUniversity} />
                    <span>Bank Account (To)</span>
                  </div>
                  <select
                    name="bank_id"
                    className="ft-select ft-select-inline"
                    value={formData.bank_id}
                    onChange={handleChange}
                    disabled={loadingBanks}
                    required
                  >
                    <option value="">{loadingBanks ? 'Loading…' : bankLoadError ? 'Unable to load bank accounts' : bankAccounts.length === 0 ? 'No active bank accounts available' : 'Select bank account'}</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBank && (
                    <div className="ft-account-balance">
                      Balance: <strong>Rs. {bankBal}</strong>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* From: Bank */}
                <div className="ft-account-box ft-account-from">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faUniversity} />
                    <span>Bank Account (From)</span>
                  </div>
                  <select
                    name="bank_id"
                    className="ft-select ft-select-inline"
                    value={formData.bank_id}
                    onChange={handleChange}
                    disabled={loadingBanks}
                    required
                  >
                    <option value="">{loadingBanks ? 'Loading…' : bankLoadError ? 'Unable to load bank accounts' : bankAccounts.length === 0 ? 'No active bank accounts available' : 'Select bank account'}</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBank && (
                    <div className="ft-account-balance">
                      Balance: <strong>Rs. {bankBal}</strong>
                    </div>
                  )}
                </div>

                <div className="ft-flow-arrow">
                  <FontAwesomeIcon icon={faArrowRight} />
                </div>

                {/* To: Cash */}
                <div className="ft-account-box ft-account-to">
                  <div className="ft-account-header">
                    <FontAwesomeIcon icon={faCashRegister} />
                    <span>Cash Account (To)</span>
                  </div>
                  <div className="ft-account-badge">Company Cash In Hand</div>
                  <div className="ft-account-balance">
                    Balance: <strong>Rs. {cashBal}</strong>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Date + Amount row */}
          <div className="ft-section ft-row-2">
            <div>
              <label className="ft-label">Date <span className="ft-required">*</span></label>
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
              <label className="ft-label">Amount (Rs.) <span className="ft-required">*</span></label>
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

          {/* Cheque Number (Bank to Cash only) */}
          {formData.direction === 'BANK_TO_CASH' && (
            <div className="ft-section">
              <label className="ft-label">
                Cheque Number <span className="ft-hint" style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>(will be registered in Expenses Cheque Registry)</span>
              </label>
              <input
                type="text"
                name="cheque_number"
                className="ft-input"
                value={formData.cheque_number}
                onChange={handleChange}
                placeholder="Enter cheque number (e.g. 0065)"
              />
              {formData.cheque_number?.trim() && (
                <div style={{ fontSize: '12px', color: '#b45309', marginTop: '6px', fontWeight: 500 }}>
                  ℹ️ The Bank Ledger is deducted today, on this Transfer Date. The cheque stays Pending in the Expenses Cheque Registry, and the Cash Ledger is only credited once it's Released.
                </div>
              )}
            </div>
          )}

          {/* Remark */}
          <div className="ft-section">
            <label className="ft-label">Remark</label>
            <textarea
              name="remark"
              className="ft-textarea"
              rows={2}
              value={formData.remark}
              onChange={handleChange}
              placeholder="Add a note (optional)…"
            />
          </div>

          {/* Message banner */}
          {message && (
            <div className={`ft-message ft-message-${message.type}`}>
              <FontAwesomeIcon
                icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle}
              />
              <span>{message.text}</span>
            </div>
          )}

          {/* Submit */}
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <><FontAwesomeIcon icon={faSpinner} spin /> Processing…</>
              ) : (
                <><FontAwesomeIcon icon={faRightLeft} /> Confirm Transfer</>
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════ RIGHT — Summary panel ═══════════════════ */}
        <aside className="ft-summary-panel">
          <div className="ft-summary-header">
            <FontAwesomeIcon icon={faInfoCircle} />
            <span>Transaction Summary</span>
          </div>

          <div className="ft-summary-body">
            {/* Direction info */}
            <div className="ft-summary-row">
              <span className="ft-summary-lbl">Direction</span>
              <span className="ft-summary-val">
                {isCashToBank ? 'Cash → Bank' : 'Bank → Cash'}
              </span>
            </div>

            {/* Source account */}
            <div className="ft-summary-row">
              <span className="ft-summary-lbl">{isCashToBank ? 'From (Cash)' : `From (Bank)`}</span>
              <span className="ft-summary-val">
                {isCashToBank ? `Rs. ${cashBal}` : bankLabel}
              </span>
            </div>

            {/* Dest account */}
            <div className="ft-summary-row">
              <span className="ft-summary-lbl">{isCashToBank ? 'To (Bank)' : 'To (Cash)'}</span>
              <span className="ft-summary-val">
                {isCashToBank ? bankLabel : `Rs. ${cashBal}`}
              </span>
            </div>

            {/* Amount */}
            {formData.amount && parseFloat(formData.amount) > 0 && (
              <div className="ft-summary-row ft-summary-amount">
                <span className="ft-summary-lbl">Transfer Amount</span>
                <span className="ft-summary-val-big">Rs. {fmt(formData.amount)}</span>
              </div>
            )}

            {!isCashToBank && formData.cheque_number && (
              <div className="ft-summary-row">
                <span className="ft-summary-lbl">Cheque #</span>
                <span className="ft-summary-val font-mono">{formData.cheque_number}</span>
              </div>
            )}

            <div className="ft-summary-divider" />

            {/* Ledger effect explainer */}
            <div className="ft-ledger-info">
              <div className="ft-ledger-title">Ledger Postings</div>
              {isCashToBank ? (
                <>
                  <div className="ft-ledger-row">
                    <span className="ft-ledger-account">Cash Ledger</span>
                    <span className="ft-ledger-credit">Credit (OUT)</span>
                  </div>
                  <div className="ft-ledger-row">
                    <span className="ft-ledger-account">Bank Ledger</span>
                    <span className="ft-ledger-debit">Debit (IN)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="ft-ledger-row">
                    <span className="ft-ledger-account">Bank Ledger</span>
                    <span className="ft-ledger-credit">Credit (OUT)</span>
                  </div>
                  <div className="ft-ledger-row">
                    <span className="ft-ledger-account">Cash Ledger</span>
                    <span className="ft-ledger-debit">Debit (IN)</span>
                  </div>
                </>
              )}
            </div>

            <div className="ft-summary-note">
              <FontAwesomeIcon icon={faInfoCircle} />
              Both ledger entries are saved in the same transaction to keep balances synchronized.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default FundTransfer;