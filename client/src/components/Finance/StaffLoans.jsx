// src/components/Finance/StaffLoans.jsx
//
// Finance -> Staff Loans.
// * Employees are loaded from the existing Employee Management records (active
//   employees only) through /staff-loans/form-options - nothing is duplicated.
// * The database is the only source of truth: every balance, status and
//   repayment shown here is read back from the API after each change.
// * Receive Cash posts the repayment AND the matching Cash Book entry in one
//   backend transaction (see server/controllers/staffLoanController.js).
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHandHoldingDollar, faSpinner, faCheck, faHistory, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import { usePopup } from '../context/PopupContext';
import './FinanceForm.css';
import './StaffLoans.css';

const WRITE_ROLES = ['Admin', 'Super Admin', 'Accountant'];

const getStoredUserRole = () => {
  try {
    const storedUser = localStorage.getItem('user');
    const role = storedUser ? JSON.parse(storedUser).role : null;
    return role === 'QB' ? 'View Only' : role;
  } catch (e) {
    return null;
  }
};

// Local (not UTC) calendar date, so the default is correct early in the morning in Sri Lanka.
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

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' without going through Date (no timezone shifts).
const fmtDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

const isRealDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

// Mirrors the backend rule (utils/staffLoanUtils.js parsePositiveMoney): positive,
// at most 2 decimal places. Returns { cents } or { error }.
const parseMoney = (raw, label) => {
  const text = String(raw ?? '').trim();
  if (!text) return { error: `${label} is required` };
  if (text.startsWith('-')) return { error: `${label} must be greater than zero` };
  if (!/^(\d*)(\.\d*)?$/.test(text) || text === '.') return { error: `${label} must be a valid number` };

  const [integerPart, fractionPart = ''] = text.split('.');
  if (fractionPart.length > 2) return { error: `${label} can have at most 2 decimal places` };
  if (integerPart.replace(/^0+(?=\d)/, '').length > 12) return { error: `${label} is too large` };

  const cents = Number(integerPart || '0') * 100 + Number(fractionPart.padEnd(2, '0'));
  if (cents <= 0) return { error: `${label} must be greater than zero` };
  return { cents };
};

const emptyForm = (companies = []) => ({
  employee_id: '',
  company_id: companies.length === 1 ? String(companies[0].id) : '',
  loan_amount: '',
  issued_date: todayLocal(),
  cheque_details: ''
});

const StaffLoans = () => {
  const { showPopup } = usePopup();
  const canWrite = WRITE_ROLES.includes(getStoredUserRole());

  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [options, setOptions] = useState({ employees: [], companies: [] });

  // Create Staff Loan form
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  // Receive Cash modal
  const [receiveLoan, setReceiveLoan] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ amount: '', date: '' });
  const [receiveError, setReceiveError] = useState('');
  const [receiving, setReceiving] = useState(false);

  // Repayment history modal
  const [historyLoan, setHistoryLoan] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Escape, focus, Tab trap and scroll lock for both popups (handlers are declared below).
  const receiveDialogRef = useRef(null);
  const historyDialogRef = useRef(null);
  useDialog(receiveDialogRef, { open: Boolean(receiveLoan), onClose: () => closeReceiveModal() });
  useDialog(historyDialogRef, { open: Boolean(historyLoan), onClose: () => setHistoryLoan(null) });

  const fetchLoans = useCallback(async () => {
    try {
      const response = await api.get('/staff-loans');
      setLoans(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load staff loans');
    } finally {
      setLoadingLoans(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    if (!canWrite) return;
    api.get('/staff-loans/form-options')
      .then((response) => {
        const data = response.data || {};
        const nextOptions = {
          employees: Array.isArray(data.employees) ? data.employees : [],
          companies: Array.isArray(data.companies) ? data.companies : []
        };
        setOptions(nextOptions);
        setForm((prev) => (
          prev.company_id || nextOptions.companies.length !== 1
            ? prev
            : { ...prev, company_id: String(nextOptions.companies[0].id) }
        ));
      })
      .catch((error) => {
        showPopup('error', error.response?.data?.error || 'Failed to load employees');
      });
  }, [canWrite, showPopup]);

  // ─── Create Staff Loan ────────────────────────────────────────────────────
  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.employee_id) errors.employee_id = 'Please select an employee';
    if (!form.company_id) errors.company_id = 'Please select a company';

    const amount = parseMoney(form.loan_amount, 'Loan Amount');
    if (amount.error) errors.loan_amount = amount.error;

    if (!form.issued_date) errors.issued_date = 'Issued Date is required';
    else if (!isRealDate(form.issued_date)) errors.issued_date = 'Please enter a valid date';

    if (form.cheque_details.trim().length > 500) {
      errors.cheque_details = 'Cheque details must be 500 characters or fewer';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateLoan = async (event) => {
    event.preventDefault();
    if (creating || !validateForm()) return;

    setCreating(true);
    try {
      await api.post('/staff-loans', {
        employee_id: Number(form.employee_id),
        company_id: Number(form.company_id),
        loan_amount: form.loan_amount.trim(),
        issued_date: form.issued_date,
        cheque_details: form.cheque_details.trim()
      });
      showPopup('success', 'Staff loan created successfully');
      // Keep the chosen company (one accountant usually works with one company) and clear the rest.
      setForm({ ...emptyForm(options.companies), company_id: form.company_id });
      setFormErrors({});
      await fetchLoans();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to create staff loan');
    } finally {
      setCreating(false);
    }
  };

  // ─── Receive Cash ─────────────────────────────────────────────────────────
  const openReceiveModal = (loan) => {
    setReceiveLoan(loan);
    setReceiveForm({ amount: '', date: todayLocal() });
    setReceiveError('');
  };

  const closeReceiveModal = () => {
    if (receiving) return;
    setReceiveLoan(null);
    setReceiveError('');
  };

  const handleReceiveCash = async (event) => {
    event.preventDefault();
    if (receiving || !receiveLoan) return;

    const amount = parseMoney(receiveForm.amount, 'Amount');
    if (amount.error) return setReceiveError(amount.error);
    if (amount.cents > Math.round(receiveLoan.balance * 100)) {
      return setReceiveError(`Amount cannot exceed the outstanding balance of Rs. ${fmtMoney(receiveLoan.balance)}`);
    }
    if (!receiveForm.date) return setReceiveError('Date is required');
    if (!isRealDate(receiveForm.date)) return setReceiveError('Please enter a valid date');
    if (receiveForm.date < receiveLoan.issued_date) {
      return setReceiveError('Date cannot be earlier than the date the loan was issued');
    }

    setReceiving(true);
    setReceiveError('');
    try {
      const response = await api.post(`/staff-loans/${receiveLoan.id}/repayments`, {
        amount: receiveForm.amount.trim(),
        received_date: receiveForm.date
      });
      const updated = response.data?.loan;
      const settledNote = updated?.status === 'Settled' ? ' The loan is now fully settled.' : '';
      showPopup(
        'success',
        `Received Rs. ${fmtMoney(amount.cents / 100)} from ${receiveLoan.employee_name}. Loan balance is now Rs. ${fmtMoney(updated?.balance)}.${settledNote}`
      );
      setReceiveLoan(null);
      await fetchLoans();
    } catch (error) {
      setReceiveError(error.response?.data?.error || 'Failed to receive cash');
      // The loan may have changed since this page loaded (e.g. settled by another user).
      fetchLoans();
    } finally {
      setReceiving(false);
    }
  };

  // ─── Repayment history ────────────────────────────────────────────────────
  const openHistory = async (loan) => {
    setHistoryLoan(loan);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const response = await api.get(`/staff-loans/${loan.id}/repayments`);
      setHistory(response.data?.repayments || []);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load repayment history');
      setHistoryLoan(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="page-container sl-page">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faHandHoldingDollar} style={{ marginRight: '8px' }} /> Staff Loans
          </h2>
        </div>
      </header>

      {/* ════════════ Create Staff Loan ════════════ */}
      {canWrite && (
        <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
          <h3 className="sl-section-title">Create Staff Loan</h3>
          <form onSubmit={handleCreateLoan} noValidate>
            <div className="form-grid two-col">
              <div className="form-group">
                <label htmlFor="sl-employee">Employee Name <span className="required">*</span></label>
                <select id="sl-employee" name="employee_id" value={form.employee_id} onChange={handleFormChange} className="form-select">
                  <option value="">Select Employee</option>
                  {options.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_name}{employee.employee_code ? ` (${employee.employee_code})` : ''}
                    </option>
                  ))}
                </select>
                {formErrors.employee_id && <span className="form-error">{formErrors.employee_id}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="sl-company">Company <span className="required">*</span></label>
                <select id="sl-company" name="company_id" value={form.company_id} onChange={handleFormChange} className="form-select">
                  <option value="">Select Company</option>
                  {options.companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                {formErrors.company_id
                  ? <span className="form-error">{formErrors.company_id}</span>
                  : <span className="form-helper">Repayments are received into this company&apos;s Cash Book.</span>}
              </div>
            </div>

            <div className="form-grid two-col" style={{ marginTop: 'var(--spacing-lg)' }}>
              <div className="form-group">
                <label htmlFor="sl-amount">Loan Amount (Rs.) <span className="required">*</span></label>
                <input
                  id="sl-amount"
                  type="number"
                  name="loan_amount"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.loan_amount}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  className="form-input"
                />
                {formErrors.loan_amount && <span className="form-error">{formErrors.loan_amount}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="sl-issued">Issued Date <span className="required">*</span></label>
                <input
                  id="sl-issued"
                  type="date"
                  name="issued_date"
                  value={form.issued_date}
                  onChange={handleFormChange}
                  className="form-input"
                />
                {formErrors.issued_date && <span className="form-error">{formErrors.issued_date}</span>}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 'var(--spacing-lg)' }}>
              <label htmlFor="sl-cheque">Issued Cheque Details</label>
              <textarea
                id="sl-cheque"
                name="cheque_details"
                rows={2}
                maxLength={500}
                value={form.cheque_details}
                onChange={handleFormChange}
                placeholder="e.g. cheque number, bank and cheque date"
                className="form-textarea"
              />
              {formErrors.cheque_details && <span className="form-error">{formErrors.cheque_details}</span>}
            </div>

            <div className="form-actions" style={{ marginTop: 'var(--spacing-lg)' }}>
              <button className="btn btn-primary" type="submit" disabled={creating}>
                {creating ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : 'Create Loan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ════════════ Current Loans ════════════ */}
      <div className="card sl-loans-card">
        <h3 className="sl-section-title">Current Loans</h3>
        {loadingLoans ? (
          <div className="sl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading staff loans...</div>
        ) : (
          <div className="sl-table-wrap">
            <table className="report-table sl-table">
              <thead>
                <tr>
                  <th>Issue Date</th>
                  <th>Employee Name</th>
                  <th className="sl-num">Loan Amount</th>
                  <th className="sl-num">Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr><td colSpan={5} className="sl-empty">No staff loans found.</td></tr>
                ) : loans.map((loan) => {
                  const settled = loan.status === 'Settled';
                  return (
                    <tr key={loan.id} className={settled ? 'sl-row-settled' : ''}>
                      <td>{fmtDate(loan.issued_date)}</td>
                      <td>{loan.employee_name}</td>
                      <td className="sl-num">{fmtMoney(loan.loan_amount)}</td>
                      <td className="sl-num sl-balance">{fmtMoney(loan.balance)}</td>
                      <td>
                        <div className="sl-actions">
                          {settled ? (
                            <span className="sl-badge sl-badge-settled">Settled</span>
                          ) : canWrite && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => openReceiveModal(loan)}>
                              Receive Cash
                            </button>
                          )}
                          <button
                            type="button"
                            className="sl-icon-btn"
                            onClick={() => openHistory(loan)}
                            title="View repayment history"
                            aria-label={`View repayment history for ${loan.employee_name}`}
                          >
                            <FontAwesomeIcon icon={faHistory} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════ Receive Cash Modal ════════════ */}
      {receiveLoan && (
        // Backdrop is inert: an outside click must not discard the typed amount.
        <div className="sl-modal-overlay">
          <div ref={receiveDialogRef} className="sl-modal" role="dialog" aria-modal="true" aria-labelledby="sl-receive-title">
            <div className="sl-modal-header">
              <h3 id="sl-receive-title">
                <FontAwesomeIcon icon={faHandHoldingDollar} style={{ color: '#059669', marginRight: '8px' }} />
                Receive Cash
              </h3>
              <button type="button" className="sl-modal-close" onClick={closeReceiveModal} aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handleReceiveCash} noValidate>
              <div className="sl-modal-body">
                <div className="sl-summary-card">
                  <div className="sl-summary-row">
                    <span className="sl-summary-lbl">Employee</span>
                    <strong>{receiveLoan.employee_name}</strong>
                  </div>
                  <div className="sl-summary-row">
                    <span className="sl-summary-lbl">Loan Amount</span>
                    <span>Rs. {fmtMoney(receiveLoan.loan_amount)}</span>
                  </div>
                  <div className="sl-summary-row">
                    <span className="sl-summary-lbl">Current Balance</span>
                    <strong className="sl-balance-strong">Rs. {fmtMoney(receiveLoan.balance)}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="sl-receive-amount">Amount (Rs.) <span className="required">*</span></label>
                  <input
                    id="sl-receive-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={receiveForm.amount}
                    onChange={(e) => { setReceiveForm((prev) => ({ ...prev, amount: e.target.value })); setReceiveError(''); }}
                    placeholder="0.00"
                    className="form-input"
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="sl-receive-date">Date <span className="required">*</span></label>
                  <input
                    id="sl-receive-date"
                    type="date"
                    min={receiveLoan.issued_date}
                    value={receiveForm.date}
                    onChange={(e) => { setReceiveForm((prev) => ({ ...prev, date: e.target.value })); setReceiveError(''); }}
                    className="form-input"
                  />
                  <span className="form-helper">The amount is added to the Cash Book on this date.</span>
                </div>

                {receiveError && <div className="sl-modal-error" role="alert">{receiveError}</div>}
              </div>

              <div className="sl-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeReceiveModal} disabled={receiving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={receiving}>
                  {receiving
                    ? <><FontAwesomeIcon icon={faSpinner} spin /> Receiving...</>
                    : <><FontAwesomeIcon icon={faCheck} /> Receive Cash</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════ Repayment History Modal ════════════ */}
      {historyLoan && (
        <div className="sl-modal-overlay" onClick={() => setHistoryLoan(null)}>
          <div ref={historyDialogRef} className="sl-modal sl-modal-wide" role="dialog" aria-modal="true" aria-labelledby="sl-history-title" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-header">
              <h3 id="sl-history-title">
                <FontAwesomeIcon icon={faHistory} style={{ marginRight: '8px' }} />
                Repayment History
              </h3>
              <button type="button" className="sl-modal-close" onClick={() => setHistoryLoan(null)} aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="sl-modal-body">
              <div className="sl-summary-card">
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">Employee</span>
                  <strong>{historyLoan.employee_name}</strong>
                </div>
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">Loan Issued</span>
                  <span>{fmtDate(historyLoan.issued_date)}</span>
                </div>
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">Loan Amount</span>
                  <span>Rs. {fmtMoney(historyLoan.loan_amount)}</span>
                </div>
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">Cheque Details</span>
                  <span className="sl-cheque-text">{historyLoan.cheque_details || '—'}</span>
                </div>
              </div>

              {loadingHistory ? (
                <div className="sl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
              ) : (
                <div className="sl-table-wrap">
                  <table className="report-table sl-table">
                    <thead>
                      <tr>
                        <th>Date Received</th>
                        <th className="sl-num">Amount</th>
                        <th className="sl-num">Balance After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr><td colSpan={3} className="sl-empty">No repayments received yet.</td></tr>
                      ) : history.map((repayment) => (
                        <tr key={repayment.id}>
                          <td>{fmtDate(repayment.received_date)}</td>
                          <td className="sl-num">{fmtMoney(repayment.amount)}</td>
                          <td className="sl-num">{fmtMoney(repayment.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="sl-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setHistoryLoan(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffLoans;
