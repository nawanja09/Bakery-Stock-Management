// src/components/Finance/IntercompanyTransaction.jsx
//
// Finance -> Intercompany Transaction.
// Moves funds between two companies' Cash/Bank accounts (e.g. "JH Bank ->
// RD Cash"). The backend (server/controllers/intercompanyController.js)
// posts one CREDIT leg on the From account and one DEBIT leg on the To
// account inside a single DB transaction, and saves a permanent audit row -
// this is never written to Expenses, so it never appears on the Expense
// Report.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExchangeAlt, faSpinner, faArrowRight, faHistory } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import './FinanceForm.css';
import './IntercompanyTransaction.css';

const WRITE_ROLES = ['Admin', 'Super Admin', 'Accountant'];

// Only these two companies take part in Intercompany Transactions, per spec.
const ALLOWED_COMPANY_NAMES = ['JH', 'RD'];

const getStoredUserRole = () => {
  try {
    const storedUser = localStorage.getItem('user');
    const role = storedUser ? JSON.parse(storedUser).role : null;
    return role === 'QB' ? 'View Only' : role;
  } catch (e) {
    return null;
  }
};

const todayLocal = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const fmtMoney = (value) =>
  (Number.parseFloat(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const fmtDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

const emptyForm = () => ({
  from_company_id: '',
  from_item: 'CASH',
  from_bank_id: '',
  to_company_id: '',
  to_item: 'CASH',
  to_bank_id: '',
  amount: '',
  date: todayLocal(),
  description: ''
});

// One side's bank-account fetch (From or To). Returns the accounts and
// auto-selects the id when there is exactly one - mirrors FundTransfer.jsx.
const useBankAccounts = (companyId, item) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (item !== 'BANK' || !companyId) {
      setAccounts([]);
      setSelectedId('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get('/finance/bank/accounts', { params: { companyId } })
      .then((res) => {
        if (cancelled) return;
        const list = res.data || [];
        setAccounts(list);
        setSelectedId(list.length > 0 ? String(list[0].id) : '');
      })
      .catch(() => { if (!cancelled) { setAccounts([]); setSelectedId(''); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, item]);

  return { accounts, loading, selectedId, setSelectedId };
};

const IntercompanyTransaction = () => {
  const { showPopup } = usePopup();
  const canWrite = WRITE_ROLES.includes(getStoredUserRole());

  const [companies, setCompanies] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fromBank = useBankAccounts(form.from_company_id, form.from_item);
  const toBank = useBankAccounts(form.to_company_id, form.to_item);

  // Keep the form's from_bank_id/to_bank_id in sync with each side's auto-selected account.
  useEffect(() => {
    setForm((prev) => (prev.from_bank_id === fromBank.selectedId ? prev : { ...prev, from_bank_id: fromBank.selectedId }));
  }, [fromBank.selectedId]);
  useEffect(() => {
    setForm((prev) => (prev.to_bank_id === toBank.selectedId ? prev : { ...prev, to_bank_id: toBank.selectedId }));
  }, [toBank.selectedId]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await api.get('/finance/intercompany');
      setHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load intercompany transaction history');
    } finally {
      setLoadingHistory(false);
    }
  }, [showPopup]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    api.get('/companies')
      .then((res) => {
        const list = (res.data || []).filter((c) => ALLOWED_COMPANY_NAMES.includes(String(c.name).toUpperCase()));
        setCompanies(list);
      })
      .catch(() => setCompanies([]));
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errors = {};
    if (!form.from_company_id) errors.from_company_id = 'From Company is required';
    if (!form.to_company_id) errors.to_company_id = 'To Company is required';
    if (form.from_company_id && form.to_company_id && form.from_company_id === form.to_company_id) {
      errors.to_company_id = 'From and To Company must be different';
    }
    if (form.from_item === 'BANK' && !form.from_bank_id) {
      errors.from_bank_id = fromBank.accounts.length === 0
        ? 'The From Company has no active bank account'
        : 'Please select a From Bank Account';
    }
    if (form.to_item === 'BANK' && !form.to_bank_id) {
      errors.to_bank_id = toBank.accounts.length === 0
        ? 'The To Company has no active bank account'
        : 'Please select a To Bank Account';
    }
    const amt = parseFloat(form.amount);
    if (!form.amount || Number.isNaN(amt) || amt <= 0) errors.amount = 'Amount must be greater than 0';
    if (!form.date) errors.date = 'Transaction Date is required';
    if (!form.description.trim()) errors.description = 'Description / Reference is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!currentUser?.id) {
      showPopup('error', 'Session expired — please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/finance/intercompany', {
        from_company_id: Number(form.from_company_id),
        from_account_type: form.from_item,
        from_bank_id: form.from_item === 'BANK' ? Number(form.from_bank_id) : null,
        to_company_id: Number(form.to_company_id),
        to_account_type: form.to_item,
        to_bank_id: form.to_item === 'BANK' ? Number(form.to_bank_id) : null,
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description.trim()
      });
      showPopup('success', 'Intercompany transaction recorded successfully!');
      setForm(emptyForm());
      await fetchHistory();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to record intercompany transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const companyLabel = (id) => companies.find((c) => String(c.id) === String(id))?.name || '';

  return (
    <div className="page-container ict-page">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faExchangeAlt} style={{ marginRight: '8px' }} /> Intercompany Transaction
          </h2>
        </div>
      </header>

      {/* ════════════ Create Intercompany Transaction ════════════ */}
      {canWrite && (
        <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
          <h3 className="ict-section-title">New Intercompany Transaction</h3>
          <form onSubmit={handleSubmit} noValidate>

            <div className="ict-sides">
              {/* From side */}
              <div className="ict-side-card">
                <div className="ict-side-title">From</div>
                <div className="form-group">
                  <label htmlFor="ict-from-company">Company <span className="required">*</span></label>
                  <select
                    id="ict-from-company"
                    name="from_company_id"
                    value={form.from_company_id}
                    onChange={handleChange}
                    className="form-select"
                  >
                    <option value="">Select Company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {formErrors.from_company_id && <span className="form-error">{formErrors.from_company_id}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="ict-from-item">Item <span className="required">*</span></label>
                  <select
                    id="ict-from-item"
                    name="from_item"
                    value={form.from_item}
                    onChange={handleChange}
                    className="form-select"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                  </select>
                </div>

                {form.from_item === 'BANK' && (
                  <div className="form-group">
                    <label htmlFor="ict-from-bank">Bank Account <span className="required">*</span></label>
                    <select
                      id="ict-from-bank"
                      value={form.from_bank_id}
                      onChange={(e) => { setForm((prev) => ({ ...prev, from_bank_id: e.target.value })); if (formErrors.from_bank_id) setFormErrors((prev) => ({ ...prev, from_bank_id: undefined })); }}
                      className="form-select"
                      disabled={fromBank.loading || fromBank.accounts.length === 0}
                    >
                      {fromBank.accounts.length === 0
                        ? <option value="">{fromBank.loading ? 'Loading…' : 'No active bank account'}</option>
                        : fromBank.accounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bank_name}{b.account_number ? ` (${b.account_number})` : ''}
                            </option>
                          ))}
                    </select>
                    {formErrors.from_bank_id && <span className="form-error">{formErrors.from_bank_id}</span>}
                  </div>
                )}
              </div>

              <div className="ict-flow-arrow">
                <FontAwesomeIcon icon={faArrowRight} />
              </div>

              {/* To side */}
              <div className="ict-side-card">
                <div className="ict-side-title">To</div>
                <div className="form-group">
                  <label htmlFor="ict-to-company">Company <span className="required">*</span></label>
                  <select
                    id="ict-to-company"
                    name="to_company_id"
                    value={form.to_company_id}
                    onChange={handleChange}
                    className="form-select"
                  >
                    <option value="">Select Company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {formErrors.to_company_id && <span className="form-error">{formErrors.to_company_id}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="ict-to-item">Item <span className="required">*</span></label>
                  <select
                    id="ict-to-item"
                    name="to_item"
                    value={form.to_item}
                    onChange={handleChange}
                    className="form-select"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                  </select>
                </div>

                {form.to_item === 'BANK' && (
                  <div className="form-group">
                    <label htmlFor="ict-to-bank">Bank Account <span className="required">*</span></label>
                    <select
                      id="ict-to-bank"
                      value={form.to_bank_id}
                      onChange={(e) => { setForm((prev) => ({ ...prev, to_bank_id: e.target.value })); if (formErrors.to_bank_id) setFormErrors((prev) => ({ ...prev, to_bank_id: undefined })); }}
                      className="form-select"
                      disabled={toBank.loading || toBank.accounts.length === 0}
                    >
                      {toBank.accounts.length === 0
                        ? <option value="">{toBank.loading ? 'Loading…' : 'No active bank account'}</option>
                        : toBank.accounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bank_name}{b.account_number ? ` (${b.account_number})` : ''}
                            </option>
                          ))}
                    </select>
                    {formErrors.to_bank_id && <span className="form-error">{formErrors.to_bank_id}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="form-grid two-col" style={{ marginTop: 'var(--spacing-lg)' }}>
              <div className="form-group">
                <label htmlFor="ict-amount">Amount (Rs.) <span className="required">*</span></label>
                <input
                  id="ict-amount"
                  type="number"
                  name="amount"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="form-input"
                />
                {formErrors.amount && <span className="form-error">{formErrors.amount}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="ict-date">Transaction Date <span className="required">*</span></label>
                <input
                  id="ict-date"
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="form-input"
                />
                {formErrors.date && <span className="form-error">{formErrors.date}</span>}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 'var(--spacing-lg)' }}>
              <label htmlFor="ict-description">Description / Reference <span className="required">*</span></label>
              <textarea
                id="ict-description"
                name="description"
                rows={2}
                maxLength={255}
                value={form.description}
                onChange={handleChange}
                placeholder="Reason for this intercompany movement"
                className="form-textarea"
              />
              {formErrors.description && <span className="form-error">{formErrors.description}</span>}
            </div>

            {form.amount && parseFloat(form.amount) > 0 && form.from_company_id && form.to_company_id && (
              <div className="ict-summary">
                <FontAwesomeIcon icon={faExchangeAlt} />
                <span>
                  <strong>{companyLabel(form.from_company_id)} {form.from_item === 'CASH' ? 'Cash' : 'Bank'}</strong>
                  {' → '}
                  <strong>{companyLabel(form.to_company_id)} {form.to_item === 'CASH' ? 'Cash' : 'Bank'}</strong>
                  {' — Rs. '}{fmtMoney(form.amount)}
                </span>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 'var(--spacing-lg)' }}>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : 'Save Intercompany Transaction'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ════════════ History / Audit Trail ════════════ */}
      <div className="card ict-history-card">
        <h3 className="ict-section-title"><FontAwesomeIcon icon={faHistory} style={{ marginRight: '8px' }} />Transaction History</h3>
        {loadingHistory ? (
          <div className="ict-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
        ) : (
          <div className="ict-table-wrap">
            <table className="report-table ict-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="ict-num">Amount</th>
                  <th>Description / Reference</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={6} className="ict-empty">No intercompany transactions found.</td></tr>
                ) : history.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.transaction_date)}</td>
                    <td>
                      <span className="ict-pill">{row.from_company_name}</span> {row.from_account_type === 'CASH' ? 'Cash' : `Bank${row.from_bank_name ? ` (${row.from_bank_name})` : ''}`}
                    </td>
                    <td>
                      <span className="ict-pill">{row.to_company_name}</span> {row.to_account_type === 'CASH' ? 'Cash' : `Bank${row.to_bank_name ? ` (${row.to_bank_name})` : ''}`}
                    </td>
                    <td className="ict-num">{fmtMoney(row.amount)}</td>
                    <td className="ict-desc">{row.description || '—'}</td>
                    <td>{row.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntercompanyTransaction;