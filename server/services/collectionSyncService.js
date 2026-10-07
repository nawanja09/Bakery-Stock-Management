// server/services/collectionSyncService.js
//
// POS -> BSMS staging for the Collection module. It ONLY ever writes
// `collections` rows with status 'pending' and NEVER touches a ledger: posting
// happens when a user approves a record (collectionService.js).
//
// Endpoints (RAVON_POS_API_URL + path; each can be overridden with a full URL):
//   SHIFT               /api/completed-shifts/collection   RAVON_POS_SHIFT_COLLECTION_URL
//   CREDIT_PAYMENT      /api/credit-payments/collection    RAVON_POS_CREDIT_PAYMENTS_URL
//   EMPLOYEE_DEDUCTION  /api/employee-deductions           RAVON_POS_EMPLOYEE_DEDUCTIONS_URL
// Every call goes through posAuthService.posGet: the backend's POS integration
// account (the POS "finance" account in RAVON_POS_USERNAME / RAVON_POS_PASSWORD),
// logged in once and shared by every Stock Management user. Users never sign in
// to the POS. The POS only returns the branches of that account
// (/api/me branch_ids), so it must be an all-branch account. The browser never
// talks to the POS.
//
// Duplicate prevention
//   * UNIQUE (source_type, source_id): a POS record is staged once; re-syncing
//     updates a still-pending row in place and never touches completed/rejected.
//   * A record whose (source_type, reference_no) already belongs to a COMPLETED
//     collection under a different POS id is not staged (reported as duplicate).
//
// All branches / departments
//   No branch or department filter is ever sent, and the BSMS user's own
//   department is never used: the POS returns every branch the integration
//   account may see. Retrieval and department mapping are separate steps.
//
// Department mapping
//   The POS branch (branch.name, e.g. "Cafe - M") is first normalized
//   (departmentMapper.normalizePosBranchName: POS "MASActive" -> "MAS Intimo") -
//   that is the name stored in pos_branch_name and shown; the original stays in
//   raw_payload - then mapped to an EXISTING department (e.g. "Cafe"). A record
//   whose branch maps to no department is still imported, with department_id
//   NULL, reported as unmapped, and refused at approval until it maps (never
//   assigned to a wrong department, never creates one).
//
// Date window (POS start_date / end_date, both inclusive)
//   * No range given: today - RAVON_POS_COLLECTION_LOOKBACK_DAYS (default 7) .. today.
//   * A range From..To (the collection date the user sees = shift CLOSING date in
//     the business time zone): the POS filters shifts by their COMPLETED date,
//     which can be days after closing (verified: closed 25 Sep, completed 28 Sep)
//     and is dated in another time zone. So the POS is asked for
//     From - 1 day .. To + RAVON_POS_COMPLETION_LAG_DAYS (default 14, capped at
//     today). Everything returned is staged; the list then filters exactly on
//     collection_date BETWEEN From AND To (inclusive) in SQL, so no day in the
//     range is skipped and To is fully included.
// Pages are followed through meta.current_page / meta.last_page (the POS sends
// no next-page URL); per_page is raised to cut the number of calls.
const pool = require('../config/db');
const { posGet } = require('./posAuthService');
const { SOURCES, mapPosRecord, extractRecords } = require('./collectionMapper');
const { createDepartmentMatcher, normalizePosBranchName } = require('./departmentMapper');

const MAX_PAGES = 200;
const PER_PAGE = 200;
const MAX_REPORTED_INVALID = 20;
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_COMPLETION_LAG_DAYS = 14;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const businessDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.RAVON_POS_TIMEZONE || 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

// 'YYYY-MM-DD' +/- days, calendar arithmetic only (no time zone involved).
const addDays = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const envInt = (name, fallback, max) => {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
};

/**
 * POS date window for a sync. With { fromDate, toDate } ('YYYY-MM-DD', inclusive)
 * it covers every record whose collection date is in that range (see above).
 */
const dateWindow = (now = new Date(), { fromDate, toDate } = {}) => {
  const today = businessDate(now);
  if (!fromDate && !toDate) {
    const lookback = envInt('RAVON_POS_COLLECTION_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS, MAX_RANGE_DAYS);
    return { start_date: addDays(today, -lookback), end_date: today };
  }
  const to = toDate && toDate < today ? toDate : today;
  const from = fromDate || addDays(to, -envInt('RAVON_POS_COLLECTION_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS, MAX_RANGE_DAYS));
  const lag = envInt('RAVON_POS_COMPLETION_LAG_DAYS', DEFAULT_COMPLETION_LAG_DAYS, 60);
  const end = addDays(to, lag);
  return { start_date: addDays(from, -1), end_date: end < today ? end : today };
};

const withParams = (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
};

// Extra POS query parameters per source. Employee deductions: the POS answers
// only status=active ones by default; every deduction in the range is wanted
// (verified: status=all is accepted). Cancelled ones are refused by the mapper.
const SOURCE_PARAMS = {
  [SOURCES.EMPLOYEE_DEDUCTION]: { status: 'all' }
};

const ENDPOINTS = () => {
  const baseUrl = (process.env.RAVON_POS_API_URL || '').replace(/\/+$/, '');
  const url = (override, path) => override || (baseUrl ? `${baseUrl}${path}` : '');
  return {
    [SOURCES.SHIFT]: url(process.env.RAVON_POS_SHIFT_COLLECTION_URL, '/api/completed-shifts/collection'),
    [SOURCES.CREDIT_PAYMENT]: url(process.env.RAVON_POS_CREDIT_PAYMENTS_URL, '/api/credit-payments/collection'),
    [SOURCES.EMPLOYEE_DEDUCTION]: url(process.env.RAVON_POS_EMPLOYEE_DEDUCTIONS_URL, '/api/employee-deductions')
  };
};

// Follows next_page_url / links.next on the same host, or meta.current_page /
// meta.last_page by requesting ?page=N.
const fetchAllRecords = async (url) => {
  const origin = new URL(url).origin;
  const records = [];
  let next = url;
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const current = next;
    const payload = await posGet(next);
    const batch = extractRecords(payload);
    if (batch === null) {
      const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20).join(', ') : typeof payload;
      throw new Error(`POS response did not contain a list of records (fields: ${keys})`);
    }
    records.push(...batch);
    const candidate = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload.next_page_url || payload.links?.next || payload.data?.next_page_url || payload.meta?.next_page_url || null)
      : null;
    next = typeof candidate === 'string' && candidate.startsWith(origin) ? candidate : null;
    const meta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.meta : null;
    if (!next && meta && Number(meta.last_page) > Number(meta.current_page) && batch.length > 0) {
      const u = new URL(current);
      u.searchParams.set('page', String(Number(meta.current_page) + 1));
      next = u.toString();
    }
  }
  return records;
};

const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const COLUMNS = [
  'reference_no', 'collection_date', 'shift_id', 'shift_no', 'shift_reference', 'cashier_name', 'employee_id', 'employee_name',
  'pos_company', 'company_id', 'pos_branch_id', 'pos_branch_name', 'department_id', 'pos_payment_method', 'pos_bank_account',
  'cash_amount', 'card_amount', 'card_txn_count', 'card_txn_total', 'bank_amount', 'ar_amount', 'short_excess_amount', 'deduction_amount',
  'total_amount', 'pos_total_amount', 'raw_payload'
];

/**
 * Stages one mapped record. Never inserts a duplicate:
 *   new                     -> inserted as pending
 *   pending                 -> updated in place when the POS payload changed
 *   completed / rejected    -> untouched
 *   same reference already completed under another POS id -> 'duplicate'
 * @returns {Promise<'inserted'|'updated'|'unchanged'|'duplicate'>}
 */
const stagePending = async (queryable, record) => {
  const [existing] = await queryable.query(
    'SELECT id, status, raw_payload, department_id, pos_branch_name, card_txn_count, card_txn_total FROM collections WHERE source_type = ? AND source_id = ?',
    [record.source_type, record.source_id]
  );

  if (existing.length === 0) {
    if (record.reference_no) {
      const [sameRef] = await queryable.query(
        `SELECT id FROM collections
          WHERE source_type = ? AND reference_no = ? AND source_id <> ? AND status = 'completed' LIMIT 1`,
        [record.source_type, record.reference_no, record.source_id]
      );
      if (sameRef.length > 0) return 'duplicate';
    }
    try {
      await queryable.query(
        `INSERT INTO collections (source_type, source_id, ${COLUMNS.join(', ')}, status, last_synced_at)
         VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, 'pending', NOW())`,
        [record.source_type, record.source_id, ...COLUMNS.map((c) => record[c] ?? null)]
      );
      return 'inserted';
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return 'unchanged'; // a concurrent sync staged it first
      throw error;
    }
  }

  const current = existing[0];
  if (current.status !== 'pending') return 'unchanged';
  if (current.raw_payload === record.raw_payload) {
    // Same POS data; the department mapping / branch name normalization / card
    // payment summary may still have changed (e.g. a department was added,
    // MASActive -> MAS Intimo, or the row was staged before card details existed).
    await queryable.query(
      `UPDATE collections SET department_id = ?, pos_branch_name = ?, card_txn_count = ?, card_txn_total = ?,
              last_synced_at = NOW() WHERE id = ? AND status = 'pending'`,
      [record.department_id ?? null, record.pos_branch_name ?? null, record.card_txn_count ?? null,
        record.card_txn_total ?? null, current.id]
    );
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    const same = (current.department_id ?? null) === (record.department_id ?? null)
      && (current.pos_branch_name ?? null) === (record.pos_branch_name ?? null)
      && num(current.card_txn_count) === num(record.card_txn_count)
      && num(current.card_txn_total) === num(record.card_txn_total);
    return same ? 'unchanged' : 'updated';
  }
  const [update] = await queryable.query(
    `UPDATE collections SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, last_synced_at = NOW()
      WHERE id = ? AND status = 'pending'`,
    [...COLUMNS.map((c) => record[c] ?? null), current.id]
  );
  return update.affectedRows === 1 ? 'updated' : 'unchanged';
};

/**
 * Links pending employee deductions to the shift collection they belong to
 * (same POS shift id / shift reference), so the Short/Excess posting of the
 * deduction can be traced back to the shift's shortage. A deduction the POS
 * sent without a company takes the shift's company.
 */
const linkDeductionsToShifts = async (queryable) => {
  await queryable.query(
    `UPDATE collections d
       JOIN collections s
         ON s.source_type = 'SHIFT'
        AND (s.source_id = d.shift_id OR s.shift_reference = d.shift_id)
        SET d.linked_collection_id = s.id,
            d.company_id = COALESCE(d.company_id, s.company_id)
      WHERE d.source_type = 'EMPLOYEE_DEDUCTION' AND d.status = 'pending'
        AND d.shift_id IS NOT NULL
        AND (d.linked_collection_id IS NULL OR (d.company_id IS NULL AND s.company_id IS NOT NULL))`
  );
};

const loggedErrors = new Set();

const syncSource = async (source, endpoint, { companyByName, matchDepartment, window }) => {
  const result = {
    source, fetched: 0, inserted: 0, updated: 0, unchanged: 0, duplicate: 0,
    invalid: 0, invalidSamples: [], unmapped: 0, unmappedBranches: []
  };
  try {
    if (!endpoint) throw new Error('RAVON_POS_API_URL is not configured');
    const records = await fetchAllRecords(withParams(endpoint, { ...window, per_page: PER_PAGE, ...(SOURCE_PARAMS[source] || {}) }));
    result.fetched = records.length;
    for (let index = 0; index < records.length; index += 1) {
      const mapped = mapPosRecord(source, records[index]);
      if (!mapped.ok) {
        result.invalid += 1;
        if (result.invalidSamples.length < MAX_REPORTED_INVALID) {
          result.invalidSamples.push({ index, reason: mapped.reason, fields: mapped.fields });
        }
        continue;
      }
      const record = mapped.record;
      record.company_id = companyByName.get(normName(record.pos_company)) ?? null;
      // Stock Management name of the POS branch (POS "MASActive" -> "MAS Intimo").
      record.pos_branch_name = normalizePosBranchName(record.pos_branch_name);

      // POS branch -> existing department. Records from EVERY branch are imported;
      // one whose branch matches no department is kept with department_id NULL
      // (shown as "Unmapped", never given a guessed department) and cannot be
      // approved until a department matches. Mapping is re-checked on every sync.
      record.department_id = null;
      if (record.pos_branch_name || source === SOURCES.SHIFT) {
        const match = matchDepartment(record.pos_branch_name);
        if (match.ok) {
          record.department_id = match.department.id;
        } else {
          result.unmapped += 1;
          const label = record.pos_branch_name || '(no branch)';
          const known = result.unmappedBranches.find((u) => u.branch === label);
          if (known) known.records += 1;
          else result.unmappedBranches.push({ branch: label, reason: match.reason, records: 1 });
        }
      }

      const outcome = await stagePending(pool, record);
      result[outcome] += 1;
    }
  } catch (error) {
    // Not shown on the Collection page; kept in the server log (once per message).
    if (!loggedErrors.has(`${source}:${error.message}`)) {
      loggedErrors.add(`${source}:${error.message}`);
      console.warn(`Collection sync - ${source} could not be loaded from the POS: ${error.message}`);
    }
    result.error = error.message;
    result.errorType = error.name;
  }
  return result;
};

// One run per date window at a time.
const inFlight = new Map();

/**
 * Pulls all three POS sources into Pending, from ALL POS departments, for the
 * window of { fromDate, toDate } ('YYYY-MM-DD', inclusive; both optional - see
 * dateWindow). A failing source never blocks the others. Concurrent callers for
 * the same window share one run (opening the Pending tab twice does not hit the
 * POS twice). Returns { window, sources }.
 */
const syncCollections = async ({ fromDate, toDate } = {}) => {
  const window = dateWindow(new Date(), { fromDate, toDate });
  const key = `${window.start_date}..${window.end_date}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const run = (async () => {
    await pool.collectionsSchemaReady;
    const endpoints = ENDPOINTS();
    const [companies] = await pool.query('SELECT id, name FROM company');
    const companyByName = new Map(companies.map((c) => [normName(c.name), c.id]));
    const [departments] = await pool.query('SELECT id, name FROM departments');
    const context = { companyByName, matchDepartment: createDepartmentMatcher(departments), window };

    const sources = [];
    for (const source of Object.values(SOURCES)) {
      sources.push(await syncSource(source, endpoints[source], context));
    }
    await linkDeductionsToShifts(pool);
    return { window, sources };
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, run);
  return run;
};

module.exports = { syncCollections, stagePending, linkDeductionsToShifts, ENDPOINTS, dateWindow, MAX_RANGE_DAYS };
