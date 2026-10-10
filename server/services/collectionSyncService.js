// server/services/collectionSyncService.js
//
// RAVON POS + RAVON Restaurant -> BSMS staging for the Collection module. It
// ONLY ever writes `collections` rows with status 'pending' and NEVER touches a
// ledger: posting happens when a user approves a record (collectionService.js).
// Both systems run the same API and are synced the same way; every staged row
// carries its source_system ('POS' | 'RESTAURANT').
//
// Endpoints (base URL + path; each can be overridden with a full URL):
//   POS         base RAVON_POS_API_URL          overrides RAVON_POS_SHIFT_COLLECTION_URL,
//                                                RAVON_POS_CREDIT_PAYMENTS_URL, RAVON_POS_EMPLOYEE_DEDUCTIONS_URL
//   RESTAURANT  base RAVON_RESTAURANT_API_URL   overrides RAVON_RESTAURANT_SHIFT_COLLECTION_URL,
//                                                RAVON_RESTAURANT_CREDIT_PAYMENTS_URL, RAVON_RESTAURANT_EMPLOYEE_DEDUCTIONS_URL
//   SHIFT               /api/completed-shifts/collection
//   CREDIT_PAYMENT      /api/credit-payments/collection
//   EMPLOYEE_DEDUCTION  /api/employee-deductions
// A system whose base URL is not set is skipped and reported "not configured"
// (not an error, and never an error for the other system).
//
// Authentication: every call goes through integrationAuthService.posGet with
// the token of the latest Finance session of that system (else the requesting
// user's own). No credentials are stored anywhere, so there is NO background /
// unattended sync: a sync runs only when a user opens / refreshes Pending, and
// only while a valid Finance session exists ("Log in with the Finance account
// to sync"). The browser never talks to POS / Restaurant.
//
// Independence: the two systems run in parallel (Promise.allSettled). An
// authentication / network / 5xx failure of one never stops the other from
// importing; each reports its own result. Within a system a failing source
// never blocks the other sources.
//
// Duplicate prevention
//   * UNIQUE (source_system, source_type, source_id): a record is staged once;
//     re-syncing updates a still-pending row in place and never touches
//     completed/rejected. The same id in POS and Restaurant never collides.
//   * A record whose (source_system, source_type, reference_no) already belongs
//     to a COMPLETED collection under a different id is not staged (duplicate).
//
// All branches / departments
//   No branch or department filter is ever sent, and the BSMS user's own
//   department is never used: each system returns every branch its account may
//   see. Retrieval and department mapping are separate steps.
//
// Department mapping (same for both systems)
//   The branch (branch.name, e.g. "Cafe - M") is first normalized
//   (departmentMapper.normalizePosBranchName: "MASActive" -> "MAS Intimo",
//   "MASBrew" -> "MAS Ayathi Brew Bar") -
//   that is the name stored in pos_branch_name and shown; the original stays in
//   raw_payload - then mapped to an EXISTING department (e.g. "Cafe"). A record
//   whose branch maps to no department is still imported, with department_id
//   NULL, reported as unmapped, and refused at approval until it maps (never
//   assigned to a wrong department, never creates one).
//
// Date window (start_date / end_date, both inclusive; the same window and the
// same RAVON_POS_* timing settings are used for both systems)
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
const integrationAuth = require('./integrationAuthService');
const { SYSTEMS, SOURCES, mapSystemRecord, extractRecords } = require('./collectionMapper');
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

// Per system: integration provider, base URL variable and endpoint overrides.
const SYSTEM_CONFIG = {
  [SYSTEMS.POS]: {
    provider: 'pos', baseEnv: 'RAVON_POS_API_URL',
    overrides: {
      [SOURCES.SHIFT]: 'RAVON_POS_SHIFT_COLLECTION_URL',
      [SOURCES.CREDIT_PAYMENT]: 'RAVON_POS_CREDIT_PAYMENTS_URL',
      [SOURCES.EMPLOYEE_DEDUCTION]: 'RAVON_POS_EMPLOYEE_DEDUCTIONS_URL'
    }
  },
  [SYSTEMS.RESTAURANT]: {
    provider: 'restaurant', baseEnv: 'RAVON_RESTAURANT_API_URL',
    overrides: {
      [SOURCES.SHIFT]: 'RAVON_RESTAURANT_SHIFT_COLLECTION_URL',
      [SOURCES.CREDIT_PAYMENT]: 'RAVON_RESTAURANT_CREDIT_PAYMENTS_URL',
      [SOURCES.EMPLOYEE_DEDUCTION]: 'RAVON_RESTAURANT_EMPLOYEE_DEDUCTIONS_URL'
    }
  }
};
const SOURCE_PATHS = {
  [SOURCES.SHIFT]: '/api/completed-shifts/collection',
  [SOURCES.CREDIT_PAYMENT]: '/api/credit-payments/collection',
  [SOURCES.EMPLOYEE_DEDUCTION]: '/api/employee-deductions'
};

/** Endpoint URL per source for a system ('' = not configured). Defaults to POS. */
const ENDPOINTS = (system = SYSTEMS.POS) => {
  const cfg = SYSTEM_CONFIG[system];
  const baseUrl = (process.env[cfg.baseEnv] || '').trim().replace(/\/+$/, '');
  return Object.fromEntries(Object.values(SOURCES).map((source) => [
    source, process.env[cfg.overrides[source]] || (baseUrl ? `${baseUrl}${SOURCE_PATHS[source]}` : '')
  ]));
};

const systemLabel = (system) => integrationAuth.providerOf(SYSTEM_CONFIG[system].provider).label;

// Follows next_page_url / links.next on the same host, or meta.current_page /
// meta.last_page by requesting ?page=N.
const fetchAllRecords = async (url, { provider = 'pos', userId = null } = {}) => {
  const origin = new URL(url).origin;
  const records = [];
  let next = url;
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const current = next;
    const payload = await integrationAuth.posGet(provider, next, null, { userId });
    const batch = extractRecords(payload);
    if (batch === null) {
      const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20).join(', ') : typeof payload;
      throw new Error(`${integrationAuth.providerOf(provider).label} response did not contain a list of records (fields: ${keys})`);
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
 *   same reference already completed under another id of the SAME system -> 'duplicate'
 * Records are identified by (source_system, source_type, source_id): a POS and a
 * Restaurant record with the same id never touch each other. A record without
 * source_system is a POS one (unchanged POS behaviour).
 * @returns {Promise<'inserted'|'updated'|'unchanged'|'duplicate'>}
 */
const stagePending = async (queryable, record) => {
  const system = record.source_system || SYSTEMS.POS;
  const [existing] = await queryable.query(
    `SELECT id, status, raw_payload, department_id, pos_branch_name, card_txn_count, card_txn_total FROM collections
      WHERE source_type = ? AND source_id = ? AND source_system = ?`,
    [record.source_type, record.source_id, system]
  );

  if (existing.length === 0) {
    if (record.reference_no) {
      const [sameRef] = await queryable.query(
        `SELECT id FROM collections
          WHERE source_type = ? AND reference_no = ? AND source_system = ? AND source_id <> ? AND status = 'completed' LIMIT 1`,
        [record.source_type, record.reference_no, system, record.source_id]
      );
      if (sameRef.length > 0) return 'duplicate';
    }
    try {
      await queryable.query(
        `INSERT INTO collections (source_type, source_id, ${COLUMNS.join(', ')}, source_system, status, last_synced_at)
         VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, 'pending', NOW())`,
        [record.source_type, record.source_id, ...COLUMNS.map((c) => record[c] ?? null), system]
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
 * (same shift id / shift reference IN THE SAME SYSTEM - a Restaurant deduction
 * is never linked to a POS shift), so the Short/Excess posting of the
 * deduction can be traced back to the shift's shortage. A deduction sent
 * without a company takes the shift's company.
 */
const linkDeductionsToShifts = async (queryable) => {
  await queryable.query(
    `UPDATE collections d
       JOIN collections s
         ON s.source_type = 'SHIFT'
        AND s.source_system = d.source_system
        AND (s.source_id = d.shift_id OR s.shift_reference = d.shift_id)
        SET d.linked_collection_id = s.id,
            d.company_id = COALESCE(d.company_id, s.company_id)
      WHERE d.source_type = 'EMPLOYEE_DEDUCTION' AND d.status = 'pending'
        AND d.shift_id IS NOT NULL
        AND (d.linked_collection_id IS NULL OR (d.company_id IS NULL AND s.company_id IS NOT NULL))`
  );
};

// Server log only, once per message (scrubbed: never a token).
const loggedErrors = new Set();
const logOnce = (key, message) => {
  const text = integrationAuth.scrub(message);
  if (loggedErrors.has(`${key}:${text}`)) return;
  loggedErrors.add(`${key}:${text}`);
  console.warn(`Collection sync - ${text}`);
};

const syncSource = async (system, source, endpoint, { companyByName, matchDepartment, window, userId }) => {
  const { provider } = SYSTEM_CONFIG[system];
  const result = {
    system, source, fetched: 0, inserted: 0, updated: 0, unchanged: 0, duplicate: 0,
    invalid: 0, invalidSamples: [], excluded: 0, excludedReasons: [], unmapped: 0, unmappedBranches: []
  };
  try {
    if (!endpoint) throw new Error(`${SYSTEM_CONFIG[system].baseEnv} is not configured`);
    const url = withParams(endpoint, { ...window, per_page: PER_PAGE, ...(SOURCE_PARAMS[source] || {}) });
    const records = await fetchAllRecords(url, { provider, userId });
    result.fetched = records.length;
    for (let index = 0; index < records.length; index += 1) {
      const mapped = mapSystemRecord(system, source, records[index]);
      if (mapped.excluded) {
        // Deliberately not a collection (e.g. overpayment set-off): counted, not an error.
        result.excluded += 1;
        const known = result.excludedReasons.find((e) => e.reason === mapped.reason);
        if (known) known.records += 1;
        else result.excludedReasons.push({ reason: mapped.reason, records: 1 });
        continue;
      }
      if (!mapped.ok) {
        result.invalid += 1;
        if (result.invalidSamples.length < MAX_REPORTED_INVALID) {
          result.invalidSamples.push({ index, reason: mapped.reason, fields: mapped.fields });
        }
        continue;
      }
      const record = mapped.record;
      record.company_id = companyByName.get(normName(record.pos_company)) ?? null;
      // Stock Management name of the branch ("MASActive" -> "MAS Intimo",
      // "MASBrew" -> "MAS Ayathi Brew Bar"); same rule for both systems.
      record.pos_branch_name = normalizePosBranchName(record.pos_branch_name);

      // Branch -> existing department. Records from EVERY branch are imported;
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
    const message = integrationAuth.scrub(error.message);
    logOnce(`${system}:${source}`, `${source} could not be loaded from ${systemLabel(system)}: ${message}`);
    result.error = message;
    result.errorType = error.name;
    // e.g. POS_NOT_CONNECTED / RESTAURANT_NOT_CONNECTED (no valid Finance session),
    // *_CREDENTIALS_INVALID, *_AUTH_UNAVAILABLE, *_NOT_CONFIGURED
    result.errorCode = error.code || null;
  }
  return result;
};

const AUTH_ERROR_NAMES = ['PosAuthError', 'PosConfigError'];

/** Totals of one system's sync (what the Collection page reports per system). */
const summarize = (system, sources, extra = {}) => {
  const sum = (field) => sources.reduce((n, s) => n + (Number(s[field]) || 0), 0);
  const failed = sources.filter((s) => s.error);
  const first = failed.find((s) => s.errorCode && AUTH_ERROR_NAMES.includes(s.errorType)) || failed[0];
  const out = {
    system,
    label: systemLabel(system),
    configured: true,
    fetched: sum('fetched'),
    created: sum('inserted'),
    updated: sum('updated'),
    duplicates: sum('duplicate'),
    unmapped: sum('unmapped'),
    invalid: sum('invalid'),
    excluded: sum('excluded'),
    sources,
    ...extra
  };
  if (first) {
    out.error = first.error;
    out.code = first.errorCode || null;
    out.partial = failed.length < sources.length;
  }
  return out;
};

/**
 * One system: its three sources, one after another. Before reading anything a
 * session is resolved once - when there is none (or the system is not
 * configured) the system is reported without calling its data endpoints.
 */
const syncSystem = async (system, context) => {
  const { provider, baseEnv } = SYSTEM_CONFIG[system];
  const endpoints = ENDPOINTS(system);
  if (!Object.values(endpoints).some(Boolean) || !integrationAuth.isConfigured(provider)) {
    return {
      system, label: systemLabel(system), configured: false, skipped: true, status: 'not configured',
      message: `${systemLabel(system)} is not configured (${baseEnv} is not set) - skipped`,
      fetched: 0, created: 0, updated: 0, duplicates: 0, unmapped: 0, invalid: 0, excluded: 0, sources: []
    };
  }
  if (system !== SYSTEMS.POS && typeof pool.collectionsSourceSystemOk === 'function' && !pool.collectionsSourceSystemOk()) {
    // Without collections.source_system its ids could collide with POS ones.
    return summarize(system, [], {
      error: 'The collections.source_system migration has not run (see the server log) - Restaurant records are not imported',
      code: 'SCHEMA_NOT_READY'
    });
  }
  try {
    await integrationAuth.getToken(provider, { userId: context.userId });
  } catch (error) {
    const message = integrationAuth.scrub(error.message);
    logOnce(system, `${systemLabel(system)} skipped: ${message}`);
    return summarize(system, [], { error: message, code: error.code || null, errorType: error.name });
  }
  const sources = [];
  for (const source of Object.values(SOURCES)) {
    sources.push(await syncSource(system, source, endpoints[source], context));
  }
  return summarize(system, sources);
};

// One run per date window (and requesting user) at a time.
const inFlight = new Map();

/**
 * Pulls the three sources of BOTH systems into Pending, from ALL departments,
 * for the window of { fromDate, toDate } ('YYYY-MM-DD', inclusive; both
 * optional - see dateWindow). userId = the requesting BSMS user (its own
 * session is the fallback token source). The systems run in parallel and
 * independently (Promise.allSettled): one failing never stops the other.
 * Concurrent callers for the same window share one run.
 * Returns { window, sources, systems }:
 *   sources - the POS sources, as before (backward compatible)
 *   systems - one entry per system: { system, configured, fetched, created,
 *             updated, duplicates, unmapped, invalid, excluded, sources[], error?, code? }
 */
const syncCollections = async ({ fromDate, toDate, userId = null } = {}) => {
  const window = dateWindow(new Date(), { fromDate, toDate });
  const key = `${window.start_date}..${window.end_date}:${userId ?? ''}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const run = (async () => {
    await pool.collectionsSchemaReady;
    const [companies] = await pool.query('SELECT id, name FROM company');
    const companyByName = new Map(companies.map((c) => [normName(c.name), c.id]));
    const [departments] = await pool.query('SELECT id, name FROM departments');
    const context = { companyByName, matchDepartment: createDepartmentMatcher(departments), window, userId };

    const order = [SYSTEMS.POS, SYSTEMS.RESTAURANT];
    const settled = await Promise.allSettled(order.map((system) => syncSystem(system, context)));
    const systems = settled.map((outcome, i) => (outcome.status === 'fulfilled'
      ? outcome.value
      : summarize(order[i], [], {
        error: integrationAuth.scrub(outcome.reason?.message || 'sync failed'), code: outcome.reason?.code || null
      })));
    try {
      await linkDeductionsToShifts(pool);
    } catch (error) {
      logOnce('link', `linking deductions to shifts failed: ${error.message}`);
    }
    // Backward compatible `sources`: the POS sources (or the POS-level failure on each).
    const pos = systems.find((s) => s.system === SYSTEMS.POS);
    const sources = pos.sources.length || (!pos.error && !pos.skipped) ? pos.sources
      : Object.values(SOURCES).map((source) => ({
        system: SYSTEMS.POS, source, fetched: 0, inserted: 0, updated: 0, unchanged: 0, duplicate: 0, invalid: 0,
        invalidSamples: [], excluded: 0, excludedReasons: [], unmapped: 0, unmappedBranches: [],
        error: pos.error || pos.message, errorType: pos.errorType || 'PosConfigError', errorCode: pos.code || 'POS_NOT_CONFIGURED'
      }));
    return { window, sources, systems };
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, run);
  return run;
};

module.exports = {
  syncCollections, stagePending, linkDeductionsToShifts, ENDPOINTS, SYSTEM_CONFIG, dateWindow, MAX_RANGE_DAYS
};
