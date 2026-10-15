// src/components/Finance/CardLedger.jsx
//
// Finance -> Card Ledger.
//   Pending   - card transactions not yet realised. They have NO effect on any
//               Bank Balance. Tick one or more rows (or Select All - all from the
//               same Company and Bank Account) and press Realise (below the table).
//   Completed - realised card transactions for the chosen Company + Bank
//               Account: Transaction Date, Realise Date, Reference No, Branch /
//               Department, Total Transaction Amount, Expected Commission,
//               Realise Amount, Remaining Balance / Bank Charge - all read from
//               the saved realisation records.
// Both tabs filter by Company, Bank Account, Branch / Department, Shift No and date.
// Realising lists the selected transactions and shows, read-only, the Total
// Transaction Amount, their Branch / Department, its Credit Card Rate
// (Management -> Credit Card Rate) and the Expected Commission
// (amount x rate / 100 per department). The user enters ONE Realise Amount; the
// read-only Remaining Balance (total - realise - commission) is the Bank Charge.
// The server records the commission ("Visa Card Payment commission") and the
// bank charge ("Credit Card Bank Charge", only when > 0) as two Hidden Expenses.
// The figures on screen are a display aid: the server re-reads the rows and
// rates, validates and does all the writes in ONE database transaction. After
// every change this page re-reads the API.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faSpinner, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import { usePopup } from '../context/PopupContext';
import './FinanceForm.css';
import './CardLedger.css';

const WRITE_ROLES = ['Admin', 'Super Admin', 'Accountant'];
const NO_DEPARTMENT = 'none';

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

const fmtRate = (rate) => `${(Number.parseFloat(rate) || 0).toFixed(2)}%`;

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
const sameGroup = (a, b) => Number(a.company_id) === Number(b.company_id) && Number(a.bank_id) === Number(b.bank_id);
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Shift No is typed: wait until the user pauses before re-reading the API.
const useDebounced = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

// Branch / Department + Shift No filters (same on both tabs).
const DimensionFilters = ({ idPrefix, departments, departmentId, onDepartment, shiftNo, onShiftNo }) => (
  <>
    <div className="form-group">
      <label htmlFor={`${idPrefix}-department`}>Branch / Department</label>
      <select id={`${idPrefix}-department`} value={departmentId} onChange={onDepartment} className="form-select">
        <option value="">All branches / departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        <option value={NO_DEPARTMENT}>Not assigned</option>
      </select>
    </div>
    <div className="form-group">
      <label htmlFor={`${idPrefix}-shift`}>Shift No</label>
      <input id={`${idPrefix}-shift`} type="search" value={shiftNo} onChange={onShiftNo} placeholder="Any shift" className="form-input" />
    </div>
  </>
);

const CardLedger = () => {
  const { showPopup } = usePopup();
  const canWrite = WRITE_ROLES.includes(getStoredUserRole());

  const [tab, setTab] = useState('Pending');
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  // ---- Pending ----
  const [allBanks, setAllBanks] = useState([]);
  const [pendingFilters, setPendingFilters] = useState({ companyId: '', bankId: '', departmentId: '', dateFrom: '', dateTo: '' });
  const [pendingShift, setPendingShift] = useState('');
  const pendingShiftNo = useDebounced(pendingShift.trim());
  const [pending, setPending] = useState({ transactions: [], total: 0 });
  const [loadingPending, setLoadingPending] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  // ---- Completed ----
  const [companyBanks, setCompanyBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [completedFilters, setCompletedFilters] = useState({ companyId: '', bankId: '', departmentId: '', dateFrom: '', dateTo: '' });
  const [completedShift, setCompletedShift] = useState('');
  const completedShiftNo = useDebounced(completedShift.trim());
  const [completed, setCompleted] = useState({ transactions: [], totals: null });
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // ---- Realise modal ----
  const [realiseOpen, setRealiseOpen] = useState(false);
  const [realiseDate, setRealiseDate] = useState('');
  const [realiseAmountText, setRealiseAmountText] = useState(''); // exactly what the user typed
  const [assignDepartmentId, setAssignDepartmentId] = useState(''); // for rows without a department
  const [preview, setPreview] = useState({ loading: false, data: null, error: '' });
  const [realiseError, setRealiseError] = useState('');
  const [realising, setRealising] = useState(false);
  const submittingRef = useRef(false); // blocks a double click before React re-renders
  const realiseDialogRef = useRef(null);
  // Escape (not while saving), focus, Tab trap and scroll lock; closeRealise is declared below.
  useDialog(realiseDialogRef, { open: realiseOpen, onClose: () => closeRealise() });

  // ------------------------------------------------------------------ data
  const fetchPending = useCallback(async () => {
    const params = { status: 'Pending' };
    Object.entries(pendingFilters).forEach(([key, value]) => { if (value) params[key] = value; });
    if (pendingShiftNo) params.shiftNo = pendingShiftNo;
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
  }, [pendingFilters, pendingShiftNo, showPopup]);

  const fetchCompleted = useCallback(async () => {
    const { companyId, bankId } = completedFilters;
    if (!companyId || !bankId) {
      setCompleted({ transactions: [], totals: null });
      return;
    }
    const params = { status: 'Completed' };
    Object.entries(completedFilters).forEach(([key, value]) => { if (value) params[key] = value; });
    if (completedShiftNo) params.shiftNo = completedShiftNo;
    setLoadingCompleted(true);
    try {
      const res = await api.get('/finance/card-ledger', { params });
      setCompleted({ transactions: res.data?.transactions || [], totals: res.data?.totals || null });
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load completed card transactions');
    } finally {
      setLoadingCompleted(false);
    }
  }, [completedFilters, completedShiftNo, showPopup]);

  useEffect(() => { setLoadingPending(true); fetchPending(); }, [fetchPending]);
  useEffect(() => { fetchCompleted(); }, [fetchCompleted]);

  useEffect(() => {
    api.get('/finance/bank/accounts/all')
      .then((res) => setAllBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAllBanks([]));
    api.get('/departments')
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartments([]));
    api.get('/purchases/companies')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCompanies(list);
        if (list.length > 0) setCompletedFilters((prev) => ({ ...prev, companyId: String(list[0].id) }));
      })
      .catch(() => setCompanies([]));
  }, []);

  // Pending: the Bank Account list follows the Company filter.
  const pendingCompany = companies.find((c) => String(c.id) === String(pendingFilters.companyId));
  const pendingBanks = useMemo(
    () => (pendingCompany ? allBanks.filter((b) => sameName(b.company, pendingCompany.name)) : allBanks),
    [allBanks, pendingCompany]
  );

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

  // Select All: every row currently displayed (after the filters) that can be
  // realised together with the current selection - or, with nothing selected,
  // with the first displayed row (one Company + Bank Account per realisation).
  const eligibleRows = useMemo(() => {
    const anchor = group || pending.transactions[0];
    return anchor ? pending.transactions.filter((r) => sameGroup(r, anchor)) : [];
  }, [group, pending.transactions]);
  const allEligibleSelected = eligibleRows.length > 0 && eligibleRows.every((r) => selectedIds.includes(r.id));
  const someSelected = selectedIds.length > 0;
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allEligibleSelected;
  }, [someSelected, allEligibleSelected]);

  const toggleAll = () => {
    if (!canWrite) return;
    if (allEligibleSelected) { setSelectedIds([]); return; }
    setSelectedIds(eligibleRows.map((r) => r.id));
    if (eligibleRows.length < pending.transactions.length) {
      const anchor = eligibleRows[0];
      showPopup(
        'warning',
        `Selected the ${eligibleRows.length} transactions of ${anchor.company_name} / ${bankLabel(anchor)}. `
        + 'Transactions of another Company or Bank Account cannot be realised together - filter by Company and Bank Account to select them.'
      );
    }
  };

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
  const unassignedCount = selectedRows.filter((r) => !r.department_id).length;

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
    setAssignDepartmentId('');
    setRealiseError('');
    setPreview({ loading: true, data: null, error: '' });
    setRealiseOpen(true);
  };

  const closeRealise = () => { if (!realising) setRealiseOpen(false); };

  // Branch / Department, Credit Card Rate and Expected Commission come from the
  // server (Management -> Credit Card Rate). Re-read whenever the selection or
  // the department chosen for unassigned rows changes.
  const selectionKey = selectedRows.map((r) => r.id).join(',');
  useEffect(() => {
    if (!realiseOpen || !selectionKey) return undefined;
    let cancelled = false;
    const params = { ids: selectionKey };
    if (assignDepartmentId) params.departmentId = assignDepartmentId;
    setPreview((prev) => ({ ...prev, loading: true, error: '' }));
    api.get('/finance/card-ledger/commission', { params })
      .then((res) => { if (!cancelled) setPreview({ loading: false, data: res.data, error: '' }); })
      .catch((error) => {
        if (!cancelled) setPreview({ loading: false, data: null, error: error.response?.data?.error || 'Failed to load the Credit Card Rate' });
      });
    return () => { cancelled = true; };
  }, [realiseOpen, selectionKey, assignDepartmentId]);

  const minRealiseDate = useMemo(
    () => selectedRows.reduce((max, r) => (r.transaction_date > max ? r.transaction_date : max), ''),
    [selectedRows]
  );

  // Total Transaction Amount = sum of the selected rows (read-only, display aid).
  const totalCents = useMemo(
    () => selectedRows.reduce((sum, r) => sum + toCents(r.amount), 0),
    [selectedRows]
  );

  const groups = preview.data?.groups || [];
  const problems = preview.data?.problems || [];
  const commissionCents = preview.data && preview.data.expected_commission !== null && preview.data.expected_commission !== undefined
    ? toCents(preview.data.expected_commission) : null;
  const commissionReady = !preview.loading && !preview.error && commissionCents !== null;
  const maxRealiseCents = commissionReady ? totalCents - commissionCents : null;

  // Realise Amount validation + the auto-calculated Remaining Balance / Bank Charge.
  const amountCheck = useMemo(() => {
    if (String(realiseAmountText).trim() === '') return { error: '', cents: null };
    const parsed = parseMoney(realiseAmountText);
    if (parsed.error) return { error: parsed.error, cents: null };
    if (maxRealiseCents !== null && parsed.cents > maxRealiseCents) {
      return {
        error: `Realise Amount cannot be more than Rs. ${fmtCents(maxRealiseCents)} (Total Transaction Amount - Expected Commission)`,
        cents: null
      };
    }
    return { error: '', cents: parsed.cents };
  }, [realiseAmountText, maxRealiseCents]);
  const remainingCents = amountCheck.cents === null || maxRealiseCents === null ? null : maxRealiseCents - amountCheck.cents;

  const departmentText = groups.length > 0
    ? groups.map((g) => g.department_name).join(', ')
    : (unassignedCount > 0 ? 'Not assigned' : '');
  const rateText = groups.length === 0 ? ''
    : groups.length === 1
      ? (groups[0].rate === null ? 'No active rate' : fmtRate(groups[0].rate))
      : groups.map((g) => `${g.department_name} ${g.rate === null ? 'no active rate' : fmtRate(g.rate)}`).join(' · ');

  const handleRealise = async (event) => {
    event.preventDefault();
    if (realising || submittingRef.current || !group) return; // one submit at a time

    if (!group.company_id) return setRealiseError('Company is required');
    if (!group.bank_id) return setRealiseError('Bank Account is required');
    if (selectedRows.length === 0) return setRealiseError('Please select at least one card transaction');
    if (unassignedCount > 0 && !assignDepartmentId) {
      return setRealiseError('Select the Branch / Department of the transactions that have none');
    }
    if (preview.loading) return setRealiseError('Please wait - the Credit Card Rate is still loading');
    if (preview.error) return setRealiseError(preview.error);
    if (problems.length > 0) return setRealiseError(problems.join(' '));
    if (!realiseDate) return setRealiseError('Realise Date is required');
    if (!isRealDate(realiseDate)) return setRealiseError('Please enter a valid Realise Date');
    if (realiseDate < minRealiseDate) {
      return setRealiseError('Realise Date cannot be earlier than the transaction date');
    }
    if (String(realiseAmountText).trim() === '') return setRealiseError('Realise Amount is required');
    if (amountCheck.error) return setRealiseError(amountCheck.error);

    submittingRef.current = true;
    setRealising(true);
    setRealiseError('');
    try {
      // Only the ids, the typed Realise Amount, the date (and the department for
      // unassigned rows) are sent: the server works out every figure itself.
      const body = {
        transaction_ids: selectedRows.map((r) => r.id),
        realise_amount: (amountCheck.cents / 100).toFixed(2),
        realise_date: realiseDate
      };
      if (unassignedCount > 0) body.department_id = Number(assignDepartmentId);
      const response = await api.post('/finance/card-ledger/realise', body);
      const t = response.data?.totals;
      const parts = [];
      if (toCents(t?.expectedCommission) > 0) parts.push(`Visa Card Payment commission Rs. ${fmtMoney(t.expectedCommission)}`);
      if (toCents(t?.bankCharge) > 0) parts.push(`Credit Card Bank Charge Rs. ${fmtMoney(t.bankCharge)}`);
      showPopup(
        'success',
        `Realised Rs. ${fmtMoney(t?.realiseAmount)} on ${fmtDate(realiseDate)} into ${bankLabel(group)}.`
        + (parts.length ? ` Recorded in Hidden Expenses: ${parts.join('; ')}.` : '')
      );
      setRealiseOpen(false);
      setSelectedIds([]);
      await Promise.all([fetchPending(), fetchCompleted()]);
    } catch (error) {
      setRealiseError(error.response?.data?.error || 'Failed to realise card transactions');
      // A row may have been realised by someone else meanwhile - refresh the lists.
      fetchPending();
    } finally {
      submittingRef.current = false;
      setRealising(false);
    }
  };

  // ---------------------------------------------------------------- render
  const isPending = tab === 'Pending';
  const setPendingFilter = (name) => (e) => {
    const { value } = e.target;
    setPendingFilters((p) => {
      const next = { ...p, [name]: value };
      if (name === 'companyId' && p.bankId) {
        // Keep the Bank Account only if it belongs to the newly chosen Company.
        const company = companies.find((c) => String(c.id) === String(value));
        const bank = allBanks.find((b) => String(b.id) === String(p.bankId));
        if (company && bank && !sameName(bank.company, company.name)) next.bankId = '';
      }
      return next;
    });
  };
  const setCompletedFilter = (name) => (e) => { setCompletedFilters((p) => ({ ...p, [name]: e.target.value })); };
  const pendingCols = canWrite ? 9 : 8;

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
            <div className="cl-filters cl-filters-row">
              <div className="form-group">
                <label htmlFor="cl-company">Company</label>
                <select id="cl-company" value={pendingFilters.companyId} onChange={setPendingFilter('companyId')} className="form-select">
                  <option value="">All companies</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cl-bank">Bank Account</label>
                <select id="cl-bank" value={pendingFilters.bankId} onChange={setPendingFilter('bankId')} className="form-select">
                  <option value="">All bank accounts</option>
                  {pendingBanks.map((b) => (
                    <option key={b.id} value={b.id}>{pendingCompany ? '' : `${b.company} - `}{b.bank_name}{b.account_number ? `  ${b.account_number}` : ''}</option>
                  ))}
                </select>
              </div>
              <DimensionFilters
                idPrefix="cl"
                departments={departments}
                departmentId={pendingFilters.departmentId}
                onDepartment={setPendingFilter('departmentId')}
                shiftNo={pendingShift}
                onShiftNo={(e) => setPendingShift(e.target.value)}
              />
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
                      {canWrite && (
                        <th className="cl-check-col">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allEligibleSelected}
                            onChange={toggleAll}
                            disabled={pending.transactions.length === 0}
                            aria-label="Select all card transactions"
                            title="Select all transactions shown that can be realised together"
                          />
                        </th>
                      )}
                      <th>Transaction Date</th>
                      <th>Company</th>
                      <th>Bank Account</th>
                      <th>Branch / Department</th>
                      <th>Shift No</th>
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
                      const otherGroup = !!group && !checked && !sameGroup(row, group);
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
                          <td>{row.department_name || <span className="cl-muted">Not assigned</span>}</td>
                          <td>{row.shift_no || ''}</td>
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
                      &middot; Rs. <strong>{fmtCents(totalCents)}</strong>
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
            <div className="cl-filters cl-filters-row">
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
              <DimensionFilters
                idPrefix="cl-c"
                departments={departments}
                departmentId={completedFilters.departmentId}
                onDepartment={setCompletedFilter('departmentId')}
                shiftNo={completedShift}
                onShiftNo={(e) => setCompletedShift(e.target.value)}
              />
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
                      <th>Branch / Department</th>
                      <th className="cl-num">Total Transaction Amount</th>
                      <th className="cl-num">Expected Commission</th>
                      <th className="cl-num">Realise Amount</th>
                      <th className="cl-num">Remaining Balance / Bank Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completed.transactions.length === 0 ? (
                      <tr><td colSpan={8} className="cl-empty">No completed card transactions.</td></tr>
                    ) : completed.transactions.map((row) => (
                      <tr key={row.id}>
                        <td className="cl-stack">
                          {(row.cards || []).map((card) => <div key={card.id}>{fmtDate(card.transaction_date)}</div>)}
                        </td>
                        <td className="cl-realise-date">{fmtDate(row.realise_date)}</td>
                        <td className="cl-stack">
                          {(row.cards || []).length > 0
                            ? row.cards.map((card) => <div key={card.id}>{card.reference_number || '—'}</div>)
                            : (row.reference_number || '')}
                        </td>
                        <td>{(row.departments || []).join(', ') || '—'}</td>
                        <td className="cl-num">{fmtMoney(row.total_amount)}</td>
                        {/* Realisations saved before the commission split have no commission figure. */}
                        <td className="cl-num">{row.commission_amount === null || row.commission_amount === undefined ? '—' : fmtMoney(row.commission_amount)}</td>
                        <td className="cl-num">{fmtMoney(row.realise_amount)}</td>
                        <td className="cl-num">{fmtMoney(row.remaining_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {completed.transactions.length > 0 && completed.totals && (
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="cl-total-label">Total</td>
                        <td className="cl-num cl-total">{fmtMoney(completed.totals.total_amount)}</td>
                        <td className="cl-num cl-total">{fmtMoney(completed.totals.commission_amount)}</td>
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
        // Backdrop is inert: an outside click must not discard the typed amount.
        <div className="cl-modal-overlay">
          <div ref={realiseDialogRef} className="cl-modal cl-modal-wide" role="dialog" aria-modal="true" aria-labelledby="cl-realise-title">
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
                  <div className="cl-table-wrap cl-selected-wrap">
                    <table className="report-table cl-table cl-realise-table">
                      <thead>
                        <tr>
                          <th>Transaction Date</th>
                          <th>Reference No</th>
                          <th>Branch / Department</th>
                          <th className="cl-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRows.map((row) => (
                          <tr key={row.id}>
                            <td>{fmtDate(row.transaction_date)}</td>
                            <td>{row.reference_number || ''}</td>
                            <td>{row.department_name || <span className="cl-muted">Not assigned</span>}</td>
                            <td className="cl-num">{fmtMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="cl-form-grid">
                  <div className="form-group">
                    <label htmlFor="cl-total">Total Transaction Amount</label>
                    <input id="cl-total" type="text" readOnly tabIndex={-1} value={fmtCents(totalCents)} className="form-input cl-amount-input cl-readonly" />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cl-realise-department">Branch / Department</label>
                    <input id="cl-realise-department" type="text" readOnly tabIndex={-1} value={departmentText} className="form-input cl-readonly" />
                  </div>

                  {unassignedCount > 0 && (
                    <div className="form-group cl-span-2">
                      <label htmlFor="cl-assign-department">
                        Branch / Department for {unassignedCount === 1 ? 'the transaction' : `the ${unassignedCount} transactions`} without one <span className="required">*</span>
                      </label>
                      <select
                        id="cl-assign-department"
                        value={assignDepartmentId}
                        onChange={(e) => { setAssignDepartmentId(e.target.value); setRealiseError(''); }}
                        className="form-input"
                      >
                        <option value="">Select Branch / Department</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <span className="form-helper">Saved on those transactions when they are realised; its Credit Card Rate is applied.</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="cl-rate">Credit Card Rate (%)</label>
                    <input id="cl-rate" type="text" readOnly tabIndex={-1} value={preview.loading ? 'Loading...' : rateText} className="form-input cl-readonly" />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cl-commission">Expected Commission</label>
                    <input
                      id="cl-commission"
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={commissionReady ? fmtCents(commissionCents) : ''}
                      placeholder={preview.loading ? 'Loading...' : '0.00'}
                      className="form-input cl-amount-input cl-readonly"
                    />
                  </div>
                </div>

                {groups.length > 1 && commissionReady && (
                  <ul className="cl-breakdown" aria-label="Commission by Branch / Department">
                    {groups.map((g) => (
                      <li key={g.department_id}>
                        <span>{g.department_name}: Rs. {fmtMoney(g.amount)} &times; {fmtRate(g.rate)}</span>
                        <strong>Rs. {fmtMoney(g.expected_commission)}</strong>
                      </li>
                    ))}
                  </ul>
                )}

                {(preview.error || problems.length > 0) && (
                  <div className="cl-modal-error" role="alert">
                    {preview.error || problems.map((p) => <div key={p}>{p}</div>)}
                  </div>
                )}

                <div className="cl-form-grid">
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
                      placeholder={maxRealiseCents !== null ? `max ${fmtCents(maxRealiseCents)}` : '0.00'}
                      className={`form-input cl-amount-input ${amountCheck.error ? 'cl-input-invalid' : ''}`}
                      aria-invalid={!!amountCheck.error}
                      autoFocus
                    />
                  </div>
                  {amountCheck.error && <span className="form-error cl-span-2">{amountCheck.error}</span>}

                  <div className="form-group cl-span-2">
                    <label htmlFor="cl-remaining">Remaining Balance / Bank Charge</label>
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
                      Total Transaction Amount &minus; Realise Amount &minus; Expected Commission. The Realise Amount is added to the
                      Bank Ledger on the Realise Date; the Expected Commission is recorded under Expenses &rarr; Hidden Expenses as
                      &ldquo;Visa Card Payment commission&rdquo; and the Bank Charge (when greater than zero) as &ldquo;Credit Card Bank Charge&rdquo;.
                    </span>
                  </div>
                </div>

                {realiseError && <div className="cl-modal-error" role="alert">{realiseError}</div>}
              </div>

              <div className="cl-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeRealise} disabled={realising}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={realising || preview.loading}>
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
