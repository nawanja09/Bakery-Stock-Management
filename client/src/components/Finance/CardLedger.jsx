// src/components/Finance/CardLedger.jsx
//
// Finance -> Card Ledger.
//   Pending   - card transactions not yet realised. They have NO effect on any
//               Bank Balance. Tick one or more rows (all from the same Company
//               and Bank Account) and press Realise (below the table).
//   Completed - realised card transactions for the chosen Company + Bank
//               Account: Transaction Date, Realise Date, Reference No, Total
//               Transaction Amount, Realise Amount, Remaining Balance - all read
//               from the saved realisation records.
// Realising lists the selected transactions, shows their read-only Total
// Transaction Amount, and takes ONE Realise Amount for the whole selection
// (> 0 and < the total). The read-only Remaining Balance (total - realise)
// goes to Expenses -> Hidden Expenses as "Visa Card Payment". The totals on
// screen are only a display aid: the server re-sums the selected rows from the
// database, validates the amount and does all the writes in ONE database
// transaction. After every change this page re-reads the API.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faSpinner, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import './FinanceForm.css';
import './CardLedger.css';

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

// Local (not UTC) calendar date, so the default is right early in the morning in Sri Lanka.
const todayLocal = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const fmtMoney = (value) =>
  (Number.parseFloat(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCents = (cents) => fmtMoney(cents / 100);

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' without going through Date (no timezone shifts).
const fmtDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const isRealDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

const toCents = (value) => Math.round((Number.parseFloat(value) || 0) * 100);

// Mirrors the backend rule (utils/staffLoanUtils.js parsePositiveMoney): positive,
// at most 2 decimal places. Returns { cents } or { error }.
const parseMoney = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { error: 'Realise Amount is required' };
  if (text.startsWith('-')) return { error: 'Realise Amount must be greater than zero' };
  if (!/^(\d*)(\.\d*)?$/.test(text) || text === '.') return { error: 'Realise Amount must be a valid number' };
  const [integerPart, fractionPart = ''] = text.split('.');
  if (fractionPart.length > 2) return { error: 'Realise Amount can have at most 2 decimal places' };
  if (integerPart.replace(/^0+(?=\d)/, '').length > 12) return { error: 'Realise Amount is too large' };
  const cents = Number(integerPart || '0') * 100 + Number(fractionPart.padEnd(2, '0'));
  if (cents <= 0) return { error: 'Realise Amount must be greater than zero' };
  return { cents };
};

const bankLabel = (row) => `${row.bank_name || ''}${row.account_number ? `  ${row.account_number}` : ''}`.trim();

const CardLedger = () => {
  const { showPopup } = usePopup();
  const canWrite = WRITE_ROLES.includes(getStoredUserRole());

  const [tab, setTab] = useState('Pending');

  // ---- Pending ----
  const [allBanks, setAllBanks] = useState([]);
  const [pendingFilters, setPendingFilters] = useState({ bankId: '', dateFrom: '', dateTo: '' });
  const [pending, setPending] = useState({ transactions: [], total: 0 });
  const [loadingPending, setLoadingPending] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  // ---- Completed ----
  const [companies, setCompanies] = useState([]);
  const [companyBanks, setCompanyBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [completedFilters, setCompletedFilters] = useState({ companyId: '', bankId: '', dateFrom: '', dateTo: '' });
  const [completed, setCompleted] = useState({ transactions: [], totals: null });
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // ---- Realise modal ----
  const [realiseOpen, setRealiseOpen] = useState(false);
  const [realiseDate, setRealiseDate] = useState('');
  const [realiseAmountText, setRealiseAmountText] = useState(''); // exactly what the user typed
  const [realiseError, setRealiseError] = useState('');
  const [realising, setRealising] = useState(false);

  // ------------------------------------------------------------------ data
  const fetchPending = useCallback(async () => {
    const params = { status: 'Pending' };
    if (pendingFilters.bankId) params.bankId = pendingFilters.bankId;
    if (pendingFilters.dateFrom) params.dateFrom = pendingFilters.dateFrom;
    if (pendingFilters.dateTo) params.dateTo = pendingFilters.dateTo;
    try {
      const res = await api.get('/finance/card-ledger', { params });
      const transactions = res.data?.transactions || [];
      setPending({ transactions, total: res.data?.total || 0 });
      // Never keep a selection for rows that are no longer pending / visible.
      const visible = new Set(transactions.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => visible.has(id)));
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load pending card transactions');
    } finally {
      setLoadingPending(false);
    }
  }, [pendingFilters, showPopup]);

  const fetchCompleted = useCallback(async () => {
    const { companyId, bankId, dateFrom, dateTo } = completedFilters;
    if (!companyId || !bankId) {
      setCompleted({ transactions: [], totals: null });
      return;
    }
    const params = { status: 'Completed', companyId, bankId };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    setLoadingCompleted(true);
    try {
      const res = await api.get('/finance/card-ledger', { params });
      setCompleted({ transactions: res.data?.transactions || [], totals: res.data?.totals || null });
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load completed card transactions');
    } finally {
      setLoadingCompleted(false);
    }
  }, [completedFilters, showPopup]);

  useEffect(() => { setLoadingPending(true); fetchPending(); }, [fetchPending]);
  useEffect(() => { fetchCompleted(); }, [fetchCompleted]);

  useEffect(() => {
    api.get('/finance/bank/accounts/all')
      .then((res) => setAllBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAllBanks([]));
    api.get('/purchases/companies')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCompanies(list);
        if (list.length > 0) setCompletedFilters((prev) => ({ ...prev, companyId: String(list[0].id) }));
      })
      .catch(() => setCompanies([]));
  }, []);

  // Bank Account dropdown (Completed) only offers the selected Company's accounts.
  useEffect(() => {
    const { companyId } = completedFilters;
    if (!companyId) { setCompanyBanks([]); return undefined; }
    let cancelled = false;
    setLoadingBanks(true);
    setCompanyBanks([]);
    setCompletedFilters((prev) => ({ ...prev, bankId: '' }));
    api.get('/finance/bank/accounts', { params: { companyId } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setCompanyBanks(list);
        setCompletedFilters((prev) => ({ ...prev, bankId: list.length > 0 ? String(list[0].id) : '' }));
      })
      .catch(() => { if (!cancelled) setCompanyBanks([]); })
      .finally(() => { if (!cancelled) setLoadingBanks(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedFilters.companyId]);

  // ------------------------------------------------------------- selection
  const selectedRows = useMemo(
    () => pending.transactions.filter((t) => selectedIds.includes(t.id)),
    [pending.transactions, selectedIds]
  );
  const group = selectedRows[0] || null; // Company + Bank Account of the current selection

  const toggleRow = (row) => {
    if (!canWrite) return;
    if (selectedIds.includes(row.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      return;
    }
    if (group && Number(row.company_id) !== Number(group.company_id)) {
      showPopup('error', `Selected transactions must belong to the same Company. You have selected ${group.company_name} transactions; "${row.company_name}" cannot be added.`);
      return;
    }
    if (group && Number(row.bank_id) !== Number(group.bank_id)) {
      showPopup('error', `Selected transactions must belong to the same Bank Account. You have selected ${bankLabel(group)}; "${bankLabel(row)}" cannot be added.`);
      return;
    }
    setSelectedIds((prev) => [...prev, row.id]);
  };

  // ----------------------------------------------------------- realise modal
  const openRealise = () => {
    if (selectedRows.length === 0) {
      return showPopup('error', 'Please select at least one card transaction to realise');
    }
    const sameCompany = selectedRows.every((r) => Number(r.company_id) === Number(group.company_id));
    const sameBank = selectedRows.every((r) => Number(r.bank_id) === Number(group.bank_id));
    if (!sameCompany) return showPopup('error', 'Selected transactions must belong to the same Company');
    if (!sameBank) return showPopup('error', 'Selected transactions must belong to the same Bank Account');

    const latest = selectedRows.reduce((max, r) => (r.transaction_date > max ? r.transaction_date : max), '');
    const today = todayLocal();
    setRealiseDate(today < latest ? latest : today);
    setRealiseAmountText('');
    setRealiseError('');
    setRealiseOpen(true);
  };

  const closeRealise = () => { if (!realising) setRealiseOpen(false); };

  const minRealiseDate = useMemo(
    () => selectedRows.reduce((max, r) => (r.transaction_date > max ? r.transaction_date : max), ''),
    [selectedRows]
  );

  // Total Transaction Amount = sum of the selected rows (read-only, display aid).
  const totalCents = useMemo(
    () => selectedRows.reduce((sum, r) => sum + toCents(r.amount), 0),
    [selectedRows]
  );

  // Realise Amount validation + the auto-calculated Remaining Balance (read-only).
  const amountCheck = useMemo(() => {
    if (String(realiseAmountText).trim() === '') return { error: '', cents: null };
    const parsed = parseMoney(realiseAmountText);
    if (parsed.error) return { error: parsed.error, cents: null };
    if (parsed.cents >= totalCents) {
      return { error: `Realise Amount must be less than the Total Transaction Amount (Rs. ${fmtCents(totalCents)})`, cents: null };
    }
    return { error: '', cents: parsed.cents };
  }, [realiseAmountText, totalCents]);
  const remainingCents = amountCheck.cents === null ? null : totalCents - amountCheck.cents;

  const handleRealise = async (event) => {
    event.preventDefault();
    if (realising || !group) return; // one submit at a time

    if (!group.company_id) return setRealiseError('Company is required');
    if (!group.bank_id) return setRealiseError('Bank Account is required');
    if (selectedRows.length === 0) return setRealiseError('Please select at least one card transaction');
    if (String(realiseAmountText).trim() === '') return setRealiseError('Realise Amount is required');
    if (amountCheck.error) return setRealiseError(amountCheck.error);
    if (!realiseDate) return setRealiseError('Realise Date is required');
    if (!isRealDate(realiseDate)) return setRealiseError('Please enter a valid Realise Date');
    if (realiseDate < minRealiseDate) {
      return setRealiseError('Realise Date cannot be earlier than the transaction date');
    }

    setRealising(true);
    setRealiseError('');
    try {
      // Only the ids, the typed Realise Amount and the date are sent: the server
      // works out the total and the remaining balance itself.
      const response = await api.post('/finance/card-ledger/realise', {
        transaction_ids: selectedRows.map((r) => r.id),
        realise_amount: (amountCheck.cents / 100).toFixed(2),
        realise_date: realiseDate
      });
      const t = response.data?.totals;
      showPopup(
        'success',
        `Realised Rs. ${fmtMoney(t?.realiseAmount)} on ${fmtDate(realiseDate)} into ${bankLabel(group)}. `
        + `Rs. ${fmtMoney(t?.remainingBalance)} moved to Hidden Expenses (Visa Card Payment).`
      );
      setRealiseOpen(false);
      setSelectedIds([]);
      await Promise.all([fetchPending(), fetchCompleted()]);
    } catch (error) {
      setRealiseError(error.response?.data?.error || 'Failed to realise card transactions');
      // A row may have been realised by someone else meanwhile - refresh the lists.
      fetchPending();
    } finally {
      setRealising(false);
    }
  };

  // ---------------------------------------------------------------- render
  const isPending = tab === 'Pending';
  const setPendingFilter = (name) => (e) => { setPendingFilters((p) => ({ ...p, [name]: e.target.value })); };
  const setCompletedFilter = (name) => (e) => { setCompletedFilters((p) => ({ ...p, [name]: e.target.value })); };
  const pendingCols = canWrite ? 7 : 6;

  return (
    <div className="page-container cl-page">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faCreditCard} style={{ marginRight: '8px' }} /> Card Ledger
          </h2>
        </div>
      </header>

      <div className="card cl-card">
        <div className="cl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={isPending} className={`cl-tab ${isPending ? 'active' : ''}`} onClick={() => setTab('Pending')}>
            Pending <span className="cl-count">{pending.transactions.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={!isPending} className={`cl-tab ${!isPending ? 'active' : ''}`} onClick={() => setTab('Completed')}>
            Completed {completedFilters.bankId && <span className="cl-count">{completed.transactions.length}</span>}
          </button>
        </div>

        {/* ------------------------------ PENDING ------------------------------ */}
        {isPending && (
          <>
            <div className="cl-filters">
              <div className="form-group">
                <label htmlFor="cl-bank">Bank Account</label>
                <select id="cl-bank" value={pendingFilters.bankId} onChange={setPendingFilter('bankId')} className="form-select">
                  <option value="">All bank accounts</option>
                  {allBanks.map((b) => (
                    <option key={b.id} value={b.id}>{b.company} - {b.bank_name}{b.account_number ? `  ${b.account_number}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cl-from">Transaction Date From</label>
                <input id="cl-from" type="date" value={pendingFilters.dateFrom} onChange={setPendingFilter('dateFrom')} className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="cl-to">Transaction Date To</label>
                <input id="cl-to" type="date" value={pendingFilters.dateTo} onChange={setPendingFilter('dateTo')} className="form-input" />
              </div>
            </div>

            <p className="cl-note">
              Pending card transactions are <strong>not</strong> in the Bank Balance yet.
              {canWrite && ' Tick the transactions the bank has received (same Company and Bank Account) and press Realise.'}
            </p>

            {loadingPending ? (
              <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading card transactions...</div>
            ) : (
              <div className="cl-table-wrap">
                <table className="report-table cl-table">
                  <thead>
                    <tr>
                      {canWrite && <th className="cl-check-col" aria-label="Select" />}
                      <th>Transaction Date</th>
                      <th>Company</th>
                      <th>Bank Account</th>
                      <th>Reference No</th>
                      <th>Remark</th>
                      <th className="cl-num">Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.transactions.length === 0 ? (
                      <tr><td colSpan={pendingCols} className="cl-empty">No pending card transactions.</td></tr>
                    ) : pending.transactions.map((row) => {
                      const checked = selectedIds.includes(row.id);
                      const otherGroup = !!group && !checked
                        && (Number(row.company_id) !== Number(group.company_id) || Number(row.bank_id) !== Number(group.bank_id));
                      return (
                        <tr
                          key={row.id}
                          className={`${checked ? 'cl-row-selected' : ''} ${otherGroup ? 'cl-row-dim' : ''}`}
                          onClick={() => toggleRow(row)}
                        >
                          {canWrite && (
                            <td className="cl-check-col" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRow(row)}
                                aria-label={`Select card transaction ${row.reference_number || fmtDate(row.transaction_date)}`}
                              />
                            </td>
                          )}
                          <td>{fmtDate(row.transaction_date)}</td>
                          <td>{row.company_name}</td>
                          <td>{bankLabel(row)}</td>
                          <td>{row.reference_number || ''}</td>
                          <td>{row.remark || ''}</td>
                          <td className="cl-num">{fmtMoney(row.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {pending.transactions.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={pendingCols - 1} className="cl-total-label">Total</td>
                        <td className="cl-num cl-total">{fmtMoney(pending.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {canWrite && (
              <div className="cl-realise-bar">
                <div className="cl-selection-info">
                  {group ? (
                    <>
                      <strong>{selectedRows.length}</strong> selected &middot; Company: <strong>{group.company_name}</strong> &middot; Bank Account: <strong>{bankLabel(group)}</strong>
                      <button type="button" className="cl-link-btn" onClick={() => setSelectedIds([])}>Clear</button>
                    </>
                  ) : 'No transactions selected'}
                </div>
                <button type="button" className="btn btn-primary" onClick={openRealise} disabled={loadingPending}>
                  <FontAwesomeIcon icon={faCheck} /> Realise
                </button>
              </div>
            )}
          </>
        )}

        {/* ----------------------------- COMPLETED ----------------------------- */}
        {!isPending && (
          <>
            <div className="cl-filters cl-filters-4">
              <div className="form-group">
                <label htmlFor="cl-c-company">Company</label>
                <select id="cl-c-company" value={completedFilters.companyId} onChange={setCompletedFilter('companyId')} className="form-select">
                  <option value="">Select Company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cl-c-bank">Bank Account</label>
                <select id="cl-c-bank" value={completedFilters.bankId} onChange={setCompletedFilter('bankId')} disabled={!completedFilters.companyId || loadingBanks} className="form-select">
                  <option value="">
                    {!completedFilters.companyId ? 'Select a Company first' : loadingBanks ? 'Loading...' : companyBanks.length === 0 ? 'No active bank accounts' : 'Select Bank Account'}
                  </option>
                  {companyBanks.map((b) => (
                    <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? `  ${b.account_number}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cl-c-from">Realise Date From</label>
                <input id="cl-c-from" type="date" value={completedFilters.dateFrom} onChange={setCompletedFilter('dateFrom')} className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="cl-c-to">Realise Date To</label>
                <input id="cl-c-to" type="date" value={completedFilters.dateTo} onChange={setCompletedFilter('dateTo')} className="form-input" />
              </div>
            </div>

            {!completedFilters.companyId || !completedFilters.bankId ? (
              <div className="cl-empty">Select a Company and a Bank Account to view completed card transactions.</div>
            ) : loadingCompleted ? (
              <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading card transactions...</div>
            ) : (
              <div className="cl-table-wrap">
                <table className="report-table cl-table">
                  <thead>
                    <tr>
                      <th>Transaction Date</th>
                      <th>Realise Date</th>
                      <th>Reference No</th>
                      <th className="cl-num">Total Transaction Amount</th>
                      <th className="cl-num">Realise Amount</th>
                      <th className="cl-num">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completed.transactions.length === 0 ? (
                      <tr><td colSpan={7} className="cl-empty">No completed card transactions.</td></tr>
                    ) : completed.transactions.map((row) => (
                      <tr key={row.id}>
                        <td className="cl-stack">
                          {(row.cards || []).map((card) => <div key={card.id}>{fmtDate(card.transaction_date)}</div>)}
                        </td>
                        <td className="cl-realise-date">{fmtDate(row.realise_date)}</td>
                        <td className="cl-stack">
                          {(row.cards || []).length > 0
                            ? row.cards.map((card) => <div key={card.id}>{card.reference_number || '\u2014'}</div>)
                            : (row.reference_number || '')}
                        </td>
                        <td className="cl-num">{fmtMoney(row.total_amount)}</td>
                        <td className="cl-num">{fmtMoney(row.realise_amount)}</td>
                        <td className="cl-num">{fmtMoney(row.remaining_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {completed.transactions.length > 0 && completed.totals && (
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="cl-total-label">Total</td>
                        <td className="cl-num cl-total">{fmtMoney(completed.totals.total_amount)}</td>
                        <td className="cl-num cl-total">{fmtMoney(completed.totals.realise_amount)}</td>
                        <td className="cl-num cl-total">{fmtMoney(completed.totals.remaining_balance)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------- REALISE CARD TRANSACTION ------------------------- */}
      {realiseOpen && group && (
        <div className="cl-modal-overlay" onClick={closeRealise}>
          <div className="cl-modal cl-modal-wide" role="dialog" aria-modal="true" aria-labelledby="cl-realise-title" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <div>
                <h3 id="cl-realise-title">Realise Card Transaction</h3>
                <div className="cl-modal-sub">{group.company_name} &middot; {bankLabel(group)}</div>
              </div>
              <button type="button" className="cl-modal-close" onClick={closeRealise} aria-label="Close" disabled={realising}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <form onSubmit={handleRealise} noValidate>
              <div className="cl-modal-body">
                <section aria-labelledby="cl-selected-title">
                  <h4 id="cl-selected-title" className="cl-section-label">Selected Transactions</h4>
                  <div className="cl-table-wrap">
                    <table className="report-table cl-table cl-realise-table">
                      <thead>
                        <tr>
                          <th>Transaction Date</th>
                          <th>Reference No</th>
                          <th className="cl-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRows.map((row) => (
                          <tr key={row.id}>
                            <td>{fmtDate(row.transaction_date)}</td>
                            <td>{row.reference_number || ''}</td>
                            <td className="cl-num">{fmtMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="form-group">
                  <label htmlFor="cl-total">Total Transaction Amount</label>
                  <input
                    id="cl-total"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={fmtCents(totalCents)}
                    className="form-input cl-amount-input cl-readonly"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cl-realise-amount">Realise Amount <span className="required">*</span></label>
                  <input
                    id="cl-realise-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={realiseAmountText}
                    onChange={(e) => { setRealiseAmountText(e.target.value); setRealiseError(''); }}
                    placeholder="0.00"
                    className={`form-input cl-amount-input ${amountCheck.error ? 'cl-input-invalid' : ''}`}
                    aria-invalid={!!amountCheck.error}
                    autoFocus
                  />
                  {amountCheck.error && <span className="form-error">{amountCheck.error}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="cl-remaining">Remaining Balance</label>
                  <input
                    id="cl-remaining"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={remainingCents === null ? '' : fmtCents(remainingCents)}
                    placeholder="0.00"
                    className="form-input cl-amount-input cl-readonly"
                  />
                  <span className="form-helper">
                    Total Transaction Amount &minus; Realise Amount. Recorded under Expenses &rarr; Hidden Expenses as &ldquo;Visa Card Payment&rdquo;.
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="cl-realise-date">Realise Date <span className="required">*</span></label>
                  <input
                    id="cl-realise-date"
                    type="date"
                    min={minRealiseDate}
                    value={realiseDate}
                    onChange={(e) => { setRealiseDate(e.target.value); setRealiseError(''); }}
                    className="form-input"
                  />
                  <span className="form-helper">The Realise Amount is added to the Bank Ledger on this date. This cannot be repeated.</span>
                </div>

                {realiseError && <div className="cl-modal-error" role="alert">{realiseError}</div>}
              </div>

              <div className="cl-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeRealise} disabled={realising}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={realising}>
                  {realising ? <><FontAwesomeIcon icon={faSpinner} spin /> Realising...</> : <><FontAwesomeIcon icon={faCheck} /> Confirm Realise</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardLedger;
