// src/components/Collection/Collection.jsx
//
// Collection module: RAVON POS + RAVON Restaurant collections -> Pending ->
// Completed / Rejected. Both systems go through the same flow; every row shows
// its System (POS / Restaurant).
//   Pending   - opening the tab asks the BSMS backend to pull the three
//               endpoints (completed shift collections, credit payments, employee
//               deductions) of BOTH systems for the searched date range (or the
//               recent default window). The backend uses the signed-in user's
//               OWN session of each system and shows only what that account may
//               see there (collection types, POS branches) - the browser never
//               calls POS / Restaurant and never sees a token. No password is
//               stored, so there is no background sync: when a system is "not
//               connected / expired" the page says so (log in again with the same
//               username / password as that system). When the user's accounts
//               may see no collections at all, the page says so (server 403).
//               Pending records are NOT in any ledger. Tick one, several or all
//               and Approve or Reject.
//   Filters   - Search text, System, Source, Department and From / To date are applied
//               together by the backend when Search is pressed (or Enter).
//   Completed - approved collections, read from the BSMS database (not the POS),
//               with what was posted to which ledger.
//   Rejected  - rejected collections with the reason; can be moved back to Pending.
// Shift card: the shift's card total is only a summary. Its individual POS card
// payments are listed ("N payments") and each one becomes its own Card Ledger
// entry; a shift whose payments do not add up to the card total cannot be approved.
// Approving posts, in ONE server-side transaction: Cash -> Cash Ledger, Bank /
// Online -> the chosen company bank account, Card -> Card Ledger (Pending, realised
// there as usual), AR -> "AR Account", Short/Excess -> "Short/Excess Account",
// Employee deduction -> "Short/Excess Account" (credit). The amounts shown here
// are a display aid only: the server re-reads them from the database.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHandHoldingDollar, faSpinner, faCheck, faTimes, faRotateRight, faBan, faUndo, faTriangleExclamation, faMagnifyingGlass
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import usePermissions from '../../hooks/usePermissions';
import '../Finance/FinanceForm.css';
import '../Finance/CardLedger.css';
import './Collection.css';

const TABS = ['Pending', 'Completed', 'Rejected'];

const SOURCE_LABELS = {
  SHIFT: 'Shift Collection',
  CREDIT_PAYMENT: 'Credit Payment',
  EMPLOYEE_DEDUCTION: 'Employee Deduction'
};
const REF_PREFIX = { SHIFT: 'SHIFT', CREDIT_PAYMENT: 'CP', EMPLOYEE_DEDUCTION: 'DED' };
// Source system of a record (collections.source_system). Restaurant references
// carry "RST-" (mirrors collectionService.ledgerReference); POS ones are unchanged.
const SYSTEM_LABELS = { POS: 'POS', RESTAURANT: 'Restaurant' };
const SYSTEM_REF_PREFIX = { POS: '', RESTAURANT: 'RST-' };
const PROVIDER_ORDER = ['pos', 'restaurant'];
const METHOD_LABELS = { CASH: 'Cash', CARD: 'Card', BANK: 'Bank / Online', AR: 'AR', SHORT_EXCESS: 'Short / Excess', AR_SETTLEMENT: 'AR settled' };
const REASON_MAX = 255;

const num = (v) => Number.parseFloat(v) || 0;
const fmtMoney = (v) => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCell = (v) => (num(v) === 0 ? <span className="col-zero">—</span> : fmtMoney(v));

// 'YYYY-MM-DD[ HH:mm]' -> 'DD/MM/YYYY[ HH:mm]' without Date (no timezone shifts).
const fmtDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] || ''}` : '';
};

// POS UTC timestamp -> 'DD/MM/YYYY HH:mm' in Sri Lanka time (the business time zone).
const fmtDateTime = (value) => {
  const d = new Date(String(value || '').replace(/(\.\d{3})\d+/, '$1'));
  if (!value || Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
};
const CARD_TYPE_LABELS = { sale: 'Sale', order_advance: 'Order advance' };

// Ledger reference (e.g. "SHIFT-211-0104", Restaurant "RST-SHIFT-211-0104") and
// the reference shown in the tables (a shift shows its Shift Reference "211-0104").
const systemOf = (system) => (system === 'RESTAURANT' ? 'RESTAURANT' : 'POS');
const refOf = (row) => `${SYSTEM_REF_PREFIX[systemOf(row.source_system)]}${REF_PREFIX[row.source_type] || 'POS'}-${row.reference_no || row.source_id}`;
const displayRef = (row) => row.shift_reference || row.reference_no || row.source_id;

const systemBadge = (system) => {
  const s = systemOf(system);
  return <span className={`col-system col-system-${s.toLowerCase()}`} title={`Source system: ${SYSTEM_LABELS[s]}`}>{SYSTEM_LABELS[s]}</span>;
};
// Reference cell: system badge + reference.
const refCell = (r) => <>{systemBadge(r.source_system)} {displayRef(r)}</>;

const isUnmapped = (r) => !r.department_id && !!r.pos_branch_name;

const departmentCell = (r) => (
  <>
    {r.department_name
      || (isUnmapped(r) ? <span className="col-warn" title="No Stock Management department matches this branch">Unmapped</span>
        : <span className="col-zero">—</span>)}
    {r.pos_branch_name && <div className="col-sub">Branch: {r.pos_branch_name}</div>}
  </>
);
const linkedRefOf = (row) => (row.linked_collection_id
  ? `${SYSTEM_REF_PREFIX[systemOf(row.linked_source_system)]}${REF_PREFIX[row.linked_source_type] || 'POS'}-${row.linked_reference_no || row.linked_source_id}` : null);

// Short/Excess: + short, - excess.
const shortExcessText = (v) => {
  const n = num(v);
  if (n === 0) return <span className="col-zero">—</span>;
  return <span className={n > 0 ? 'col-short' : 'col-excess'}>{fmtMoney(Math.abs(n))} {n > 0 ? 'Short' : 'Excess'}</span>;
};

// Payment methods a pending row will post (mirrors collectionMapper.postingsOf).
const methodsOf = (row) => {
  if (row.source_type === 'EMPLOYEE_DEDUCTION') return ['SHORT_EXCESS'];
  return [
    ['CASH', row.cash_amount], ['CARD', row.card_amount], ['BANK', row.bank_amount],
    ['AR', row.ar_amount], ['SHORT_EXCESS', row.short_excess_amount]
  ].filter(([, v]) => num(v) !== 0).map(([m]) => m);
};

// Credit Payment: AR Account CREDIT of the money received (mirrors collectionService.settlementsOf).
const arSettlementOf = (row) => (row.source_type === 'CREDIT_PAYMENT'
  ? Number((num(row.cash_amount) + num(row.card_amount) + num(row.bank_amount)).toFixed(2)) : 0);

// Why a shift's card cannot be posted as individual payments, or null.
const cardIssue = (row) => {
  if (row.source_type !== 'SHIFT' || num(row.card_amount) === 0) return null;
  if (row.card_txn_count === null || row.card_txn_count === undefined) return `${SYSTEM_LABELS[systemOf(row.source_system)]} sent no individual card payments`;
  const diff = num(row.card_amount) - num(row.card_txn_total);
  if (Math.abs(diff) > 0.009) {
    return `the ${row.card_txn_count} card payments add up to ${fmtMoney(row.card_txn_total)}, not ${fmtMoney(row.card_amount)} (difference ${fmtMoney(diff)})`;
  }
  return null;
};

const totalMismatch = (row) => row.pos_total_amount !== null && row.pos_total_amount !== undefined
  && Math.abs(num(row.pos_total_amount) - num(row.total_amount)) > 0.009;

const EMPTY_FILTERS = { search: '', system: '', source: '', department: '', fromDate: '', toDate: '' };
const EMPTY_DATA = {
  records: [], total: 0, page: 1, pages: 1, limit: 100,
  summary: { count: 0, cash: 0, card: 0, bank: 0, ar: 0, short_excess: 0, deduction: 0, total: 0, unmapped: 0 }
};
const PAGE_SIZE = 100;

// Department filter value: "d:<department id>" or "u:<branch>" (unmapped branch).
const toParams = (f, page) => {
  const p = { page, limit: PAGE_SIZE };
  if (f.search) p.search = f.search;
  if (f.system) p.source_system = f.system;
  if (f.source) p.source = f.source;
  if (f.department.startsWith('d:')) p.department_id = f.department.slice(2);
  if (f.department.startsWith('u:')) { p.department_id = 'unmapped'; p.branch = f.department.slice(2); }
  if (f.department === 'unmapped') p.department_id = 'unmapped';
  if (f.fromDate) p.from_date = f.fromDate;
  if (f.toDate) p.to_date = f.toDate;
  return p;
};

const bankLabel = (b) =>`${b.bank_name || ''}${b.account_number ? `  ${b.account_number}` : ''}`.trim();
const digits = (v) => String(v || '').replace(/\D/g, '');

const Collection = () => {
  const { showPopup } = usePopup();
  const { canWrite, canApproveCollections } = usePermissions();

  const [tab, setTab] = useState('Pending');
  const [companies, setCompanies] = useState([]);
  const [banks, setBanks] = useState([]);

  // Filters - shared by all three tabs. `draft` is what the controls show;
  // `filters` is what was last searched (Search button / Enter) and is sent to
  // the API, where every filter is applied together.
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchSeq, setSearchSeq] = useState(0); // bumps on every Search, even with unchanged filters
  const [page, setPage] = useState(1);
  const [departmentOptions, setDepartmentOptions] = useState({ departments: [], unmapped: [] });

  // Current tab's data (from the BSMS database; Pending is refreshed from the POS on open)
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [sync, setSync] = useState(null);
  // { pos: {...}, restaurant: {...} } - connection state of each system (never a token)
  const [integrations, setIntegrations] = useState(null);
  // What THIS user's own POS / Restaurant accounts may see (server-validated):
  // { collection: { allowed, sources: { POS: [...], RESTAURANT: [...] } }, systems }
  const [access, setAccess] = useState(null);
  const [accessDenied, setAccessDenied] = useState(null); // message when the server refused (403)
  const [selectedIds, setSelectedIds] = useState([]);
  const [rejectedSelected, setRejectedSelected] = useState([]);
  const refreshOnNextLoad = useRef(true); // pull from the POS when Pending is opened / searched

  // Dialogs
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveInputs, setApproveInputs] = useState({}); // id -> { company_id, bank_account_id, card_bank_account_id }
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cardView, setCardView] = useState(null); // { row, loading, data, error } - individual card payments

  // ------------------------------------------------------------------ data
  useEffect(() => {
    api.get('/purchases/companies')
      .then((res) => setCompanies(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCompanies([]));
    api.get('/finance/bank/accounts/all')
      .then((res) => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBanks([]));
  }, []);

  const loadDepartmentOptions = useCallback(() => {
    api.get('/collections/departments')
      .then((res) => setDepartmentOptions({
        departments: res.data?.departments || [],
        unmapped: res.data?.unmapped || []
      }))
      .catch(() => {});
  }, []);

  const params = useMemo(() => toParams(filters, page), [filters, page]);

  const loadIntegrations = useCallback(() => {
    api.get('/collections/integrations/status')
      .then((res) => {
        setIntegrations(res.data?.integrations || null);
        if (res.data?.access) setAccess(res.data.access);
      })
      .catch(() => {});
  }, []);

  // One loader for the current tab. On Pending, opening the tab, Search and
  // "Refresh" first make the backend pull POS and Restaurant (all departments)
  // for the searched date range - the range is never answered from rows loaded
  // earlier. Paging only reads the database. The backend uses THIS user's own
  // POS / Restaurant sessions and returns only what those accounts may see;
  // the browser never talks to POS / Restaurant.
  const load = useCallback(async ({ refresh = false } = {}) => {
    const status = tab.toLowerCase();
    const pull = status === 'pending' && refresh;
    setLoading(true);
    try {
      const res = await api.get(`/collections/${status}`, { params: { ...params, ...(pull ? { refresh: 1 } : {}) } });
      const body = res.data || {};
      setAccessDenied(null);
      setData({ ...EMPTY_DATA, ...body, records: body.records || [] });
      if (status === 'pending') {
        if (body.sync) setSync(body.sync);
        if (body.integrations) setIntegrations(body.integrations);
        if (body.access) setAccess(body.access);
        const visible = new Set((body.records || []).map((r) => r.id));
        setSelectedIds((prev) => prev.filter((id) => visible.has(id)));
        if (pull) loadDepartmentOptions();
      } else {
        setRejectedSelected([]);
      }
    } catch (error) {
      const body = error.response?.data || {};
      if (error.response?.status === 403 && body.code === 'INTEGRATION_ACCESS_DENIED') {
        // The user's own POS / Restaurant accounts may not see any collections.
        setData(EMPTY_DATA);
        setAccessDenied(body.error || 'You do not have permission to access Collections.');
        if (body.access) setAccess(body.access);
      } else {
        showPopup('error', body.error || `Failed to load ${tab.toLowerCase()} collections`);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, params, showPopup, loadDepartmentOptions]);

  useEffect(() => {
    const refresh = tab === 'Pending' && refreshOnNextLoad.current;
    refreshOnNextLoad.current = false;
    load({ refresh });
  }, [load, tab, searchSeq]);

  useEffect(() => { loadDepartmentOptions(); }, [loadDepartmentOptions]);
  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  const openTab = (t) => {
    if (t === tab) return;
    if (t === 'Pending') refreshOnNextLoad.current = true;
    setData(EMPTY_DATA);
    setPage(1);
    setTab(t);
  };

  // Controls only change the draft; Search applies all of them at once from page 1.
  const setDraftField = (name) => (e) => { const { value } = e.target; setDraft((d) => ({ ...d, [name]: value })); };
  const runSearch = (e) => {
    if (e) e.preventDefault();
    if (draft.fromDate && draft.toDate && draft.fromDate > draft.toDate) {
      showPopup('error', 'From date cannot be after To date');
      return;
    }
    if (tab === 'Pending') refreshOnNextLoad.current = true;
    setFilters({ ...draft, search: draft.search.trim() });
    setPage(1);
    setSearchSeq((n) => n + 1);
  };

  // ------------------------------------------------------------- pending view
  const records = data.records;
  const selectedRows = useMemo(
    () => (tab === 'Pending' ? records.filter((r) => selectedIds.includes(r.id)) : []),
    [tab, records, selectedIds]
  );
  const allVisibleSelected = records.length > 0 && records.every((r) => selectedIds.includes(r.id));

  const toggleRow = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => {
    const ids = records.map((r) => r.id);
    setSelectedIds((prev) => (allVisibleSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const totals = data.summary || EMPTY_DATA.summary;

  // ------------------------------------------------------------- approve
  const companyName = (id) => companies.find((c) => Number(c.id) === Number(id))?.name || '';
  // Active accounts of the company (the API returns each account's company_id).
  const banksForCompany = (companyId) => {
    if (!companyId) return [];
    const name = companyName(companyId).trim().toLowerCase();
    return banks.filter((b) => (b.company_id
      ? Number(b.company_id) === Number(companyId)
      : String(b.company || '').trim().toLowerCase() === name));
  };

  const openApprove = () => {
    if (selectedRows.length === 0) { showPopup('error', 'Select at least one pending record to approve'); return; }
    const unmapped = selectedRows.filter(isUnmapped);
    if (unmapped.length > 0) {
      showPopup('error', `${refOf(unmapped[0])}: branch "${unmapped[0].pos_branch_name}" is not mapped to a department, so it cannot be approved yet.`);
      return;
    }
    const mismatched = selectedRows.filter(totalMismatch);
    if (mismatched.length > 0) {
      const system = SYSTEM_LABELS[systemOf(mismatched[0].source_system)];
      showPopup('error', `${refOf(mismatched[0])}: the ${system} collection total does not match Cash + Card + Bank / Online + AR. Reject it or fix it in ${system}.`);
      return;
    }
    const cardProblem = selectedRows.find(cardIssue);
    if (cardProblem) {
      showPopup('error', `${refOf(cardProblem)}: card cannot be posted - ${cardIssue(cardProblem)}. Check the shift's card payments in ${SYSTEM_LABELS[systemOf(cardProblem.source_system)]}.`);
      return;
    }
    const inputs = {};
    selectedRows.forEach((r) => {
      // No company from POS / Restaurant: suggest the one last used for this department.
      const companyId = r.company_id ? String(r.company_id) : (r.suggested_company_id ? String(r.suggested_company_id) : '');
      const options = banksForCompany(companyId);
      const posMatch = r.pos_bank_account
        ? options.filter((b) => digits(b.account_number) && digits(b.account_number) === digits(r.pos_bank_account)) : [];
      inputs[r.id] = {
        company_id: companyId,
        bank_account_id: posMatch.length === 1 ? String(posMatch[0].id) : (options.length === 1 ? String(options[0].id) : ''),
        card_bank_account_id: options.length === 1 ? String(options[0].id) : ''
      };
    });
    setApproveInputs(inputs);
    setDialogError('');
    setApproveOpen(true);
  };

  const setInput = (id, field, value) => {
    setApproveInputs((prev) => {
      const next = { ...prev[id], [field]: value };
      if (field === 'company_id') { next.bank_account_id = ''; next.card_bank_account_id = ''; }
      return { ...prev, [id]: next };
    });
    setDialogError('');
  };

  const approveProblems = useMemo(() => selectedRows.flatMap((r) => {
    const input = approveInputs[r.id] || {};
    const methods = methodsOf(r);
    const problems = [];
    if (!r.company_id && !input.company_id) problems.push(`${refOf(r)}: select a company`);
    if (methods.includes('BANK') && !input.bank_account_id) problems.push(`${refOf(r)}: select the bank account for the online / bank amount`);
    if (methods.includes('CARD') && !input.card_bank_account_id) problems.push(`${refOf(r)}: select the card settlement bank account`);
    return problems;
  }), [selectedRows, approveInputs]);

  const submitApprove = async () => {
    if (submitting) return;
    if (approveProblems.length > 0) { setDialogError(approveProblems[0]); return; }
    setSubmitting(true);
    setDialogError('');
    try {
      const items = selectedRows.map((r) => {
        const input = approveInputs[r.id] || {};
        const item = { id: r.id };
        if (!r.company_id && input.company_id) item.company_id = Number(input.company_id);
        if (input.bank_account_id && methodsOf(r).includes('BANK')) item.bank_account_id = Number(input.bank_account_id);
        if (input.card_bank_account_id && methodsOf(r).includes('CARD')) item.card_bank_account_id = Number(input.card_bank_account_id);
        return item;
      });
      const res = await api.post('/collections/approve', { items });
      // Records the server skipped (already approved, or a duplicate POS reference
      // approved by another user) are listed in the message: show it as a warning.
      const skipped = Array.isArray(res.data?.skipped) ? res.data.skipped : [];
      showPopup(skipped.length ? 'warning' : 'success', res.data?.message || 'Collections approved',
        skipped.length ? { duration: 12000 } : {});
      setApproveOpen(false);
      setSelectedIds([]);
      await load();
    } catch (error) {
      setDialogError(error.response?.data?.error || 'Failed to approve collections. Nothing was saved.');
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------- reject / restore
  const openReject = () => {
    if (selectedRows.length === 0) { showPopup('error', 'Select at least one pending record to reject'); return; }
    setRejectReason('');
    setDialogError('');
    setRejectOpen(true);
  };

  const submitReject = async () => {
    if (submitting) return;
    const reason = rejectReason.trim();
    if (!reason) { setDialogError('Please enter a rejection reason'); return; }
    setSubmitting(true);
    setDialogError('');
    try {
      const res = await api.post('/collections/reject', { ids: selectedRows.map((r) => r.id), reason });
      showPopup('success', res.data?.message || 'Collections rejected');
      setRejectOpen(false);
      setSelectedIds([]);
      await load();
    } catch (error) {
      setDialogError(error.response?.data?.error || 'Failed to reject collections');
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const restoreSelected = async () => {
    if (rejectedSelected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post('/collections/restore', { ids: rejectedSelected });
      showPopup('success', res.data?.message || 'Moved back to Pending');
      await load();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to move records back to Pending');
    } finally {
      setSubmitting(false);
    }
  };

  // Individual POS card payments of a shift (and their Card Ledger entries once approved).
  const openCardPayments = async (row) => {
    setCardView({ row, loading: true, data: null, error: '' });
    try {
      const res = await api.get(`/collections/${row.id}`);
      setCardView({ row, loading: false, data: res.data?.card_payments || null, error: '' });
    } catch (error) {
      setCardView({ row, loading: false, data: null, error: error.response?.data?.error || 'Failed to load the card payments' });
    }
  };

  // Card cell: the card total plus its individual payments.
  const cardCell = (r, amount, completed = false) => {
    const isShiftCard = r.source_type === 'SHIFT' && num(amount) !== 0;
    const issue = !completed && cardIssue(r);
    return (
      <>
        {moneyCell(amount)}
        {isShiftCard && ((r.card_txn_count !== null && r.card_txn_count !== undefined) || completed) && (
          <div className="col-sub">
            <button type="button" className="col-link-btn" onClick={(e) => { e.stopPropagation(); openCardPayments(r); }}>
              {completed && r.card_ledger_entries
                ? `${r.card_ledger_entries} card entr${r.card_ledger_entries === 1 ? 'y' : 'ies'}`
                : `${r.card_txn_count ?? ''} payment${Number(r.card_txn_count) === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
        {issue && <div className="col-sub col-warn" title={issue}>Card details do not match</div>}
      </>
    );
  };

  // ------------------------------------------------------------- render helpers
  // Results of the last sync, per system ({ system, fetched, created, ... sources[] }).
  // Older responses without `systems` are POS-only.
  const syncSystems = sync?.systems || (sync?.sources ? [{ system: 'POS', sources: sync.sources }] : []);
  const sourceLabel = (s) => `${SYSTEM_LABELS[systemOf(s.system)]} ${SOURCE_LABELS[s.source]}`;
  // A source that could not be read is reported by the per-system status below;
  // the records already in Pending are simply shown.
  const loadedSources = syncSystems.flatMap((sys) => (sys.sources || []).map((s) => ({ ...s, system: sys.system })))
    .filter((s) => !s.error);
  const syncProblems = loadedSources.filter((s) => s.invalid > 0 || s.duplicate > 0 || s.unmapped > 0);

  // POS / Restaurant connection badges. The browser never sees a token: only
  // connected / not connected / expired, the account name and branch scope.
  // Collection types this user's own account may see in a system (server-validated).
  const allowedSourcesOf = (system) => access?.collection?.sources?.[system] || [];
  // Filter options: only systems / types the user may see (all until known).
  const visibleSystems = access
    ? Object.keys(SYSTEM_LABELS).filter((system) => allowedSourcesOf(system).length > 0)
    : Object.keys(SYSTEM_LABELS);
  const visibleSourceTypes = access
    ? Object.keys(SOURCE_LABELS).filter((source) => visibleSystems.some((system) => allowedSourcesOf(system).includes(source)))
    : Object.keys(SOURCE_LABELS);

  const renderAccessDenied = () => (
    <>
      <div className="col-sync-alert" role="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <div>
          <strong>No access to Collections.</strong> {accessDenied}
          {' '}Access follows the permissions of your own POS / Restaurant account
          (shift review, credit payments, salary deductions). Ask the administrator of that system if you need more.
        </div>
      </div>
      {renderIntegrationStatus()}
    </>
  );

  const statusText = (st) => {
    if (!st) return 'Checking...';
    if (st.state === 'not_configured') return 'Not configured';
    if (st.connected) return `Connected${st.username ? ` as ${st.username}` : ''}`;
    if (st.state === 'expired') return 'Session expired';
    return 'Not connected';
  };
  const renderIntegrationStatus = () => {
    const list = PROVIDER_ORDER.map((id) => integrations?.[id]).filter(Boolean);
    if (list.length === 0) return null;
    const needsLogin = list.filter((st) => st.configured && !st.connected);
    const syncFailures = syncSystems.filter((s) => s.error);
    const scopeWarnings = list.filter((st) => st.connected && st.scope?.warning);
    return (
      <div className="col-integrations">
        <div className="col-integration-badges" aria-label="POS / Restaurant connection">
          {list.map((st) => {
            const stateClass = st.connected ? 'ok' : (st.state === 'not_configured' ? 'off' : 'warn');
            return (
              <span key={st.provider} className={`col-integration col-integration-${stateClass}`}
                title={st.connected && st.expiresAt ? `Session valid until ${fmtDateTime(st.expiresAt)}` : (st.message || '')}>
                <strong>{SYSTEM_LABELS[st.system] || st.label}</strong> {statusText(st)}
                {st.connected && access && (
                  <span className="col-access-sources">
                    {' '}&middot; {allowedSourcesOf(st.system).length
                      ? allowedSourcesOf(st.system).map((s) => SOURCE_LABELS[s]).join(', ')
                      : 'no collection access'}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        {needsLogin.length > 0 && (
          <div className="col-sync-alert col-sync-warn" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <div>
              <strong>{needsLogin.map((st) => SYSTEM_LABELS[st.system]).join(' and ')} not connected.</strong>{' '}
              Log in to Stock Management with the same username and password as your own account there.
              {' '}Collections are read with your own account and show only what it may see there;
              passwords are never stored (there is no background sync).
            </div>
          </div>
        )}
        {syncFailures.filter((s) => !needsLogin.some((st) => st.system === s.system)).map((s) => (
          <div key={`err-${s.system}`} className="col-sync-alert" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <div>
              <strong>{SYSTEM_LABELS[systemOf(s.system)]}{s.partial ? ' (partly)' : ''} could not be read:</strong> {s.error}
              {' '}The other system is not affected; the records below are the ones already loaded.
            </div>
          </div>
        ))}
        {scopeWarnings.map((st) => (
          // The system only returns the branches of the account (/api/me branch_ids);
          // Stock Management itself applies no department filter.
          <div key={`scope-${st.provider}`} className="col-sync-alert col-sync-warn" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <div>{st.scope.warning}</div>
          </div>
        ))}
      </div>
    );
  };

  // Valid records that are deliberately not collections (overpayment
  // set-offs, voided deductions): an information line, not a warning.
  const renderExcludedNote = () => {
    const withExcluded = loadedSources.filter((s) => s.excluded > 0);
    if (withExcluded.length === 0) return null;
    return (
      <p className="cl-note">
        Not imported (not collections):{' '}
        {withExcluded.map((s) => (
          `${sourceLabel(s)} - ${(s.excludedReasons || []).map((e) => `${e.records} ${e.reason}`).join('; ')}`
        )).join(' | ')}.
      </p>
    );
  };

  const renderSyncBanner = () => {
    if (!sync || loadedSources.length === 0) return null;
    if (syncProblems.length === 0) {
      const read = syncSystems.filter((sys) => (sys.sources || []).some((s) => !s.error));
      return (
        <p className="cl-note">
          {read.map((sys) => {
            const ok = (sys.sources || []).filter((s) => !s.error);
            const fetched = ok.reduce((n, s) => n + s.fetched, 0);
            const added = ok.reduce((n, s) => n + s.inserted + s.updated, 0);
            return `${SYSTEM_LABELS[systemOf(sys.system)]} checked: ${fetched} record${fetched === 1 ? '' : 's'} read from all branches `
              + `(${ok.map((s) => `${SOURCE_LABELS[s.source]} ${s.fetched}`).join(', ')}), ${added} new or updated.`;
          }).join(' ')}
        </p>
      );
    }
    return (
      <div className="col-sync-alert" role="alert">
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <div>
          {syncProblems.map((s) => (
            <div key={`${s.system}-${s.source}`}>
              <strong>{sourceLabel(s)}:</strong>{' '}
              {s.invalid > 0 && (
                <>
                  {s.invalid} record{s.invalid === 1 ? '' : 's'} could not be read and {s.invalid === 1 ? 'was' : 'were'} skipped
                  {s.invalidSamples?.[0] && <> ({s.invalidSamples[0].reason}{s.invalidSamples[0].fields?.length ? `; fields: ${s.invalidSamples[0].fields.join(', ')}` : ''})</>}.
                </>
              )}
              {s.duplicate > 0 && <> {s.duplicate} already-approved reference{s.duplicate === 1 ? '' : 's'} ignored.</>}
              {s.unmapped > 0 && (
                <>
                  {' '}{s.unmapped} record{s.unmapped === 1 ? '' : 's'} from branches without a matching department
                  {' '}(shown as <em>Unmapped</em>; they cannot be approved until the branch maps):
                  <ul className="col-map-errors">
                    {(s.unmappedBranches || []).map((u) => (
                      <li key={u.branch}>{u.reason} ({u.records} record{u.records === 1 ? '' : 's'})</li>
                    ))}
                  </ul>
                  Add or rename the department under Management &rarr; Departments, or ask an administrator to map the branch.
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <form className="col-filter-card" onSubmit={runSearch} role="search" aria-labelledby="col-filter-title">
      <h3 id="col-filter-title" className="col-filter-title">Search</h3>
      <div className="col-filter-grid">
        <div className="form-group">
          <label htmlFor="col-search">Search Bar</label>
          <input id="col-search" type="search" className="form-input"
            placeholder="Shift ref / no, reference, cashier, employee, amount..."
            value={draft.search} onChange={setDraftField('search')} />
        </div>
        <div className="form-group">
          <label htmlFor="col-system">System</label>
          <select id="col-system" value={draft.system} onChange={setDraftField('system')} className="form-select">
            <option value="">All</option>
            {visibleSystems.map((value) => <option key={value} value={value}>{SYSTEM_LABELS[value]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="col-type">Collection Type</label>
          <select id="col-type" value={draft.source} onChange={setDraftField('source')} className="form-select">
            <option value="">All</option>
            {visibleSourceTypes.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="col-department">Department</label>
          <select id="col-department" value={draft.department} onChange={setDraftField('department')} className="form-select">
            <option value="">All Departments</option>
            {departmentOptions.departments.map((d) => (
              <option key={`d${d.id}`} value={`d:${d.id}`}>{d.name}</option>
            ))}
            {departmentOptions.unmapped.length > 0 && (
              <optgroup label="Unmapped branches">
                <option value="unmapped">All unmapped</option>
                {departmentOptions.unmapped.map((u) => (
                  <option key={`u${u.branch}`} value={`u:${u.branch}`}>{u.branch}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="col-from">From Date</label>
          <input id="col-from" type="date" className="form-input" value={draft.fromDate} max={draft.toDate || undefined} onChange={setDraftField('fromDate')} />
        </div>
        <div className="form-group">
          <label htmlFor="col-to">To Date</label>
          <input id="col-to" type="date" className="form-input" value={draft.toDate} min={draft.fromDate || undefined} onChange={setDraftField('toDate')} />
        </div>
      </div>
      <div className="col-filter-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <FontAwesomeIcon icon={loading ? faSpinner : faMagnifyingGlass} spin={loading} /> Search
        </button>
        {tab === 'Pending' && canWrite && (
          <button type="button" className="btn btn-secondary" onClick={() => load({ refresh: true })} disabled={loading}>
            <FontAwesomeIcon icon={faRotateRight} spin={loading} /> Refresh from POS / Restaurant
          </button>
        )}
      </div>
    </form>
  );

  const renderPager = () => (data.pages > 1 ? (
    <div className="col-pager">
      <button type="button" className="btn btn-secondary" disabled={loading || data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span>Page {data.page} of {data.pages} &middot; {data.total} records</span>
      <button type="button" className="btn btn-secondary" disabled={loading || data.page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  ) : null);

  const pendingCols = canWrite ? 15 : 14;

  return (
    <div className="page-container cl-page col-page">
      <header className="page-header">
        <h2 style={{ margin: 0 }}>
          <FontAwesomeIcon icon={faHandHoldingDollar} style={{ marginRight: '8px' }} /> Collection
        </h2>
      </header>

      <div className="card cl-card">
        <div className="cl-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`cl-tab ${tab === t ? 'active' : ''}`} onClick={() => openTab(t)}>
              {t}
              {tab === t && <span className="cl-count">{data.total}</span>}
            </button>
          ))}
        </div>

        {renderFilters()}

        {/* No access: the user's own POS / Restaurant accounts may see no collections. */}
        {accessDenied && renderAccessDenied()}

        {/* ------------------------------ PENDING ------------------------------ */}
        {!accessDenied && tab === 'Pending' && (
          <>
            {!canWrite && (
              <p className="cl-note">View only: these are the collections already loaded from POS / Restaurant. Approving and rejecting are not available for your role.</p>
            )}
            {renderIntegrationStatus()}
            {renderSyncBanner()}
            {renderExcludedNote()}
            <p className="cl-note">Pending collections are <strong>not</strong> posted to any ledger. Only approved records update the ledgers.</p>

            {loading && records.length === 0 ? (
              <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading collections from POS / Restaurant...</div>
            ) : (
              <div className="cl-table-wrap">
                <table className="report-table cl-table col-table">
                  <thead>
                    <tr>
                      {canWrite && (
                        <th className="cl-check-col">
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all pending records" disabled={records.length === 0} />
                        </th>
                      )}
                      <th>Date</th>
                      <th>Shift / Reference No</th>
                      <th>Collection Type</th>
                      <th>Department</th>
                      <th>Payment Method</th>
                      <th className="cl-num">Cash</th>
                      <th className="cl-num">Card</th>
                      <th className="cl-num">Bank / Online</th>
                      <th className="cl-num">AR</th>
                      <th className="cl-num">Short / Excess</th>
                      <th className="cl-num">Amount</th>
                      <th>Company</th>
                      <th>Cashier / Employee</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr><td colSpan={pendingCols} className="cl-empty">No pending collections.</td></tr>
                    ) : records.map((r) => {
                      const checked = selectedIds.includes(r.id);
                      const isDeduction = r.source_type === 'EMPLOYEE_DEDUCTION';
                      const mismatch = totalMismatch(r);
                      return (
                        <tr key={r.id} className={checked ? 'cl-row-selected' : ''} onClick={canWrite ? () => toggleRow(r.id) : undefined}>
                          {canWrite && (
                            <td className="cl-check-col" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={checked} onChange={() => toggleRow(r.id)} aria-label={`Select ${refOf(r)}`} />
                            </td>
                          )}
                          <td>{fmtDate(r.collection_date)}</td>
                          <td>
                            {refCell(r)}
                            {isDeduction && linkedRefOf(r) && <div className="col-sub">for {linkedRefOf(r)}</div>}
                          </td>
                          <td>{SOURCE_LABELS[r.source_type]}</td>
                          <td>{departmentCell(r)}</td>
                          <td>
                            {methodsOf(r).map((m) => <span key={m} className="col-chip">{METHOD_LABELS[m]}</span>)}
                            {r.pos_payment_method && <div className="col-sub">{SYSTEM_LABELS[systemOf(r.source_system)]}: {r.pos_payment_method}</div>}
                          </td>
                          <td className="cl-num">{moneyCell(r.cash_amount)}</td>
                          <td className="cl-num">{cardCell(r, r.card_amount)}</td>
                          <td className="cl-num">{moneyCell(r.bank_amount)}</td>
                          <td className="cl-num">{moneyCell(r.ar_amount)}</td>
                          <td className="cl-num">
                            {isDeduction
                              ? <span className="col-excess">{fmtMoney(r.deduction_amount)} Recovered</span>
                              : shortExcessText(r.short_excess_amount)}
                          </td>
                          <td className="cl-num">
                            <strong>{fmtMoney(r.total_amount)}</strong>
                            {mismatch && <div className="col-warn">{SYSTEM_LABELS[systemOf(r.source_system)]} total {fmtMoney(r.pos_total_amount)}</div>}
                          </td>
                          <td>{r.company_name || <span className="col-warn">{r.pos_company ? `Unmatched: ${r.pos_company}` : 'Not set'}</span>}</td>
                          <td>{r.cashier_name || r.employee_name || '—'}</td>
                          <td>
                            <span className="col-status col-status-pending">Pending</span>
                            {mismatch && <div className="col-warn">Total mismatch</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {records.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={canWrite ? 6 : 5} className="cl-total-label">Total ({totals.count} record{Number(totals.count) === 1 ? '' : 's'} matching the filters)</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.cash)}</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.card)}</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.bank)}</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.ar)}</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.short_excess)}</td>
                        <td className="cl-num cl-total">{fmtMoney(totals.total)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {renderPager()}

            {canWrite && (
              <div className="cl-realise-bar">
                <div className="cl-selection-info">
                  {selectedRows.length > 0 ? (
                    <>
                      <strong>{selectedRows.length}</strong> selected &middot; Rs. <strong>{fmtMoney(selectedRows.reduce((s, r) => s + num(r.total_amount), 0))}</strong>
                      <button type="button" className="cl-link-btn" onClick={() => setSelectedIds([])}>Clear</button>
                    </>
                  ) : 'No records selected'}
                </div>
                <div className="col-actions">
                  <button type="button" className="btn btn-secondary col-reject-btn" onClick={openReject} disabled={loading || selectedRows.length === 0}>
                    <FontAwesomeIcon icon={faBan} /> Reject
                  </button>
                  {/* Approve posts to the ledgers - Accountant only (the API enforces it too). */}
                  {canApproveCollections && (
                    <button type="button" className="btn btn-primary" onClick={openApprove} disabled={loading || selectedRows.length === 0}>
                      <FontAwesomeIcon icon={faCheck} /> Approve
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ------------------------------ COMPLETED ------------------------------ */}
        {!accessDenied && tab === 'Completed' && (loading ? (
          <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
        ) : (
          <div className="cl-table-wrap">
            <table className="report-table cl-table col-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift / Reference</th>
                  <th>Collection Type</th>
                  <th>Department</th>
                  <th>Payment Method</th>
                  <th className="cl-num">Cash</th>
                  <th className="cl-num">Card</th>
                  <th className="cl-num">Bank</th>
                  <th className="cl-num">AR</th>
                  <th className="cl-num">Short / Excess</th>
                  <th className="cl-num">Amount</th>
                  <th>Company</th>
                  <th>Bank Account</th>
                  <th>Approved By</th>
                  <th>Approved Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={16} className="cl-empty">No completed collections.</td></tr>
                ) : records.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.collection_date)}</td>
                    <td>
                      {refCell(r)}
                      {linkedRefOf(r) && <div className="col-sub">for {linkedRefOf(r)}</div>}
                    </td>
                    <td>{SOURCE_LABELS[r.source_type]}</td>
                    <td>{departmentCell(r)}</td>
                    <td>{String(r.payment_methods || '').split(',').filter(Boolean).map((m) => <span key={m} className="col-chip">{METHOD_LABELS[m] || m}</span>)}</td>
                    <td className="cl-num">{moneyCell(r.posted_cash)}</td>
                    <td className="cl-num">
                      {cardCell(r, r.posted_card, true)}
                      {r.card_ledger_status && <div className="col-sub">Card Ledger: {r.card_ledger_status}</div>}
                    </td>
                    <td className="cl-num">{moneyCell(r.posted_bank)}</td>
                    <td className="cl-num">{moneyCell(r.posted_ar)}</td>
                    <td className="cl-num">
                      {r.source_type === 'EMPLOYEE_DEDUCTION'
                        ? <span className="col-excess">{fmtMoney(Math.abs(num(r.posted_short_excess)))} Recovered</span>
                        : shortExcessText(r.posted_short_excess)}
                    </td>
                    <td className="cl-num"><strong>{fmtMoney(r.total_amount)}</strong></td>
                    <td>{r.company_name || '—'}</td>
                    <td>
                      {r.bank_account_name && <div>{r.bank_account_name}</div>}
                      {r.card_bank_account_name && <div className="col-sub">Card: {r.card_bank_account_name}</div>}
                      {!r.bank_account_name && !r.card_bank_account_name && '—'}
                    </td>
                    <td>{r.approved_by_name || '—'}</td>
                    <td>{fmtDate(r.approved_at)}</td>
                    <td><span className="col-status col-status-completed">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPager()}
          </div>
        ))}

        {/* ------------------------------ REJECTED ------------------------------ */}
        {!accessDenied && tab === 'Rejected' && (loading ? (
          <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
        ) : (
          <>
            <div className="cl-table-wrap">
              <table className="report-table cl-table col-table">
                <thead>
                  <tr>
                    {canWrite && <th className="cl-check-col" aria-label="Select" />}
                    <th>Date</th>
                    <th>Shift / Reference</th>
                    <th>Collection Type</th>
                    <th>Department</th>
                    <th className="cl-num">Amount</th>
                    <th>Company</th>
                    <th>Cashier / Employee</th>
                    <th>Rejected By</th>
                    <th>Rejected Date</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={canWrite ? 12 : 11} className="cl-empty">No rejected collections.</td></tr>
                  ) : records.map((r) => (
                    <tr key={r.id}>
                      {canWrite && (
                        <td className="cl-check-col">
                          <input type="checkbox" checked={rejectedSelected.includes(r.id)} aria-label={`Select ${refOf(r)}`}
                            onChange={() => setRejectedSelected((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                        </td>
                      )}
                      <td>{fmtDate(r.collection_date)}</td>
                      <td>{refCell(r)}</td>
                      <td>{SOURCE_LABELS[r.source_type]}</td>
                      <td>{departmentCell(r)}</td>
                      <td className="cl-num">{fmtMoney(r.total_amount)}</td>
                      <td>{r.company_name || r.pos_company || '—'}</td>
                      <td>{r.cashier_name || r.employee_name || '—'}</td>
                      <td>{r.rejected_by_name || '—'}</td>
                      <td>{fmtDate(r.rejected_at)}</td>
                      <td className="col-reason">{r.rejection_reason}</td>
                      <td><span className="col-status col-status-rejected">Rejected</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderPager()}
            {canWrite && (
              <div className="cl-realise-bar">
                <div className="cl-selection-info">
                  Rejected records are never posted to a ledger. {rejectedSelected.length > 0 && <><strong>{rejectedSelected.length}</strong> selected</>}
                </div>
                <button type="button" className="btn btn-secondary" onClick={restoreSelected} disabled={submitting || rejectedSelected.length === 0}>
                  <FontAwesomeIcon icon={faUndo} /> Move back to Pending
                </button>
              </div>
            )}
          </>
        ))}
      </div>

      {/* ------------------------------ APPROVE DIALOG ------------------------------ */}
      {approveOpen && (
        <div className="cl-modal-overlay" onClick={() => !submitting && setApproveOpen(false)}>
          <div className="cl-modal cl-modal-wide col-modal" role="dialog" aria-modal="true" aria-labelledby="col-approve-title" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <div>
                <h3 id="col-approve-title">Approve {selectedRows.length} Collection{selectedRows.length === 1 ? '' : 's'}</h3>
                <div className="cl-modal-sub">Approved amounts are posted to the ledgers below. This cannot be repeated.</div>
              </div>
              <button type="button" className="cl-modal-close" onClick={() => setApproveOpen(false)} aria-label="Close" disabled={submitting}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="cl-modal-body">
              <div className="cl-table-wrap">
                <table className="report-table cl-table col-approve-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Posts to</th>
                      <th className="cl-num">Amount</th>
                      <th>Company</th>
                      <th>Bank Account (Online)</th>
                      <th>Card Settlement Bank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.map((r) => {
                      const input = approveInputs[r.id] || {};
                      const companyId = r.company_id ? String(r.company_id) : input.company_id;
                      const options = banksForCompany(companyId);
                      const methods = methodsOf(r);
                      const bankSelect = (field) => (
                        <select className="form-select" value={input[field] || ''} onChange={(e) => setInput(r.id, field, e.target.value)} disabled={!companyId}>
                          <option value="">{!companyId ? 'Select company first' : options.length === 0 ? 'No active accounts' : 'Select account'}</option>
                          {options.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
                        </select>
                      );
                      return (
                        <tr key={r.id}>
                          <td>
                            {refCell(r)}
                            <div className="col-sub">{fmtDate(r.collection_date)}{r.department_name ? ` · ${r.department_name}` : ''}</div>
                          </td>
                          <td className="col-posts">
                            {methods.map((m) => {
                              const target = {
                                CASH: 'Cash Ledger', CARD: 'Card Ledger (Pending)', BANK: 'Bank Ledger', AR: 'AR Account',
                                SHORT_EXCESS: r.source_type === 'EMPLOYEE_DEDUCTION' ? 'Short/Excess Account (Credit)' : 'Short/Excess Account'
                              }[m];
                              const amount = r.source_type === 'EMPLOYEE_DEDUCTION' ? r.deduction_amount
                                : { CASH: r.cash_amount, CARD: r.card_amount, BANK: r.bank_amount, AR: r.ar_amount, SHORT_EXCESS: r.short_excess_amount }[m];
                              const cardEntries = m === 'CARD' && r.source_type === 'SHIFT' && r.card_txn_count
                                ? ` - ${r.card_txn_count} individual entr${Number(r.card_txn_count) === 1 ? 'y' : 'ies'}` : '';
                              return <div key={m}>{METHOD_LABELS[m]} {fmtMoney(Math.abs(num(amount)))} &rarr; {target}{cardEntries}</div>;
                            })}
                            {arSettlementOf(r) > 0 && (
                              <div>AR settled {fmtMoney(arSettlementOf(r))} &rarr; AR Account (Credit)</div>
                            )}
                          </td>
                          <td className="cl-num">{fmtMoney(r.total_amount)}</td>
                          <td>
                            {r.company_id ? r.company_name : (
                              <select className="form-select" value={input.company_id || ''} onChange={(e) => setInput(r.id, 'company_id', e.target.value)}>
                                <option value="">Select company</option>
                                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}
                          </td>
                          <td>{methods.includes('BANK') ? bankSelect('bank_account_id') : <span className="col-zero">—</span>}</td>
                          <td>{methods.includes('CARD') ? bankSelect('card_bank_account_id') : <span className="col-zero">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {dialogError && <div className="cl-modal-error" role="alert">{dialogError}</div>}
            </div>
            <div className="cl-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setApproveOpen(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitApprove} disabled={submitting}>
                {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Approving...</> : <><FontAwesomeIcon icon={faCheck} /> Confirm Approve</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------ REJECT DIALOG ------------------------------ */}
      {/* ------------------------- INDIVIDUAL CARD PAYMENTS ------------------------- */}
      {cardView && (
        <div className="cl-modal-overlay" onClick={() => setCardView(null)}>
          <div className="cl-modal cl-modal-wide col-modal" role="dialog" aria-modal="true" aria-labelledby="col-card-title" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <div>
                <h3 id="col-card-title">Card Payments - {SYSTEM_LABELS[systemOf(cardView.row.source_system)]} Shift {displayRef(cardView.row)}</h3>
                <div className="cl-modal-sub">
                  {fmtDate(cardView.row.collection_date)}
                  {cardView.row.department_name ? ` · ${cardView.row.department_name}` : ''}
                  {cardView.row.company_name ? ` · ${cardView.row.company_name}` : ''}
                  {' '}· each payment is its own Card Ledger entry
                </div>
              </div>
              <button type="button" className="cl-modal-close" onClick={() => setCardView(null)} aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="cl-modal-body">
              {cardView.loading && <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading card payments...</div>}
              {cardView.error && <div className="cl-modal-error" role="alert">{cardView.error}</div>}
              {!cardView.loading && !cardView.error && !cardView.data?.available && (
                <div className="col-sync-alert" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <div>{SYSTEM_LABELS[systemOf(cardView.row.source_system)]} sent no individual card payments for this shift, so its card amount cannot be posted to the Card Ledger.</div>
                </div>
              )}
              {cardView.data?.legacy_single_entry && (
                <p className="cl-note">
                  This shift was approved before card payments were posted individually: its card amount
                  ({fmtMoney(cardView.data.legacy_single_entry.amount)}) is ONE Card Ledger entry
                  ({cardView.data.legacy_single_entry.status || 'Pending'}). It is not posted again.
                </p>
              )}
              {cardView.data?.available && (
                <>
                  {!cardView.data.reconciled && !cardView.data.legacy_single_entry && (
                    <div className="col-sync-alert" role="alert">
                      <FontAwesomeIcon icon={faTriangleExclamation} />
                      <div>
                        Card cannot be posted: {cardView.data.problem}. Nothing is changed or balanced automatically -
                        check this shift's card payments in {SYSTEM_LABELS[systemOf(cardView.row.source_system)]}.
                      </div>
                    </div>
                  )}
                  <div className="cl-table-wrap">
                    <table className="report-table cl-table col-card-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Date / Time</th>
                          <th>Type</th>
                          <th>Receipt / Reference</th>
                          <th>Payment</th>
                          <th>Card Ledger Reference</th>
                          <th className="cl-num">Amount (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cardView.data.payments.map((p, i) => (
                          <tr key={p.key}>
                            <td>{i + 1}</td>
                            <td>{fmtDateTime(p.date_time) || fmtDate(p.date)}</td>
                            <td>{CARD_TYPE_LABELS[p.pos_type] || p.pos_type || '—'}</td>
                            <td>
                              {p.receipt_no || '—'}
                              <div className="col-sub">
                                {[p.sale_id && `Sale #${p.sale_id}`, p.order_id && `Order #${p.order_id}`].filter(Boolean).join(' · ')}
                              </div>
                            </td>
                            <td>{p.payment_method === 'card_and_cash' ? 'Card (card + cash sale)' : 'Card'}</td>
                            <td>
                              {p.card_ledger_reference}
                              <div className="col-sub">
                                {p.card_ledger_status ? `Card Ledger: ${p.card_ledger_status}`
                                  : (cardView.data.legacy_single_entry ? 'Included in the single entry' : 'Not posted yet')}
                              </div>
                            </td>
                            <td className="cl-num">{fmtMoney(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="cl-total-row">
                          <td colSpan={6} className="cl-total-label">Card payments ({cardView.data.count})</td>
                          <td className="cl-num cl-total">{fmtMoney(cardView.data.total)}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="cl-total-label">Shift card total ({SYSTEM_LABELS[systemOf(cardView.row.source_system)]})</td>
                          <td className="cl-num">{fmtMoney(cardView.data.card_total)}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="cl-total-label">Difference</td>
                          <td className={`cl-num ${Math.abs(num(cardView.data.difference)) > 0.009 ? 'col-short' : ''}`}>
                            {fmtMoney(cardView.data.difference)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="cl-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCardView(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="cl-modal-overlay" onClick={() => !submitting && setRejectOpen(false)}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-labelledby="col-reject-title" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <div>
                <h3 id="col-reject-title">Reject {selectedRows.length} Collection{selectedRows.length === 1 ? '' : 's'}</h3>
                <div className="cl-modal-sub">{selectedRows.map(refOf).join(', ')}</div>
              </div>
              <button type="button" className="cl-modal-close" onClick={() => setRejectOpen(false)} aria-label="Close" disabled={submitting}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="cl-modal-body">
              <div className="form-group">
                <label htmlFor="col-reject-reason">Rejection Reason <span className="required">*</span></label>
                <textarea id="col-reject-reason" className="form-input" rows={3} maxLength={REASON_MAX} autoFocus
                  value={rejectReason} onChange={(e) => { setRejectReason(e.target.value); setDialogError(''); }} />
                <span className="form-helper">Rejected records are not posted to any ledger. {REASON_MAX - rejectReason.length} characters left.</span>
              </div>
              {dialogError && <div className="cl-modal-error" role="alert">{dialogError}</div>}
            </div>
            <div className="cl-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRejectOpen(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="btn btn-primary col-reject-btn" onClick={submitReject} disabled={submitting}>
                {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Rejecting...</> : <><FontAwesomeIcon icon={faBan} /> Confirm Reject</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Collection;
