# BSMS: Security and Financial-Integrity Re-Audit

> **Status update 2026-10-20:** this report is historical. Current fix status of every finding is in [security-financial-reaudit-2026-10-15.md](security-financial-reaudit-2026-10-15.md). Fixed since: H3, H4, H5 (hard deletes), H6 (mostly), H7, M3, M5, M7, R1–R10 and the C1–C3, N1–N9 items below. Accepted: M8 (no company scoping), R2 (Store Keeper pays suppliers). Still open: C4, C5 (design), H5 expense approval, M4, N1-tail (needs the RAVON Laravel apps).

**Scope:** `server/` at `de0a965` (2026-10-14). This is a delta audit against [security-financial-audit-2026-10-12.md](security-financial-audit-2026-10-12.md) (written at `189c342`).
**Method:** Manual review of every commit since `189c342` (`7fbe2d6`, `a48790c`, `57f2ffd`, `e290e50`, `d3d23c9`, `de0a965`). Each earlier finding was re-checked at HEAD. Exploitability was confirmed with `node` where possible. Secrets were compared by SHA-256 prefix only; no secret values were read or printed.

---

## Fix status (2026-10-14, uncommitted working tree)

| ID | Status | Change |
|---|---|---|
| N1 | **Fixed** (host binding in the signature still to do) | `integrationAuthService.buildUrl()` refuses any URL whose parsed origin differs from the configured base URL, or that has userinfo. Plain `http` is refused when `NODE_ENV=production`. `collectionSyncService.fetchAllRecords()` follows `next_page_url` only through `isSameOrigin()`. Signing the host (BSMS-SIG-2) needs the Laravel side and is **not** done. |
| N2 | **Fixed** | `collections.completed_ref_key` (generated, `PERSISTENT`) + `UNIQUE uq_collections_completed_ref`. Added at boot by `config/db.js`; manual SQL in `migrations/033_…sql`. `approveCollections` sets a `SAVEPOINT` per record: on `ER_DUP_ENTRY` it rolls back **that record only** and returns it in `skipped` with the reason ("approved at the same moment as collection #N by <user>"); the rest of the batch is approved. A copy of an already-approved reference is also skipped (not a batch-wide 409). The UI shows skips as a warning. Verified with a real two-connection race on MariaDB 10.4. |
| N3 | **Fixed** | `users.token_version` (added at boot). Login and refresh tokens carry `tv`. `middleware/authenticate.js` re-reads status, role and `token_version` per request (`services/sessionUser.js`, 30 s cache) and fails closed with a 503 if the DB is down. `/refresh-token` now requires a valid session in the header and issues the current role. A password change bumps `token_version` and returns a new token, which the client stores. **Every user must log in once after deploy** (older tokens have no `tv`). |
| N4 | **Fixed** (11 call sites) | `utils/actor.js` `actorId(req)` is used in `financeController` (cash receive, cash opening balance, cash↔bank transfer, bank→bank transfer), `intercompanyController`, `supplierCreditController`, `cashOtherLedgerController`, `orderController` and `purchaseController` (create, update, payment, 2× supplier credit). `resolveUserId` and its "first user in the table" fallback were removed. |

| N5 | **Fixed**; branch scope **not needed (business decision, 2026-10-14)** | Finance = Management + Expenses only (no Collection, no POS / Restaurant endpoints, and its BSMS password is no longer relayed to RAVON at login). **Approve** is Accountant only: new `writeRoles` on `/collections/approve` in `config/rolePermissions.js`, re-checked in `collectionController.approve`, Approve button hidden for others (`canApproveCollections`). Reject / Restore stay with Accountant, Admin, Super Admin. **Branch scope:** the Accountant role (users accountant1 and accountant2) must see and approve every branch, so `user_collection_scope` is deliberately not built. Revisit if a branch-specific accountant is ever added. |

### Priority 1 (security) - 2026-10-14

| # | Item | Status | Change |
|---|---|---|---|
| 1 | N6 secrets in git | **Fixed locally - push pending (owner)** | DB dump, client/build.zip and node_modules untracked; .gitignore extended. History rewritten (filter-branch) on all local branches + tag: server/.env, server.zip, bakery system db.sql, client/build.zip are in 0 commits; main content byte-identical. Backup: BSMS-backups/repo-pre-history-purge-20261014.bundle. **Production DB password must still be rotated** (unchanged since the leak). |
| 2 | M6 login brute force | **Fixed** | services/loginThrottle.js: 5 failures lock an account 15 min, 50 per IP (env-tunable); unknown users cost a dummy bcrypt; inactive revealed only with the right password. Password policy: 8+ chars, not current/username, <= 72 bytes, bcrypt cost 12. |
| 3 | L2 /uploads public | **Fixed** | utils/signedUploads.js: 2h HMAC-signed image links, 403 otherwise; image extensions only, nosniff + sandbox CSP; upload filter checks the extension (stored-XSS via .html closed). |
| 4 | L3 CORS / headers | **Fixed** | middleware/httpSecurity.js: CORS_ORIGINS allow-list (**required in production .env**), security headers, explicit 100kb JSON limit (was already Express's default). |
| 5 | L4 JWT | **Fixed** | 12h lifetime, iss=bsms / aud=bsms-web verified. |
| 6 | Wrong current password logged users out | **Fixed** | 400 instead of 401; client shows the server message. |
| 7 | M2 password relay | **Fixed** | Relay opt-in only (RAVON_LOGIN_RELAY=on); a broken server key no longer silently falls back to sending passwords. |
| 8 | N1 host binding (BSMS-SIG-2) | **Not started** | Needs the Cafe and Restaurant repos and a joint deploy; Ravon-Restaurant-New currently has an unfinished merge (and tracks its .env). Strict-origin check from N1 already blocks the fake-host path. |

### Found later on 2026-10-14

| ID | Sev | Item | Status |
|---|---|---|---|
| N8 | **CRITICAL** | config/db.js (re)created 7 logins (admin, superadmin, both accountants, finance, ...) with **passwords written in the source** on every start, and re-activated a disabled `finance`. In the local copy of production data, **accountant - 1, accountant - 2 and finance still used those passwords.** | **Fixed in code** - no accounts or passwords at start-up; `scripts/createUser.js` (hidden prompt, same password rules, reset signs out). **Owner action: change those 3 passwords in production** - the old ones remain in git history. |
| N9 | HIGH | Cheque release posted ledger rows dated **0000-00-00** for DB date values (auto release, bank-leg safety net, registry re-release); they drop out of every date-range report. No real rows affected yet. | **Fixed** - utils/dateOnly.toYmd; registry PATCH rejects bad dates. |
| N7 | LOW | Tests hung / touched the real DB / staffLoans never ran. | **Fixed** - `npm test` (unit, no DB), `npm run test:db` on a separate *_test database (`npm run test:db:setup`). CI workflow still to do. |

Tests: `tests/securityHigh.test.js` (14 tests incl. N5, no DB needed) plus an updated C1 test in `securityCritical.test.js`. Full suite: 189/191 pass. The two file-level failures are `chequeReleaseConsistency` (fails identically on the unmodified code) and a Windows libuv crash under `--test-force-exit` (`securityHigh` passes 12/12 when run without that flag). `staffLoans.test.js` cannot run because `tests/helpers/sqliteMysqlAdapter.js` was never committed. When that file is restored, it also needs `tv: 0` in its tokens and matching `users` rows.

---

## 0. What the system is (unchanged, and it still limits this audit)

| Brief assumes | Reality at HEAD |
|---|---|
| External sales platform **pushes** orders via webhook/API | No inbound sales endpoint. BSMS **pulls** shift, credit-payment and deduction **totals** from RAVON POS and RAVON Restaurant. Two pull modes: per-user Bearer tokens, or (new) **ECDSA-signed server requests** (`integrationAuthService.js:156-210`). |
| Sales lines (SKU, qty, price, discount, tax) | **None.** Only payment-method totals per shift. External sales **never deplete stock** and **cannot be matched to COGS**. |
| FIFO / weighted-average costing | Neither. Stock = live `SUM()` of movements; the only valuation is qty × **last purchase price** (`analystController.js:182-199`). |
| Double-entry GL, chart of accounts, P&L engine, period close | **None exist.** `grep` finds no `journal`, `accounting_period`, `lock_date`, `fiscal`, `profit`, `cogs` or `revenue` posting anywhere in `server/`. |
| Branch-scoped users | No BSMS-side branch binding. Branch scope exists **only** in per-user integration mode, and only for collections. |

So domains 2–4 of the brief (valuation, double entry, P&L) are mainly **design gaps**, not patchable bugs. The target designs in §5 of the 10-12 report still apply.

---

## 1. Status of the 2026-10-12 findings

| ID | Title | Status at `de0a965` | Evidence |
|---|---|---|---|
| C1 | Committed weak `JWT_SECRET` | **Mostly fixed** | `.env` untracked; `.gitignore` covers `.env*` and `*.zip`. `config/secrets.js` enforces ≥32 bytes, a separate `POS_SESSION_SECRET` and HS256 pinning, and the boot aborts otherwise (`server.js:190`). The local `JWT_SECRET` was rotated (now 64 chars). **Remaining:** see N6. |
| C2 | RBAC bypass via URL case | **Fixed** | `rolePermissions.js:214-221` lower-cases the path and rejects `%2f`/`%5c`. |
| C3 | Pool-level `START TRANSACTION` | **Fixed** | The FG controllers were deleted. `utils/withTransaction.js` was added. No `pool.query('START TRANSACTION'…)` remains. |
| C4 | No double-entry | **Open (design)** | Unchanged. |
| H1 | `/refresh-token` renews forever with stale role | **Open**, now a top item | See N3. |
| H2 | Actor spoofing (`prepared_by`, `created_by`, …) | **Open + new instance** | `purchaseController.js:8-21`, used at `:197, :565, :916, :1854, :1873` (still passes `req.user?.id`, which is always `undefined`). `orderController.js:18`. **New:** `cashOtherLedgerController.js:72` (N4). |
| H3 | AP integrity (`paid_amount` client-set, initial payment not booked) | **Open (latent)** | `purchaseController.js:188-189` uses `requestedPaidAmount` as-is. `:218-236` writes `payment_history` with no `recordCash/BankTransaction`. `updatePurchase` `:576` still takes `paid_amount` from the body. **Re-severity → MEDIUM (latent, no data impact found, 2026-10-14):** all 812 historical "Initial payment" rows (Rs 18,571,704.52) were created 2026-04-09 … 2026-08-07, *before* the cash book started (2026-08-11, with opening balances), so they are covered by the opening balance. The New/Edit Purchase screens no longer render a paid-amount input (always 0 / unchanged). Since 2026-08-11 every invoice’s `paid_amount` is backed by real allocations (0 unexplained), and 0 invoices have a subtotal ≠ sum of items. Remaining risk = a direct API call (any Raw-Material role) marking an invoice paid without a payment, or a future UI change re-adding the input. |
| H4 | Stock: no availability check or locking; adjustments trust the client | **Open** | `issuanceController.js:5-60` has no stock check and no item lock. `adjustmentController.js:293-340` uses client `system_qty`, `unit_price` and `user_name`. |
| H5 | No expense maker–checker; hard deletes | **Open** | 23 `DELETE FROM` statements remain in controllers/routes/services. |
| H6 | Audit trail opt-in via header, mutable | **Open** | `utils/rmAdjustmentAudit.js:1` still gates on `X-RM-Adjustment`. Collection restore still erases `rejected_by` (`collectionService.js:500-504`). |
| H7 | No period close; back-dating | **Open** | No period concept. `financeLedger.js:89-123` computes `balance_after` as *current total + amount* even for back-dated rows. |
| H8 | Last-price valuation, no COGS | **Open (design)** | Unchanged. |
| M1 | `next_page_url` origin check is a string prefix | **Open + escalated** | See N1. |
| M2 | BSMS password relayed to RAVON | **Open (now by design in per-user mode)** | `authController.js:54-56`. Not used when service-key mode is configured (`integrationAuthService.js:867`). |
| M3 | Approver can post amounts they never reviewed | **Open** | No version or hash check in `approveCollections`. |
| M4 | Heuristic payload mapping | **Open** | `collectionMapper.js` alias lists unchanged. |
| M5 | Floating-point money | **Fixed 2026-10-20** (was Open) | e.g. `collectionMapper.js:157-166`, `financeLedger.js:96-98`, `purchaseController.js:23-53`. |
| M6 | No login throttling or password policy | **Open** | `/api/login` has no limiter. `changePassword` (`authController.js:73-101`) has no strength rule and calls `bcrypt.hash(undefined)` when `newPassword` is missing. |
| M7 | Two stock formulas | **Open** | Not touched. |
| M8 | No company/branch isolation | **Open** | Unchanged. Service-key mode widens it for collections (N5). |
| M9 | FG Sales | **Closed (module removed)** | `e290e50` / migration `032`. |
| L1 | `multer` not required | **Fixed** | `server.js:6`. |
| L2 | `/uploads` unauthenticated | **Open** | `server.js:99` is mounted before `authenticate`. |
| L3 | CORS hard-coded, no helmet or body limit | **Open** | `server.js:87-96`. |
| L4 | JWT alg pinning | **Partly fixed** | HS256 is pinned. `iss`/`aud` are missing and lifetime is still 24h (`secrets.js:24`). |
| L5, L6 | Bank→company fallback; legacy role middleware | **Open** | `readOnly.js` is still mounted (`server.js:102`). |

---

## 2. New and escalated findings

| ID | Sev | Title |
|---|---|---|
| N1 | **HIGH** | Cross-origin pagination leak (verified) now also hands an attacker **fresh, valid signed requests** in service-key mode |
| N2 | **HIGH** | Race: two concurrent approvals of a duplicate POS reference both post cash/bank, so revenue is double-counted |
| N3 | **HIGH** | `/refresh-token` (unauthenticated route) re-issues tokens with no DB check; deactivated or demoted users keep access indefinitely |
| N4 | MEDIUM | `cashOtherLedgerController` takes `created_by` from the request body |
| N5 | MEDIUM | Service-key mode silently drops all per-user ability and branch scoping, so every Collection role (incl. Finance) can see and approve every branch |
| N6 | MEDIUM | Residual secret and PII exposure in git: un-purged history, tracked DB dump with bcrypt hashes, source maps, DB credentials unchanged since exposure |
| N7 | LOW | Integration test suite hangs (open DB pool), so the security regression tests cannot gate CI |

---

## [CRITICAL]

There is **no remaining exploitable CRITICAL** at HEAD: C1–C3 are closed. The two CRITICAL items are design gaps that make domains 3–4 of the brief unanswerable:

- **C4: No double-entry ledger.** Collection approval debits Cash/Bank/Card/AR (`collectionService.js:177-289`) but **nothing credits Sales Revenue**. Purchases have no Inventory Dr / AP Cr. Wastage and adjustments post to no loss account. As a result, Debits = Credits cannot be proven and no P&L can be produced. **Fix:** §5.1 of the 10-12 report (`gl_accounts`, `journal_entries`, `journal_lines`, a `postJournal()` that enforces balance in integer cents, idempotent on `(company_id, source_type, source_id)`).
- **C5 (re-classified from H8): No COGS is possible.** RAVON sends no line items, and BSMS values stock at the last purchase price. Revenue and the cost of the exact goods sold can never be matched. **Fix:** §5.2 (perpetual weighted-average cost, frozen on every issue line). Ask RAVON to expose sale lines (`sale_id, sku, qty, net_unit_price, discount, tax`). Until then, label any margin figure "issues to sales departments at WAC (approximation)".

---

## [HIGH]

### N1: Pagination origin check is bypassable, and in service-key mode it becomes a signing oracle
**Where:**
- `services/collectionSyncService.js:179`: `candidate.startsWith(origin)`
- `services/integrationAuthService.js:276-280` `buildUrl()`: accepts **any** absolute URL
- `services/integrationAuthService.js:194`: the signature payload is `METHOD\npath\nquery\nts\nnonce` with **no host**

**Proof (run at HEAD):**
```
origin = https://pos.ravonbakers.lk
"https://pos.ravonbakers.lk.evil.tld/api/integration/employee-deductions?status=all"  ACCEPTED -> host pos.ravonbakers.lk.evil.tld
"https://pos.ravonbakers.lk@evil.tld/x"                                               ACCEPTED -> host evil.tld
```

**Impact:**
- **Per-user mode:** the user's RAVON Bearer token is sent to the attacker host (the same issue as M1).
- **Service-key mode:** BSMS sends the attacker a request carrying a **fresh, unused nonce** and a signature over a path and query **the attacker chose** (they control `next_page_url`). The signature does not bind the host, so the attacker replays it to the real POS within `BSMS_SIGNATURE_MAX_AGE` (5 min). The nonce was never used there, so it is accepted. This defeats the property the 10-13 design doc relies on: *"Someone edits the URL … Refused: the signature covers the path and query."*
- **Precondition:** the attacker must influence a RAVON JSON response. Realistic routes are a MITM on an `http://` base URL (HTTPS is not enforced) or a compromised or misconfigured upstream proxy.

**Fix: strict origin in one place, used by both callers, and HTTPS in production:**
```js
// server/services/integrationAuthService.js  (replace buildUrl)
const expectedOrigin = (P) => {
  const { baseUrl } = config(P);
  if (!baseUrl) throw new PosConfigError(notConfiguredMessage(P), codeOf(P, 'NOT_CONFIGURED'), P.id);
  return new URL(baseUrl).origin;
};

/** True only for the configured origin, with no userinfo (blocks "host@evil" and "host.evil"). */
const isSameOrigin = (P, candidate) => {
  try {
    const u = new URL(candidate);
    return u.origin === expectedOrigin(P) && u.username === '' && u.password === '';
  } catch (error) {
    return false;
  }
};

const buildUrl = (P, pathOrUrl, params) => {
  const origin = expectedOrigin(P);
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${config(P).baseUrl}${String(pathOrUrl).startsWith('/') ? '' : '/'}${pathOrUrl}`;
  if (!isSameOrigin(P, url)) {
    throw new PosConfigError(`Refusing a ${P.label} request to another host`, codeOf(P, 'NOT_CONFIGURED'), P.id);
  }
  if (process.env.NODE_ENV === 'production' && new URL(origin).protocol !== 'https:') {
    throw new PosConfigError(`${P.label} must use https in production`, codeOf(P, 'NOT_CONFIGURED'), P.id);
  }
  if (!params || typeof params !== 'object') return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && !u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
};
// export it:  module.exports.isSameOrigin = (provider, url) => isSameOrigin(providerOf(provider), url);
```
```js
// server/services/collectionSyncService.js:179
next = typeof candidate === 'string' && integrationAuth.isSameOrigin(provider, candidate) ? candidate : null;
```
**Bind the host into the signature as well** (defence in depth: a leaked signature is then useless on any other host). This needs the matching change in both Laravel `VerifyBsmsSignature` middlewares. They must compare against the host **from their own config** (`config('app.url')`), never the request's `Host` header:
```js
// integrationAuthService.js:170, 194
const SIGNATURE_VERSION = 'BSMS-SIG-2';
const payload = [SIGNATURE_VERSION, 'GET', u.host.toLowerCase(), u.pathname, u.search.replace(/^\?/, ''), timestamp, nonce].join('\n');
```
Roll it out by having Laravel accept SIG-1 and SIG-2 for one release, then drop SIG-1. Add a test: `fetchAllRecords` with `next_page_url = "https://pos.example.lk.evil.tld/…"` must make exactly one request.

---

### N2: Duplicate-reference approval race double-posts revenue
**Where:** `services/collectionService.js:362-371` (and the matching staging check at `collectionSyncService.js:219-226`).

The guard *"POS reference already approved under another id"* is a plain `SELECT … status = 'completed'`. Each approval only locks **its own** row (`lockCollection`, `:105-116`). Staging lets two **pending** rows with the same `reference_no` and different `source_id` exist (it only checks against `completed`). If two users approve them at the same time (each selecting one), both `SELECT`s see no completed sibling under REPEATABLE READ, and both post Cash/Bank debits and Card Ledger rows. `uq_ccp_pos_card` does not help because the card key includes `source_id`. There is **no DB constraint** on a completed reference. A single request containing both ids *is* safe, because the second check sees the first's uncommitted write.

**Impact:** cash, bank and card balances, and therefore apparent sales, are overstated by the full shift total. Nothing flags it afterwards.

**Fix: make the database enforce "one completed collection per reference":**
```sql
-- migrations/033_collections_completed_reference_unique.sql
-- 1) must return 0 rows before applying (resolve by hand otherwise)
SELECT source_system, source_type, reference_no, COUNT(*) AS n
  FROM collections
 WHERE status = 'completed' AND reference_no IS NOT NULL
 GROUP BY source_system, source_type, reference_no HAVING n > 1;

-- 2) NULL for every non-completed row, so only completed rows compete for uniqueness
ALTER TABLE collections
  ADD COLUMN completed_ref_key VARCHAR(140)
    AS (IF(status = 'completed' AND reference_no IS NOT NULL,
           CONCAT(source_system, ':', source_type, ':', reference_no), NULL)) STORED,
  ADD UNIQUE KEY uq_collections_completed_ref (completed_ref_key);
```
```js
// services/collectionService.js:453 - the status flip is now the guarded write
let update;
try {
  [update] = await connection.query(
    `UPDATE collections SET status = 'completed', approved_by = ?, approved_at = NOW(), company_id = ?
      WHERE id = ? AND status = 'pending'`,
    [userId, companyId, id]
  );
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409, `POS reference ${label(row)} was approved by someone else just now - nothing was posted`);
  }
  throw error;
}
```
Every posting for that record happens earlier in the same transaction, so the controller's rollback (`collectionController.js:629-642`) discards them all. Keep the existing `SELECT` as the friendly early message. Add the same block to `ensureCollectionsSourceSystem()` in `config/db.js` so the self-migrating schema stays in step.

---

### N3: Token refresh never re-checks the user (H1, still open)
**Where:** `routes/authRoutes.js:13-28` (mounted at `server.js:101`, **before** `authenticate`) and `middleware/authenticate.js:14-16`.

Any unexpired token can be swapped for a fresh 24h token **with the same `role`**. There is no lookup of `users.status` or the current role. A user who is deactivated or demoted keeps their old privileges indefinitely by refreshing at least once every 24 hours. Every request also trusts the JWT `role` claim (`authenticate.js:15`), so nothing on the server can revoke access.

**Fix (adapted to the current `config/secrets.js`):**
```sql
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
-- bump on password change, deactivation and role change:
-- UPDATE users SET token_version = token_version + 1 WHERE id = ?;
```
```js
// server/services/sessionUser.js (new) - the current user record, cached briefly
const pool = require('../config/db');
const TTL_MS = 30 * 1000;
const cache = new Map(); // userId -> { at, user }

const loadActiveUser = async (userId) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  const [rows] = await pool.query('SELECT id, username, role, status, token_version FROM users WHERE id = ?', [id]);
  const user = rows[0] && Number(rows[0].status) === 1 ? rows[0] : null;
  cache.set(id, { at: Date.now(), user });
  return user;
};
const forget = (userId) => cache.delete(Number(userId));
module.exports = { loadActiveUser, forget };
```
```js
// server/middleware/authenticate.js
const jwt = require('jsonwebtoken');
const { getJwtSecret, JWT_VERIFY_OPTIONS } = require('../config/secrets');
const { loadActiveUser } = require('../services/sessionUser');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }
  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), getJwtSecret(), JWT_VERIFY_OPTIONS);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', expired: true });
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const user = await loadActiveUser(decoded.userId);
    if (!user || Number(user.token_version) !== Number(decoded.tv ?? -1)) {
      return res.status(401).json({ error: 'Session is no longer valid', expired: true });
    }
    // Role ALWAYS from the database, never from the token.
    req.user = { ...decoded, userId: user.id, username: user.username, role: user.role };
    return next();
  } catch (error) {
    console.error('authenticate: user lookup failed', error.message);
    return res.status(503).json({ error: 'Authentication temporarily unavailable' });
  }
};
module.exports = authenticate;
```
```js
// server/routes/authRoutes.js - refresh only for a currently active user, with the CURRENT role
router.post('/refresh-token', authenticate, (req, res) => {
  const permissions = ['dashboard', ...getRoleModules(req.user.role)];
  const token = jwt.sign(
    { userId: req.user.userId, username: req.user.username, role: req.user.role, permissions, tv: req.user.tv },
    getJwtSecret(), JWT_SIGN_OPTIONS
  );
  res.json({ token });
});
```
Also add `tv: user.token_version` to the login payload (`authController.js:37`). In `changePassword`, run `UPDATE users SET password = ?, token_version = token_version + 1` and call `forget(userId)`. The client must send the token in the `Authorization` header for refresh; today it posts `{ token }` in the body. Shorten `expiresIn` to `8h` (`secrets.js:24`) once refresh is safe.

---

## [MEDIUM]

### N4: Ledger entries attributed to whoever the client names
**Where:** `controllers/cashOtherLedgerController.js:72`: `const createdBy = req.body.created_by || req.user?.userId;`. This was introduced after H2 was reported, and is the same class of bug.
**Fix:**
```js
const createdBy = Number(req.user?.userId);
if (!Number.isInteger(createdBy) || createdBy <= 0) return res.status(401).json({ error: 'Not authenticated' });
```
Apply the `actorId(req)` helper from H2 (10-12 report) to `purchaseController.js:197/565/916/1854/1873` and `orderController.js:18`, and delete `resolveUserId`. Its "first user in the table" fallback credits Admin with every unattributed purchase.

### N5: Service-key mode removes per-user and per-branch scoping
> **Decision (2026-10-14):** the segregation-of-duties part is fixed (see Fix status). The branch-scope part is **accepted**: both Accountant users (accountant1, accountant2) work across all branches, so the `user_collection_scope` table below is kept only as a reference design in case a branch-specific accountant is added later.

**Where:** `integrationAuthService.js:754-759` (`getUserAccess` returns all `SERVICE_KEY_ABILITIES` and `branchIds: null`) and `rolePermissions.js:68` (Finance now has `collection`).
With the private keys set (the local `.env` has both), every BSMS user with the Collection module (Accountant, **Finance**, QB, Admin, Super Admin) sees, and all but QB can **approve**, every branch's shifts, credit payments and deductions. The per-user design in [per-user-pos-restaurant-access-2026-10-13.md](per-user-pos-restaurant-access-2026-10-13.md) no longer applies, and nothing in the UI says so. A Finance user can also create expenses (`expenses` module), so one person can both record cash in (approve collections) and cash out (pay expenses). That is a segregation-of-duties gap.

**Fix: BSMS-side branch scope that applies in both modes:**
```sql
CREATE TABLE user_collection_scope (
  user_id        INT NOT NULL,
  source_system  ENUM('POS','RESTAURANT') NOT NULL,
  pos_branch_id  VARCHAR(50) NOT NULL,            -- '*' = all branches
  PRIMARY KEY (user_id, source_system, pos_branch_id)
) ENGINE=InnoDB;
```
```js
// services/integrationAccess.js - inside getAccess(), after `collection` is built
const pool = require('../config/db');
if (Object.values(SYSTEMS).some((s) => integrationAuth.usesServiceKey(PROVIDER_OF[s]))) {
  const [rows] = await pool.query(
    'SELECT source_system, pos_branch_id FROM user_collection_scope WHERE user_id = ?', [userId]);
  for (const system of Object.values(SYSTEMS)) {
    if (!integrationAuth.usesServiceKey(PROVIDER_OF[system])) continue;
    const mine = rows.filter((r) => r.source_system === system).map((r) => String(r.pos_branch_id));
    if (mine.length === 0) collection[system].sources = [];          // fail closed: no scope row = nothing
    else if (!mine.includes('*')) collection[system].branchIds = mine;
  }
}
```
`collectionWhere()` already applies `branchIds` to every list, detail, approve, reject and restore (`collectionController.js:649-661`), so no other code has to change. The `branchIds` filter is currently POS-only (`integrationAccess.js:61`); extend it to RESTAURANT if it ever has more than one branch. Whether Finance should **approve** collections (as opposed to view them) is a business call. If not, add `{ prefix: '/collections/approve', modules: [M.COLLECTION], denyRoles: [ROLES.FINANCE_USER] }` to `API_RULES`, plus the same for `/reject` and `/restore`.

### N6: Residual exposure in git
- `server/.env` is in **28 commits** of history and in the historical `server.zip`. History was **not** purged (`git log --all -- server/.env`).
- `DB_USER` and `DB_PASSWORD` in the current local `.env` hash-match the committed history. Locally they are the dev defaults (`root`, empty password). **Confirm the production DB password was rotated** after the exposure, and run the app as a least-privilege MySQL user, not `root`. An append-only audit table (H6) is meaningless if the app account can `DROP TRIGGER`.
- `bakery system db.sql` is still tracked, including `INSERT INTO users` with 3 bcrypt hashes (`:42737`).
- `client/build.zip` (tracked) ships 5 `.map` files, about 13 MB of full client source.
- `server/node_modules` is tracked (1,939 files). Dependency updates bypass `npm ci`/lockfile review.

**Fix:**
```bash
git rm --cached "bakery system db.sql" client/build.zip
```
```bash
git rm -r --cached server/node_modules
```
Add `node_modules/` and `*.sql` (except `server/migrations/`) to `.gitignore`. Then purge the history in a coordinated step:
```bash
git filter-repo --invert-paths --path server/.env --path server.zip --path "bakery system db.sql" --path client/build.zip
```
Force-push, have every clone re-clone, and reset the passwords of the three users in the dump. Build the client with `GENERATE_SOURCEMAP=false`.

### Carried over (fixes in the 10-12 report still apply verbatim)
- **M3: approve what was reviewed.** Return `payload_hash = sha256(raw_payload)` from the list endpoints. Require it per item in `POST /approve`, and compare it after `lockCollection()` (`collectionService.js:344`). This matters more now that N2's fix makes the status flip the guarded write.
- **M4: strict schemas.** Replace the alias lists in `collectionMapper.js` with versioned `ajv` schemas. Quarantine records that don't conform. Add a nightly re-fetch that compares `raw_payload` hashes of `completed` rows, to catch upstream voids and refunds after approval.
- **M5: exact money.** Add `utils/money.js` (BigInt cents). `collectionMapper.toMoney()` (`:157-164`) is the first place to convert, because every ingested amount passes through it.
- **M6: auth hardening.** Add `express-rate-limit` on `/api/login`, a per-username lockout, a minimum length for `newPassword`, and a guard against `undefined`.
- **H3, H4, H5, H6, H7, M7, M8, L2, L3:** no change since 10-12. Use the line references in §1 above.

---

## [LOW]
- **N7:** `node --test tests/securityCritical.test.js tests/integrationServiceKey.test.js tests/integrationAccess.test.js` did not finish within 120s. Something (most likely the `mysql2` pool created when `config/db` is required) keeps the event loop alive. The regression tests for C1/C2 therefore cannot gate CI. **Fix:** in each test file, run `after(() => require('../config/db').end())`, or lazy-require the pool in modules the tests import. Then add `npm test` to CI.
- **Collection restore erases who rejected** (`collectionService.js:500-504`, part of H6). Insert into a `collection_status_history (collection_id, from_status, to_status, reason, user_id, at)` row inside the same transaction before clearing the fields. Also pass `userId` into `restoreCollections`, which currently receives none (`collectionController.js:706`).
- **L4 remainder:** add `issuer`/`audience` to `JWT_SIGN_OPTIONS`/`JWT_VERIFY_OPTIONS` and drop `expiresIn` to `8h` (after N3).

---

## 3. Domain-by-domain answer to the brief

| Domain | Verdict at HEAD |
|---|---|
| 1. Ingestion auth | Strong when service-key mode is used (ECDSA P-256, nonce, 5-min window). **Weakened by N1** (host not signed, origin check bypassable). Per-user mode still relays BSMS passwords (M2). |
| 1. Idempotency | **Good** at the record level: `UNIQUE (source_system, source_type, source_id)`, `UNIQUE (collection_id, payment_method)`, `UNIQUE pos_card_key`, `UNIQUE (source_type, source_id)` on other-ledger rows, `FOR UPDATE` in id order with compare-and-set. **Gap:** duplicate reference under a new id (N2). |
| 1. Payload validation | Heuristic (M4). Money parsed as float (M5). |
| 2. Valuation / COGS | Not implemented (C5). Sales never touch stock. |
| 2. Atomic stock reductions | **None.** No item locks or availability checks on issues, wastage or returns (H4). |
| 2. Adjustments | No approval. The client supplies system qty and unit price. Hard delete. Not posted to any loss account (H4). |
| 3. Double entry / CoA | Absent (C4). AP is an editable column (H3). Initial invoice payments bypass the cash book (H3). |
| 3. Approval workflows | Collections: single-step approve, actor recorded server-side. Expenses: none (H5). |
| 4. P&L / precision | No P&L engine. ~220 float sites (M5). DB columns are `DECIMAL(14,2)`, which is good. |
| 4. Period close | None. Back-dating is allowed everywhere, and stored `balance_after` is wrong for back-dated rows (H7). |
| 5. RBAC | Central default-deny table, case bug fixed (C2). **Role taken from the JWT and never re-checked** (N3). Finance now approves collections (N5). |
| 5. IDOR / branches | Collections: row-level filter enforced on every read and write when in per-user mode. Disabled in service-key mode (N5). Everything else: no company or branch isolation (M8). |
| 6. Audit trail | Opt-in and mutable (H6). Sync runs and rejected payloads are only `console.warn` (`collectionSyncService.js:289-296`). No IP or payload logged. |

---

## 4. Remediation order

| When | Action |
|---|---|
| **Today** | N1 strict origin + HTTPS in production (no Laravel change needed). N2 migration `033` + `ER_DUP_ENTRY` handling. Confirm the production DB password was rotated (N6). |
| **This week** | N3 `token_version` + DB-backed `authenticate`. N4 + H2 `actorId(req)`. N5 (done; branch scope not needed). N7 so tests run in CI. N6 history purge. |
| **2–4 weeks** | BSMS-SIG-2 host binding (with Laravel). M3 payload hash. H3 stop `paid_amount` edits and route initial payments through `makePayment`. H4 item locking + adjustment maker–checker. H5 expense approval + void-not-delete. H6 `audit_log` + `integration_sync_log`. M6. |
| **Quarter** | C4 GL + posting map. H7 period close. C5/§5.2 WAC + RAVON sale lines. M4 strict schemas + reconciliation job. M5 money migration. M8 company scoping. |

*All line numbers are for commit `de0a965`.*
