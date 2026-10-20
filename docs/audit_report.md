# Security, Business-Logic & Financial-Accounting Audit Report

**Scope:** Stores Operations Web ERP (Bakery-Stock-Management)
**Method:** Static code review of `server/` (controllers, services, middleware, routes, migrations), read-only — no code was changed to produce this report.
**Baseline:** Builds on, and re-verifies, the prior audit at [docs/security-financial-reaudit-2026-10-15.md](security-financial-reaudit-2026-10-15.md). Findings already fixed since that date are marked **RESOLVED**; findings still open are re-stated with their original ID where applicable.

Severity key: **[CRITICAL]** exploitable now, direct financial/data loss or takeover · **[HIGH]** serious integrity/control gap · **[MEDIUM]** real but bounded or requires an unusual path · **[LOW]** hardening / defense-in-depth.

---

## Domain 1 — External Sales API Ingestion & Idempotency

Scope: webhook/API authentication, idempotency and duplicate prevention, payload validation and sanitization for the RAVON POS / RAVON Restaurant sales integration (`server/services/collectionSyncService.js`, `collectionSchema.js`, `collectionMapper.js`, `integrationAuthService.js`).

Architecture note: the integration is **pull-based**, not webhook-based — BSMS calls out to RAVON (per-user Bearer token, or an ECDSA P-256 signed server-key request with nonce + timestamp + same-origin pinning for unattended syncs). There is no public inbound webhook endpoint for this data, which removes an entire class of inbound-webhook-forgery risk by construction.

### [FIXED] M1 — Signed server-key requests have no replay window enforcement at the HTTP layer (fixed 2026-10-20)
The nonce + timestamp are generated and signed client-side (`integrationAuthService.js`), but the audit found no server-side evidence (on the BSMS side) that a *received* signed response's own freshness is independently re-checked before being trusted into the sync pipeline, beyond transport TLS. If RAVON's endpoint is ever reachable over a path without strict TLS pinning, a captured response could be replayed.
**Fix applied:** `signedHeaders()` now returns the nonce/timestamp it generated alongside the request headers, and `serviceGet()` keeps the exact pair used for whichever attempt actually succeeded (a retry signs again, never reusing one). Once a response comes back, `assertFreshResponse()` rejects it if it arrives more than `REPLAY_WINDOW_MS` (5 minutes — matching the "accepts only once, for a few minutes" window RAVON itself honours) after that request was signed, or if the same nonce has already been accepted once (tracked in a short-lived in-memory `seenNonces` map, purged as entries expire — the same short-lived-dedupe shape the fix note asked for, kept in memory rather than a table since nonces only need to live a few minutes). This closes the gap without changing anything about how RAVON verifies the request on its own side.

### [FIXED] M2 — Sync credentials and base URLs are read from `.env` with no startup validation of shape (fixed 2026-10-20)
`RAVON_POS_API_URL`, `RAVON_RESTAURANT_API_URL`, and login/timeout envs are consumed without format/scheme validation; a misconfigured or malicious URL (e.g. pointing at an internal host) would be followed silently.
**Fix applied:** `validateIntegrationUrls()` (`integrationAuthService.js`) runs once from `warmUp()` at server start and checks each configured base URL: it must parse as a URL, must not embed `user:password@` credentials, and (in production) must use `https:`. A URL that fails is logged loudly (`console.error`) and that provider is then treated as unconfigured (`config()` returns `baseUrl: ''` for it) — the same fail-safe behaviour already used elsewhere in this file for an invalid signing key, rather than crashing the whole server over one misconfigured integration.

### [FIXED] M3 — Payload contract validation rejects but does not rate-limit malformed bursts (fixed 2026-10-20)
`collectionSchema.js` validates the `ravon-collections-v1` contract and routes mismatches to quarantine (good — no silent drop), but a compromised or buggy upstream could flood `collection_data_issues` with distinct payloads (the dedupe key includes the payload hash, so every malformed variant creates a new row).
**Fix applied:** `collectionQuarantine.js`'s `recordIssue` (the one chokepoint every quarantine write already goes through) now tracks, in memory per `(system, source)` pair, how many DISTINCT new issue keys it has created in the current rolling hour (`RAVON_QUARANTINE_BURST_LIMIT`, default 50). A re-sighted issue is unaffected (it still just bumps `seen_count` on its own row). Once that pair's new-issue budget for the hour is used up, every further distinct variant is redirected to `recordBurst`, which upserts into one shared row per `(system, source, hour)` — `kind = 'BURST'` (added to the `kind` enum, with a start-up migration for a table created before it existed) — bumping its own `seen_count` and keeping its first sample payload for that hour (never overwritten, consistent with Domain 6 M9's append-only protection on `raw_payload`), instead of writing a new row per variant. A genuine flood now produces one growing row, not thousands.

### [FIXED] L1 — Quarantine payloads are stored up to 60,000 chars unredacted (fixed 2026-10-20)
`collectionQuarantine.js` stores `raw_payload` as-is (no secret redaction pass like `auditLog.js`'s `redact()`). If RAVON ever embeds a token/PII in a malformed payload, it would be stored verbatim in `collection_data_issues`.
**Fix applied:** `recordIssue`/`recordBurst` now store `redact(payload)` (reusing `auditLog.js`'s existing secret-shaped-key scrub) instead of the raw payload. The dedupe hash is computed from the ORIGINAL, unredacted payload text first, so redaction can never merge two genuinely different payloads into one issue — only what gets written to `raw_payload` changes.

### [FIXED] L2 — No automatic alerting on repeated `CHANGED_AFTER_APPROVAL` quarantine (fixed 2026-10-20)
A collection that changes after its money was already posted is correctly *not* re-posted automatically (good), but nothing pages/notifies an accountant — it only appears if someone opens the quarantine screen.
**Fix applied:** there is no email/Slack (or any outbound notification) integration anywhere in this codebase to wire a literal digest into, so rather than inventing a new external channel and its secrets, `collectionQuarantine.checkStaleOpenIssues()` runs daily (`startStaleIssueDigest`, started in `server.js` next to the existing cheque-release processor) and, when any `collection_data_issues` row has sat `OPEN` for more than 24h (`RAVON_QUARANTINE_STALE_HOURS`-equivalent, hardcoded default), writes an `ALERT`/`STALE_QUARANTINE` row into `audit_log` (the same trail Admin/Super Admin already monitor, Domain 6) plus a `console.warn` for server-log watchers — both channels this project already has, with a count and the oldest issue's age so it's actionable without opening the quarantine screen first.

**What's solid:** `UNIQUE(source_system, source_type, source_id)` DB constraint for idempotency, `FOR UPDATE` locking in ascending id order, SHA-256 version fingerprinting to invalidate stale approvals, and quarantine-not-drop on contract mismatch — this is a mature design.

---

## Domain 2 — Inventory Valuation & Cost of Goods Sold (COGS)

Scope: valuation method consistency, atomic stock reductions, stock-adjustment approval and ledger posting (`server/services/stockRules.js`, `rmStockService.js`, `stockAvailability.js`, `controllers/adjustmentController.js`, `controllers/fgProductionController.js`).

### [ACCEPTED DESIGN] H1 — "Latest purchase price as of date" valuation, not FIFO/WAC (re-states prior C5; accepted 2026-10-20)
There is no cost-layer table. RM cost is recomputed per query as `purchase_items.unit_price` of the most recent purchase **on or before the date in question** (`reportController.js`: the stock-value query, the issuance-cost subquery, and the dedicated `getLatestUnitPrice` endpoint all filter `purchase_date <= <as-of date>` before taking the latest row) — this is a deliberate, consistently-applied project requirement, not an oversight, and is not a required fix. It differs from FIFO/WAC in one accepted way: a *backdated* purchase entered after the fact (a late-entered invoice whose `purchase_date` falls before an issuance that already happened) will change that past issuance's recomputed cost on next report run, since there is no per-movement pinned cost snapshot. This residual gap is accepted as part of the same design decision; no `stock_cost_layers` table or FIFO/WAC migration is wanted.

### [FIXED] H2 — FG Production recipe `last_price` is a manually-typed, unreconciled cost (fixed 2026-10-20)
`fgProductionController.js`'s recipe lines stored their own `last_price` per RM ingredient, entered/edited independently of `purchase_items.unit_price`. `rm_cost` roll-ups (and therefore FG margin) were computed against this manually-typed figure, not the real latest purchase price — so margin reporting could silently diverge from actual spend with no reconciliation or alert.
**Fix applied:** `last_price` is no longer accepted from the client at all — `addRecipe`/`updateRecipe` now call `getServerComputedUnitPrice()`, the same "latest purchase price as of date" lookup Domain 2 H1 uses (`purchase_items` joined to `purchases`, `ORDER BY purchase_date DESC, pi.id DESC LIMIT 1`, filtered by `RULES.purchases('p')` to skip deleted invoices). `getRecipesForFg` and the `getRecipesReport` roll-up also recompute `last_price`/`line_cost`/`rm_cost` live via a correlated subquery instead of trusting the stored column, so a margin screen always reflects the current real purchase price, not a stale one from when the recipe line was last saved.

### [FIXED] M4 — RM Stock Adjustment `unit_price` is not sign/shape validated (fixed 2026-10-20)
`adjustmentController.js`'s `getAdjustmentValues` uses the raw `unit_price` without the same strict `moneyMath.isAmount()` gate applied to Financial Adjustment amounts elsewhere in the same file — a negative or non-numeric `unit_price` is not rejected before it feeds a valuation calculation.
**Fix applied:** `getAdjustmentValues` (the one function both `createAdjustment` and `updateAdjustment` call) now rejects with 400 when `unit_price` fails `moneyMath.isAmount()` or is negative, before `variance`/`amount` are computed — closing this for every caller at the one chokepoint, rather than in each route.

### [FIXED] M5 — Approved RM stock adjustments posted to no ledger (fixed 2026-10-20)
`approveAdjustment` flipped the adjustment to effective (it counts in `stockRules.js`'s formula from that point) but made no corresponding financial posting (no COGS/inventory-value journal effect) — it never calls `recordCashTransaction`/`recordBankTransaction`, so H3's fix alone (which only wired that chokepoint) didn't reach it.
**Fix applied:** `adjustmentController.js`'s `approveAdjustment` now calls `postJournalEntry` (exported from `utils/financeLedger.js`, H3's helper) directly, in the same transaction as the approval, whenever the adjustment's stored `amount` (variance × unit price) is non-zero. It posts a balanced `INVENTORY` / `INVENTORY-ADJUSTMENT` pair (no Cash/Bank movement, since a stock count correction moves no money) tagged `reference_type = 'STOCK_ADJUSTMENT'`, `reference_id` = the adjustment's id — so every approved adjustment with a real valuation impact now has a matching, traceable journal line.

### [FIXED] L3 — FG recipe quantity/ingredient-list changes have no maker-checker (narrowed 2026-10-20: `last_price` angle closed by H2; fixed 2026-10-20)
Unlike RM stock adjustments (maker ≠ checker enforced in `approveAdjustment`), editing a recipe's ingredient list or quantities in `fgProductionController.js` takes effect immediately with no second approver. The `last_price` angle this originally flagged is now moot — H2's fix removed manual price entry entirely, so there is no cost value left to self-approve. What remains: a quantity edit still changes RM cost roll-ups (via the now-live price lookup) with no second approver.
**Fix applied:** the audit itself called a real maker-checker workflow here optional, given the low blast radius (quantities are visible on every recipe screen, unlike a hidden price override) — adding one would also need new approval-screen UI that does not exist today. Instead, `updateRecipe` now computes the recipe line's cost-impact swing (old `quantity × last_price` vs the new server-computed value) and, when it is at least `RECIPE_COST_IMPACT_THRESHOLD_PERCENT` (20%), writes an `ALERT`/`RECIPE_COST_IMPACT` row into `audit_log` naming the recipe, the FG item, the before/after line cost and the user who made the change — visible for review in the same audit trail Admin/Super Admin already monitor, without blocking the edit or requiring a second approver.

**What's solid:** atomic `SELECT ... FOR UPDATE` locking that correctly defeats the MySQL REPEATABLE-READ stale-snapshot pitfall (`rmStockService.js`, `stockAvailability.js`), single source-of-truth stock formula (`stockRules.js`) reused everywhere, and genuine maker-checker on stock adjustment approval (self-approval rejected).

---

## Domain 3 — Purchases, Expenses & Double-Entry Bookkeeping

### [FIXED] H3 — No Chart of Accounts / double-entry journal existed anywhere in `server/` (fixed 2026-10-20)
Money movements were recorded as **single-account ledgers**: `finance_transactions` (Cash/Bank), `card_transactions`, `other_ledger_transactions` each held one debit/credit pair *within one account* (e.g. "Cash debit 500, credit 0"), not a balanced pair of entries across two accounts (e.g. Dr. Expense 500 / Cr. Cash 500). The "other side" of a transaction (which expense type, which supplier, which COGS account) lived only in the business table (`expenses`, `purchases`) as a foreign key, never as a mirrored, immutable GL line — so it was not possible to produce a trial balance (sum of all debits = sum of all credits across the whole chart), only per-account running balances.

**Fix applied:** a `journal_entries` / `journal_lines` pair (`config/db.js`'s `ensureJournalSchema`, exposed as `pool.journalSchemaReady`) and `utils/financeLedger.js`'s `recordCashTransaction` / `recordBankTransaction` — the single chokepoint every Cash/Bank poster already goes through — now also write a balanced mirrored pair on every posting, via the new `postJournalEntry` helper:
```sql
CREATE TABLE journal_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entry_date DATE NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id INT NULL,
  description VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE journal_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entry_id BIGINT UNSIGNED NOT NULL,
  account_code VARCHAR(40) NOT NULL,   -- e.g. 'CASH', 'BANK-3', 'ACCOUNTS-PAYABLE-RM'
  debit DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id)
);
-- invariant to check nightly (now holds by construction - every entry is always written balanced):
-- SELECT entry_id FROM journal_lines GROUP BY entry_id HAVING SUM(debit) <> SUM(credit);
```
Each posting gets one `CASH` or `BANK-<id>` line plus a contra line whose `account_code` is keyword-matched off the same `transactionType` string every caller already passes (`CONTRA_ACCOUNT_RULES` in `financeLedger.js` — e.g. `*purchase*` → `ACCOUNTS-PAYABLE-RM`, `*expense*` → `EXPENSES`, `*transfer|withdrawal|deposit*` → `TRANSFER-CLEARING`, unmatched → `GENERAL`), so the sum of debits always equals the sum of credits for that entry by construction, not by convention. The journal write is non-blocking (wrapped in its own try/catch) so a journal problem can never roll back or refuse the real Cash/Bank posting it is describing — it mirrors the ledger, it does not gate it.

**Scope / what's still open:** `card_transactions` and `other_ledger_transactions` are separate single-account ledgers that do not go through this chokepoint, so they are not yet mirrored into the journal — a future increment. RM stock adjustments are now wired too (see M5, fixed alongside this).

### [MEDIUM] M6 — Expense disbursement has no maker-checker; RBAC role is the only control
`newExpenseRoutes.js`'s payment endpoint posts directly to `recordCashTransaction`/`recordBankTransaction` the moment it is called — the "approval" is simply "the caller holds the Expenses module and write capability" (`config/rolePermissions.js`), not a two-person create → approve flow like Collections (`collections/approve`, Accountant-only) or Stock Adjustments (`approveAdjustment`, self-approval rejected). This is consistent with the project's deliberate segregation-of-duties design (Finance role is excluded from Collection specifically so one person can't both record incoming cash and pay it out — see `rolePermissions.js` comment) and is **not** flagged as a defect on its own, but it means a single compromised/malicious Finance/Admin credential can disburse funds with no second signature.
**Recommendation (optional, not a required fix given accepted design):** for payments above a configurable threshold, add a lightweight second-approval step mirroring the existing `approveAdjustment` maker-checker pattern. Flagged MEDIUM rather than HIGH because RBAC + full audit-trail logging of every disbursement already bounds the blast radius and matches the project's stated access model.

### [FIXED] L4 — `periodCloseController.closeRequest` relies entirely on route-level RBAC, no defense-in-depth role check in the controller (fixed 2026-10-20)
Every other privileged action in this controller (`approveRequest`, `rejectRequest`) calls `requireSuperAdmin` inside the controller itself, in addition to the route-level `authorizeApi` gate. `closeRequest` (re-closing a month early) does not — it only checks `requireUser` and the request's current state. Today this is safe only because `/period-close/close` resolves to the generic `/period-close` rule (`PERIOD_CLOSE` module = Admin/Super Admin), but it is one routing-table edit away from a silent privilege widening, and it is inconsistent with the file's own pattern.
**Fix applied:** added `requireAdminOrSuperAdmin()` (mirroring the existing `requireSuperAdmin()`) and call it first inside `closeRequest`'s transaction, exactly as the suggested fix, before `lockRequest` runs — so a routing-table change can no longer silently widen who may close a re-opened period early.

**What's solid:** `periodGuard` middleware refuses any write (`POST/PUT/PATCH/DELETE`) dated into a closed month *before the controller runs*, re-checked a second time inside `utils/financeLedger.js` for every actual posting regardless of which route reached it — genuine defense-in-depth, not a single point of enforcement.

---

## Domain 4 — Real-Time P&L Engine & Financial Precision

### [FIXED] H4 — Revenue vs. COGS matching inherited Domain 2's FG recipe cost gap (re-states H2 in this context; resolved 2026-10-20 alongside H2)
RM valuation itself (Domain 2 H1) is an accepted "latest price as of date" design and was never part of this gap. The remaining cause — FG recipe cost being a manually-typed, unreconciled figure (Domain 2 H2) — is now closed: `last_price` is server-computed from `purchase_items` (never client-supplied), and FG margin queries (`getRecipesForFg`, `getRecipesReport`) recompute it live rather than trusting a stored value. A P&L/margin screen for a finished good now matches revenue against the real current RM spend.

### [RESOLVED] Arithmetic Precision — `utils/money.js` and prior commits close this out
Re-verified fresh against current code: `utils/money.js` parses every value as decimal **text** into a scaled `BigInt`, does all arithmetic on integers, and rounds half-away-from-zero (matching MySQL's own DECIMAL rounding) before converting back to a JS number — this avoids the classic `0.1 + 0.2` binary-float drift entirely. It is consistently used through `utils/financeLedger.js` for every cash/bank balance calculation (`round2`, `add`, `sub`, `mul`). Commits `22c1cb9` and `1d38484` (visible in git log) match this file's stated purpose. This closes the Arithmetic Precision ask; no further fix needed here.
Residual note (not a new finding, just a boundary to keep in mind): callers that pass raw floats *into* `moneyMath` before it parses them (e.g. `Number(req.body.amount)`) still rely on `moneyMath.toUnits`'s own float round-trip at 6 decimals to catch drift — this is already handled (`parseDecimal` takes `.toFixed(6)` of a JS number before scaling), so no action required.

### [FIXED] M7 — Inconsistent application of strict amount validation (re-states Domain 2 M4 at the Domain 4 level; fixed 2026-10-20)
`moneyMath.isAmount()` strict-mode validation is applied to some money inputs (Financial Adjustments) and not others (RM Stock Adjustment `unit_price`, Domain 2 M4). Because P&L figures are only as trustworthy as their weakest input, this gap should be closed everywhere money enters the system, not just where it was first noticed.
**Fix applied:** added `middleware/validateAmounts.js` — a reusable Express middleware factory (`validateAmounts('amount', { allowNegative, required })`) that runs `moneyMath.isAmount()` over named body fields and rejects with 400 before the controller runs, so a new money-bearing route only has to add one line. Wired it onto every Cash/Bank-moving route in `financeRoutes.js` (cash/bank receive, issued, opening balance, transfer, bank-to-bank transfer, intercompany) that previously had no explicit amount-shape check (each had instead relied on `moneyMath.round2`'s silent "invalid input → 0" fallback happening to fail a later `> 0` test — safe by coincidence, not by design). Where the money field sits inside a per-controller helper rather than at the route (`incomeController.createIncome`/`validateIncomePayload`, `cashOtherLedgerController.readCommonFields`, `supplierCreditController.createOverpayment`/`settleCreditToInvoice`, `purchaseController.makePayment` and its `invoice_allocations[].amount`), added the same explicit `moneyMath.isAmount()` gate directly in that helper instead, for the same reason: `unit_price`/`amount` is already fixed at the Domain 2 M4 chokepoint (`adjustmentController.getAdjustmentValues`).

### [FIXED] L5 — Period Closing Immutability is well-built; one gap in re-verification tooling (fixed 2026-10-20)
Re-verified against the current code (not assumed from the prior audit doc): `periodGuard` blocks writes into closed months pre-controller, `periodLock`/`financeLedger.js` re-check at the point of actual posting, and re-opening a closed month requires a Super-Admin-approved, time-boxed `period_reopen_requests` grant — all matching the project's stated period-close rules exactly, and every step (request, approve, reject, close) is captured by the audit trail. The one gap: there is no scheduled job that automatically expires/closes a grant the moment its `expires_at` passes — `is_active` is computed correctly at read time (`expires_at > NOW()`), but nothing *proactively* flips `status` to `Expired` in the row, so a long-forgotten grant stays `Approved` in storage (though functionally inert) and an operator skimming raw `period_reopen_requests` rows rather than the computed view could be misled.
**Fix applied:** added `'Expired'` to the `period_reopen_requests.status` enum (with a start-up migration) and `periodLock.expireOverdueGrants()`, which runs the exact `UPDATE ... SET status='Expired' WHERE status='Approved' AND expires_at <= NOW()` the fix note suggested. `startExpirySweep()` runs it every 15 minutes, started in `server.js` next to the existing cheque-release processor. This changes nothing about enforcement (`is_active`/`expires_at > NOW()` was already correct and is unchanged) — it only keeps the stored `status` column from being misleading.

---

## Domain 5 — Access Control (RBAC) & API Isolation

### [RESOLVED] RBAC separation between Store Keeper and Finance/P&L — correctly enforced
`config/rolePermissions.js` is a genuinely centralized, default-deny RBAC table: `ROLE_MODULES.STORES` grants only `Management, Raw Material, FG Production, Settings` — **no** `Finance`, `Expenses`, `Collection`, `Audit`, `Analyst`, or `Period Close` module. `authorizeApi` middleware (mounted globally for all of `/api` in `server.js`, and again per-router via `moduleAccess.js` as defense-in-depth) evaluates every request against this table and denies by default when no rule matches (`reason: 'no-rule'` → 403, with a console warning so a missing rule is never silently permissive). A Store Keeper account cannot reach any Finance/P&L endpoint regardless of URL manipulation, because the check is role→module, not role→UI-visibility.

### [MEDIUM] M8 — "API tokens restricted to ingestion endpoints only" does not map onto this system's actual architecture — flagging the mismatch, not a vulnerability
There is no inbound API-token-authenticated ingestion endpoint in this codebase for POS/Restaurant sales — confirmed in Domain 1: the integration is **outbound/pull** (BSMS authenticates *to* RAVON with a per-user Bearer token or a signed server key; RAVON never calls into BSMS with a token BSMS must scope). The closest analogue — the signed server-key credential used for unattended syncs — is already scoped narrowly: it carries no session, is used only inside `collectionSyncService.js`'s pull routines, and is never exposed to a client-facing route. Recommendation: if a future requirement adds an inbound webhook or external push endpoint, it must get its **own** dedicated token type, checked by a middleware that allow-lists exactly the ingestion route(s) and nothing else in `rolePermissions.js`'s `API_RULES` — do not reuse the user JWT or the outbound server-key credential for that purpose.

### [LOW] L6 — IDOR is architecturally not applicable to branch/company scoping (by design, per accepted decision), but resource-ID-only lookups are present and worth naming explicitly
Per the accepted M8 design decision (no company/branch scoping — all users with a module see all records in it), routes like `GET /adjustments/:id`, `GET /purchases/:id` etc. intentionally perform no ownership/branch check beyond the module-level RBAC gate — this is correct and expected for this system, not a bug. The one place genuine per-user scoping *is* required and *is* implemented is `services/integrationAccess.js`'s `collectionWhere()`, which correctly restricts which **external POS branch's** collection rows a branch-restricted POS login may see/sync — this is the right place for scoping (an external-system boundary) and it is present and tested. No fix needed; noted so this audit doesn't mistakenly flag intentional full-visibility routes as IDOR.

**What's solid:** single source of truth for every API rule (`API_RULES` in `rolePermissions.js`, mirrored to the client and checked by a cross-drift test), `writeRoles` maker-checker support built into the RBAC layer itself (e.g. `/collections/approve` restricted to Accountant even though other roles hold the `collection` module), and View-Only role enforcement that blocks every mutating verb regardless of module.

---

## Domain 6 — Immutable Audit Trails & API Sync Logs

### [RESOLVED] General audit trail (`audit_log`) is genuinely append-only and well-instrumented
`services/auditLog.js` creates `BEFORE UPDATE` / `BEFORE DELETE` triggers on `audit_log` that `SIGNAL` an error, so **no application code path — not even an Admin — can alter or remove a row** short of direct DBA access with `TRIGGER`/`DROP` privilege, and the recommended setup (`AUDIT_DB`, `scripts/createAppDbUser.js`) restricts the app's own DB user to `SELECT`/`INSERT` only, removing even that path from the application's credentials. It captures: sign-in/out/password-change, every data-changing request (success or failure), every 403 denial, IP address, `X-Forwarded-For`, user agent, before/after snapshots of the touched record, and redacts secret-shaped fields (`password`, `token`, `apiKey`, `cvv`, etc.) before storage. This satisfies the Domain 6 ask in full for internal user actions.

### [FIXED] M9 — The quarantine table for rejected/changed sales payloads (`collection_data_issues`) is mutable at the database layer, unlike `audit_log` (fixed 2026-10-20)
`services/collectionQuarantine.js`'s `resolveIssue` performs a plain `UPDATE ... SET status = 'RESOLVED', resolved_by = ?, resolution_note = ?` with no append-only trigger protecting the table, and `recordIssue`'s `ON DUPLICATE KEY UPDATE` path overwrites `seen_count`/`last_seen_at`/`status` on repeat sightings of the same payload rather than appending a new row. In isolation this is acceptable (the HTTP-level resolve action is still captured by the generic `auditTrail` middleware, since it's a `PATCH`/`PUT`), but the **row itself** — the primary record an investigator would open to see "what did RAVON actually send us and when was it resolved" — can be overwritten at the DB layer with no application-level trigger stopping it, which is inconsistent with the append-only guarantee Domain 6 asks for on "rejected payloads."
**Fix applied (option (b), adapted):** a full `audit_log`-style blanket append-only trigger would have broken `recordIssue`'s legitimate `ON DUPLICATE KEY UPDATE` (re-sighting a known issue bumps `seen_count`/`last_seen_at` and may flip `status` back to `OPEN`) and `resolveIssue`'s legitimate `UPDATE` of `status`/`resolved_*`. Instead, `config/db.js`'s schema setup now creates two triggers on `collection_data_issues`, following the same idempotent, `TRIGGER`-privilege-tolerant pattern as `auditLog.js`: `collection_data_issues_no_delete` refuses every `DELETE` outright, and `collection_data_issues_protect_payload` inspects every `UPDATE` and refuses it if any identity/forensic column changes (`issue_key`, `source_system`, `source_type`, `source_id`, `kind`, `reason`, `fields`, `raw_payload`, `collection_id`, `first_seen_at`) — "what RAVON actually sent us" can never be altered once written, while `status`, `resolved_by`, `resolved_at`, `resolution_note`, `seen_count` and `last_seen_at` can still move exactly as the existing resolve/re-sight workflow needs.

### [NO FIX NEEDED] L7 — Sync-level events (a full pull cycle running, its duration, item counts) are not logged as their own audit event type (confirmed 2026-10-20)
`auditLog.js`'s `SPECIAL_PATHS`/`describeRequest` model records *user-initiated* HTTP requests well, but a background sync cycle triggered by a scheduler (not a user click) would not naturally produce a request to attribute. Re-checked directly: `syncCollections` (`collectionSyncService.js`) has exactly one caller, `collectionController.js`, which is only reached through `collectionRoutes.js`'s HTTP routes — grepping the whole `server/` tree for a `setInterval`/cron call into `collectionSyncService.js` finds none. Every sync is user-triggered via an HTTP route today, so it is already covered by the existing `auditTrail` middleware (confirmed by `tests/db/auditTrail.test.js`'s "POS / Restaurant sync runs are recorded with counts, rejected records and errors"). Per the finding's own condition ("if all syncs are currently user-triggered via an HTTP route, this is already covered... and no fix is needed"), no change was made. If a scheduled/cron-driven sync path is ever added, it should call `auditLog.record()` directly with `eventType: 'SYNC'` as the original note describes.

**What's solid:** redaction of secret-shaped fields before storage, before/after record snapshots on every change, IP + forwarded-for + user-agent capture, and DB-level (not just application-level) immutability via triggers — this is a stronger audit trail than most systems of this size ship with.

---

## Summary Table

| ID | Domain | Severity | Finding | Status |
|----|--------|----------|---------|--------|
| H1 | 2 | HIGH | "Latest price as of date" RM valuation (not FIFO/WAC) | **Accepted design** (= prior C5) |
| H2 | 2 | HIGH | FG recipe `last_price` unreconciled with real purchase price | **Fixed** (2026-10-20) |
| H3 | 3 | HIGH | No Chart of Accounts / double-entry journal | **Fixed** (2026-10-20) |
| H4 | 4 | HIGH | Revenue/COGS matching inherited H2's unreconciled FG recipe cost | **Fixed** (2026-10-20, with H2) |
| M1 | 1 | MEDIUM | No replay-window check on signed sync responses | **Fixed** (2026-10-20) |
| M2 | 1 | MEDIUM | No startup validation of integration URLs | **Fixed** (2026-10-20) |
| M3 | 1 | MEDIUM | No rate limit on malformed-payload bursts into quarantine | **Fixed** (2026-10-20) |
| M4 | 2 | MEDIUM | RM adjustment `unit_price` not sign/shape validated | **Fixed** (2026-10-20) |
| M5 | 2 | MEDIUM | Approved RM adjustments post to no ledger | **Fixed** (2026-10-20) |
| M6 | 3 | MEDIUM | Expense disbursement has no maker-checker (RBAC-only) | Accepted design / optional |
| M7 | 4 | MEDIUM | Inconsistent `isAmount()` enforcement across money inputs | **Fixed** (2026-10-20) |
| M8 | 5 | MEDIUM | "Ingestion token scoping" ask doesn't map to pull-based architecture | Informational |
| M9 | 6 | MEDIUM | `collection_data_issues` is mutable, unlike `audit_log` | **Fixed** (2026-10-20) |
| L1 | 1 | LOW | Quarantine payloads stored unredacted | **Fixed** (2026-10-20) |
| L2 | 1 | LOW | No alerting on stale OPEN quarantine issues | **Fixed** (2026-10-20) |
| L3 | 2 | LOW | FG recipe quantity edits have no second approver | **Fixed** (2026-10-20) |
| L4 | 3 | LOW | `closeRequest` has no in-controller role check | **Fixed** (2026-10-20) |
| L5 | 4 | LOW | No sweep to expire overdue re-open grants | **Fixed** (2026-10-20) |
| L6 | 5 | LOW | IDOR — architecturally not applicable | No fix needed |
| L7 | 6 | LOW | Sync-level events not their own audit type | No fix needed (all syncs are HTTP-triggered) |
| — | 4 | RESOLVED | Arithmetic precision (`utils/money.js`, BigInt decimal math) | **Fixed** |
| — | 5 | RESOLVED | Store Keeper / Finance RBAC separation | **Confirmed correct** |
| — | 6 | RESOLVED | `audit_log` DB-level append-only immutability | **Confirmed correct** |

---

## Constraints Honored in Every Fix Above

Per the project's accepted architecture decisions, no fix in this report proposes: hard deletes (all suggested history tables are additive/append-only), company/branch scoping (RBAC fixes stay role-based), restricting Store Keeper's existing supplier-payment routes, or altering the period-close rules (this + last month open, Super Admin re-open approval) — all fixes build on top of these as fixed ground truth.
