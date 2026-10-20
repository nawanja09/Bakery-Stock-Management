# BSMS — Security, Business-Logic & Financial-Integrity Audit

> **Status update 2026-10-20:** this report is historical. Current fix status of every finding is in [security-financial-reaudit-2026-10-15.md](security-financial-reaudit-2026-10-15.md). Fixed since: H3, H4, H5 (hard deletes), H6 (mostly), H7, M3, M4, M5, M7, R1–R10 and the C1–C3, N1–N9 items below. Accepted: M8 (no company scoping), R2 (Store Keeper pays suppliers). Still open: C4, C5 (design), H5 expense approval, N1-tail (needs the RAVON Laravel apps).

**Scope:** `server/` (Express 4 + mysql2, 24k LOC across controllers/services/routes/middleware), commit `189c342`, 2026-10-12.
**Method:** Manual code review. RBAC findings were verified by executing the real `config/rolePermissions.js` and a live Express router. Secret findings were checked by key name and length only. No secret values were read.

---

## 0. Read this first: the brief vs. what the system actually is

The audit brief assumes several components that **do not exist** in this codebase. The report covers them, but it is important to be accurate about what is missing and what is broken:

| Brief assumes | Reality in code |
|---|---|
| External platform **pushes** sales via webhook/API into BSMS | There is **no inbound sales endpoint**. BSMS **pulls** shift/credit-payment/deduction *collection totals* from RAVON POS and RAVON Restaurant (`services/collectionSyncService.js`) using a user's RAVON bearer token. HMAC/webhook auth is not applicable. The trust boundary is the **outbound pull** plus the user-approval step. |
| Sales payloads carry SKUs, qty, unit price, discount, tax | Imported records carry **payment-method totals per shift** (cash/card/online/credit, short/excess). There are **no line items**, so external sales **never deplete stock** and **cannot be matched to COGS**. |
| FIFO / Weighted-Average valuation | **Neither.** Stock quantity is a live `SUM()` over movement tables (`services/rmStockService.js`). The only valuation (`controllers/analystController.js` "balance sheet") is **qty × last purchase price**. |
| Double-entry GL, Chart of Accounts, P&L engine, period close | **None exist.** There is no `journal`, `chart_of_accounts`, `cogs`, `profit` or `period` anywhere in `server/`. The system is a set of **single-entry cash/bank/card/"other" ledgers**. |
| Store/branch-scoped users (IDOR across branches) | Users have **no company/branch binding**. RBAC is module-level only, so every user with a module sees every company's data. |

Some items in the brief can't be "fixed" with a patch, because the feature they describe doesn't exist yet. Those items are listed as **design gaps** with a concrete target design (§5).

### Controls that are done well (keep these)
- **Collection staging idempotency:** `UNIQUE (source_system, source_type, source_id)`, plus `UNIQUE (collection_id, payment_method)`, `UNIQUE pos_card_key` and `UNIQUE (source_type, source_id)` on other-ledger rows. Approval locks rows `FOR UPDATE` in sorted id order, re-checks status under the lock, and uses `UPDATE … WHERE status='pending'` compare-and-set (`services/collectionService.js:95,105,453`).
- **Card reconciliation:** individual card payments must add up to the shift card total before posting (`collectionMapper.js:551`).
- **RAVON tokens:** encrypted at rest with AES-256-GCM, scrubbed from logs, and the integration logins are rate-limited (`integrationAuthService.js`).
- **Central default-deny RBAC table:** `config/rolePermissions.js`. A missing rule returns 403.
- **Parameterised SQL:** no SQL injection was found in the files reviewed.
- **Idempotency key on stock adjustments:** `adjustmentController.js:311`.

---

## Findings summary

| ID | Sev | Title |
|---|---|---|
| C1 | **CRITICAL** | Committed 15-char `JWT_SECRET` lets anyone forge a Super-Admin token and decrypt stored RAVON tokens |
| C2 | **CRITICAL** | RBAC bypass via URL case (verified): Store Keeper can reach Adjustments/Expense/VAT endpoints |
| C3 | **CRITICAL** | Fake transactions (`pool.query('START TRANSACTION')`) leave connections in open transactions, so unrelated writes can be silently lost |
| C4 | **CRITICAL (design)** | No double-entry: revenue, payables and stock have no balancing entries, so a P&L cannot be produced or proven |
| H1 | HIGH | `/refresh-token` renews forever with stale role; deactivated/demoted users keep access |
| H2 | HIGH | Actor spoofing: `prepared_by` / `created_by` / `approved_by` / `user_name` accepted from client; `req.user.id` bug hard-codes user 5 |
| H3 | HIGH | Accounts-payable integrity: invoice totals client-trusted, `paid_amount` editable without payment, initial payments bypass cash/bank book |
| H4 | HIGH | Stock: no availability check or locking on issues/wastage/FG; adjustments trust client `system_qty`/`unit_price`, no approval, hard delete |
| H5 | HIGH | Expenses: no maker–checker approval; hard `DELETE` of petty-cash vouchers; balance recompute outside the transaction |
| H6 | HIGH | Audit trail is opt-in via a client header, mutable, has no IP/payload, and misses whole modules |
| H7 | HIGH | No period close; back-dating allowed everywhere; posted ledger rows rewritten in place |
| H8 | HIGH | Inventory valuation is last-purchase-price; COGS cannot be computed from the integration |
| M1 | MED | Pagination "same-origin" check is a string prefix, so a RAVON token can leak to `pos.ravonbakers.lk.attacker.tld` |
| M2 | MED | BSMS login password relayed to two external systems; HTTPS not enforced on base URLs |
| M3 | MED | Collection approval can post amounts the approver never saw (re-sync race, no version check) |
| M4 | MED | External payload "validation" is fuzzy alias matching; upstream voids/refunds after approval are never detected |
| M5 | MED | Floating-point money arithmetic (`parseFloat`/`toFixed`, ~220 sites) - **fixed 2026-10-20** |
| M6 | MED | No login throttling/lockout; no password policy on change-password |
| M7 | MED | Two different "current stock" formulas (soft-deleted invoices counted in one, not the other) |
| M8 | MED | No company/branch data isolation (horizontal IDOR across companies) |
| M9 | MED | FG Sales: client-trusted prices, random sale numbers, hard delete, no stock depletion |
| L1–L6 | LOW | Broken global error handler, unauthenticated `/uploads`, CORS/helmet, JWT alg pinning, bank→company fallback, legacy role middleware |

---

## CRITICAL

### C1 — Committed, weak `JWT_SECRET` → token forgery and RAVON token decryption
**Where:** `server/.env` is tracked in git (13 commits touch it), and is also inside the tracked `server.zip`. `JWT_SECRET` is **15 characters**. There is no `POS_SESSION_SECRET`, so `services/posSessionStore.js:34` falls back to `JWT_SECRET` as the AES key for stored RAVON POS/Restaurant bearer tokens. `bakery system db.sql` (tracked) also contains user rows with bcrypt hashes.

**Why it is critical:** `middleware/authenticate.js:13` trusts the `role` claim in the JWT and never checks it against the DB. Anyone with read access to the repo (or to any clone, CI cache or zip) can mint `{"role":"Super Admin"}` and get full read/write on every financial module. The same secret decrypts `pos_sessions`, which gives direct API access to both RAVON systems.

**Fix (do all of these):**
1. **Rotate now.** Generate new `JWT_SECRET` and **separate** `POS_SESSION_SECRET` values (≥ 32 random bytes each, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`). Rotating `JWT_SECRET` logs everyone out. Rotating the session key makes the stored RAVON sessions unreadable, so users must log in or reconnect again, which is the intended effect. Treat the DB password and RAVON accounts as exposed too.
2. **Stop tracking secrets** and purge them from history (`git rm --cached server/.env server.zip client/build.zip "bakery system db.sql"`, add them to `.gitignore`, then `git filter-repo --path server/.env --path server.zip --path "bakery system db.sql" --invert-paths` and force-push, coordinated with everyone who has a clone).
3. **Fail fast on weak or missing secrets, and pin the algorithm:**

```js
// server/config/secrets.js  (new)
const MIN_BYTES = 32;
const required = (name) => {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value, 'utf8') < MIN_BYTES) {
    throw new Error(`${name} must be set and at least ${MIN_BYTES} bytes long`);
  }
  return value;
};
module.exports = Object.freeze({
  JWT_SECRET: required('JWT_SECRET'),
  POS_SESSION_SECRET: required('POS_SESSION_SECRET'),
  JWT_OPTIONS: Object.freeze({ algorithms: ['HS256'], issuer: 'bsms', audience: 'bsms-web' })
});
```

```js
// server/services/posSessionStore.js:33 — never fall back to the JWT secret
const { POS_SESSION_SECRET } = require('../config/secrets');
const keyOf = () => crypto.createHash('sha256').update(`bsms-pos-session:${POS_SESSION_SECRET}`).digest();
```

Sign with `jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h', issuer: 'bsms', audience: 'bsms-web' })` and verify with `jwt.verify(token, JWT_SECRET, JWT_OPTIONS)` everywhere, including `authenticate.js`, `readOnly.js` and `authRoutes.js`. Require `./config/secrets` as the first line of `server.js` after `dotenv` so a bad config stops the boot.

---

### C2 — RBAC bypass by changing URL case (verified)
**Where:** `config/rolePermissions.js:218-234` (`toApiPath`/`resolveApiRule`) matches prefixes **case-sensitively**, but Express routers match **case-insensitively** by default. When a narrow rule exists under a broader one, an upper-cased segment skips the narrow rule and falls through to the broad, more permissive one.

**Proof (run against the real module and a real Express router):**
```
Store Keeper PUT /api/purchases/payments/5/adjust   {"allowed":false}
Store Keeper PUT /api/purchases/PAYMENTS/5/adjust   {"allowed":true}   ← Express routes it to adjustPurchasePayment (200)
Store Keeper GET /api/reports/Expenses-Report       {"allowed":true}   ← expense report (Expenses module only)
Store Keeper GET /api/purchase-returns/REPORTS/x    {"allowed":true}   ← VAT-only reports
```
The per-route `adjustmentsAccess` guard in `routes/paymentRoutes.js:34-37` calls the same `authorizeApi`, so it is bypassed the same way. **Impact:** a Store Keeper can rewrite posted supplier payments, cash/bank balances and supplier credit (`purchaseController.adjustPurchasePayment`), and can read expense reports.

**Fix:**
```js
// config/rolePermissions.js
const toApiPath = (url = '') => {
  let path = String(url).split('?')[0].split('#')[0];
  if (/%2f|%5c/i.test(path)) return '/__rejected__';      // no encoded separators
  path = path.toLowerCase();                              // Express routing is case-insensitive
  if (path === '/api' || path.startsWith('/api/')) path = path.slice(4);
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return path.startsWith('/') ? path : `/${path}`;
};
```
All `API_RULES` prefixes are already lowercase. Add a regression test:
```js
// tests/accessControl.test.js
for (const url of ['/api/purchases/PAYMENTS/5/adjust', '/api/Purchases/Payments/5/adjust',
                   '/api/reports/EXPENSES-REPORT', '/api/purchase-returns/Reports/x']) {
  assert.equal(evaluateApiAccess('Store Keeper', 'PUT', url).allowed, false, url);
}
```

---

### C3 — Pool-level "transactions" corrupt unrelated writes
**Where:** `controllers/finishedGoodsSalesController.js:12-40`, `finishedGoodsTransferController.js:79-144`, `finishedGoodsWastageController.js:56-184`, `productionController.js:7-69`.

`pool.query('START TRANSACTION')` runs on **whichever pooled connection is free**. The following `INSERT`s and the `COMMIT`/`ROLLBACK` can each land on a **different** connection. Consequences:
- Multi-row writes are **not atomic**, so headers can be saved without lines (or the reverse).
- The connection that received `START TRANSACTION` goes back to the pool **with a transaction still open**. Any later `pool.query` write from *any* module that lands on that connection (e.g. `hiddenExpenseRoutes.js:77`, `analyst`, `income`) joins that transaction. Those writes are invisible to other sessions, and they are **silently discarded** if the connection is reset, times out or the process restarts.

**Fix:** add one helper and use it everywhere, and ban pool-level `START TRANSACTION` with a lint rule or a grep check in CI.
```js
// server/utils/withTransaction.js
const pool = require('../config/db');
module.exports = async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try { await conn.rollback(); } catch (_) { /* connection may be broken */ }
    throw error;
  } finally {
    conn.release();
  }
};
```
```js
// controllers/finishedGoodsSalesController.js — createFinishedGoodsSale (rewritten)
const crypto = require('crypto');
const withTransaction = require('../utils/withTransaction');
const { toCents, fromCents } = require('../utils/money');   // see M5

const createFinishedGoodsSale = async (req, res) => {
  const actorId = Number(req.user?.userId);
  const { sale_date, designation, cashier_name, remarks, items } = req.body;
  if (!Number.isInteger(actorId) || actorId <= 0) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sale_date || ''))) return res.status(400).json({ error: 'Valid sale_date required' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) return res.status(400).json({ error: 'Items required' });

  let lines;
  try {
    lines = items.map((it) => {
      const itemId = Number(it.item_id);
      const qty = Number(it.quantity);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0) throw new Error('Invalid item line');
      const unitCents = toCents(it.unit_price);
      if (unitCents < 0n) throw new Error('Negative price');
      // total computed server-side; client total_value is ignored
      const totalCents = (unitCents * BigInt(Math.round(qty * 1000)) + 500n) / 1000n;
      return { itemId, qty, unit: fromCents(unitCents), total: fromCents(totalCents) };
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const result = await withTransaction(async (conn) => {
      const saleNumber = `SALE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const [sale] = await conn.query(
        'INSERT INTO finished_goods_sales (sale_number, sale_date, designation, cashier_name, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [saleNumber, sale_date, designation ?? null, cashier_name ?? null, remarks ?? null, actorId]
      );
      for (const l of lines) {
        await conn.query(
          'INSERT INTO finished_goods_sale_items (sale_id, item_id, quantity, unit_price, total_value) VALUES (?, ?, ?, ?, ?)',
          [sale.insertId, l.itemId, l.qty, l.unit, l.total]
        );
      }
      // TODO(H4): lock FG item rows and assert available FG stock here
      return { id: sale.insertId, sale_number: saleNumber };
    });
    res.status(201).json({ ...result, message: 'Sale recorded successfully' });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: 'Unable to record sale' });
  }
};
```
Apply the same pattern to the transfer, wastage and production controllers. After deploying, **restart the API** to drop any pooled connections that are stuck in an open transaction. Then reconcile FG tables against the paper and POS records for the period these controllers were in use.

---

### C4 — No double-entry bookkeeping (design gap with financial-statement impact)
**Evidence:**
- **Collection approval** posts only the asset side: Cash/Bank **debit**, Card pending, AR **debit** (`services/collectionService.js:177-289`). Nothing ever **credits Sales Revenue**, so revenue exists only as the sum of cash-in rows.
- **Purchase creation** with `paid_amount > 0` writes `payment_history` but **never posts to the cash/bank book** (`purchaseController.js:220-236`; ledger calls exist only in `makePayment` at `:1080/:1094`). Cash-in-hand is therefore **overstated** by every "paid at invoice" purchase.
- **GRN → AP:** there is no Inventory Dr / Accounts Payable Cr pair. Payables are a column (`purchases.balance_amount`) that can be edited directly (H3).
- **Stock adjustments, wastage and damages** have an `amount` but nothing posts it to a loss or shrinkage account (`adjustmentController.js:302-349`).
- **"Hidden expenses"** are by design never posted to any book (`routes/hiddenExpenseRoutes.js:5-10`).

**Impact:** Debits = Credits cannot be checked, a trial balance cannot be produced, and any P&L built on these tables is a cash-movement report rather than an accrual P&L.

**Target design (minimum viable GL):** see §5.1 for the schema and a `postJournal()` helper that enforces balance in integer cents. Wire it into the existing posting points (the existing ledgers become sub-ledgers that reference `journal_entry_id`).

---

## HIGH

### H1 — Token refresh never re-checks the user
**Where:** `routes/authRoutes.js:12-27`. Any unexpired token can be exchanged for a fresh 24h token **carrying the old `role`**, with no DB lookup. A user who is deactivated (`users.status`) or demoted keeps their privileges indefinitely by refreshing every <24h. There is also no server-side revocation.

**Fix:** re-derive identity from the DB, and add a `token_version` column for revocation.
```sql
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
-- bump on password change, deactivation, role change:
-- UPDATE users SET token_version = token_version + 1 WHERE id = ?;
```
```js
// routes/authRoutes.js
const pool = require('../config/db');
const { JWT_SECRET, JWT_OPTIONS } = require('../config/secrets');
const { getRoleModules } = require('../config/rolePermissions');

router.post('/refresh-token', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, status, token_version FROM users WHERE id = ?', [req.user.userId]
    );
    const u = rows[0];
    if (!u || Number(u.status) !== 1 || Number(u.token_version) !== Number(req.user.tv)) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }
    const permissions = ['dashboard', ...getRoleModules(u.role)];
    const token = jwt.sign(
      { userId: u.id, username: u.username, role: u.role, permissions, tv: u.token_version },
      JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h', issuer: JWT_OPTIONS.issuer, audience: JWT_OPTIONS.audience }
    );
    res.json({ token });
  } catch (e) {
    console.error('refresh-token failed:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});
```
Also include `tv` at login (`authController.js:230`), and in `authenticate.js` load `status, role, token_version` per request (with a ≤30s in-memory cache), rejecting the token on any mismatch. This also makes C1-style forged tokens fail unless they match a real user's current role and version.

### H2 — Who-did-it fields are client-controlled
**Where:**
- `purchaseController.js:8-21` `resolveUserId(connection, prepared_by, req.user?.id)`: the **client `prepared_by` wins**, `req.user.id` is always `undefined` (the JWT field is `userId`), and the fallback is **the first user in the table** (usually Admin). Used at `:197, :565, :916, :1854, :1873`.
- `orderController.js:18` falls back to `req.body.created_by`.
- `issuanceController.js:9-31` stores client `issued_by` and **`approved_by`**, so the "approval" is just a text field.
- `adjustmentController.js:310-352` stores client `user_name`, and the audit row has `updatedBy: null`.
- `finishedGoodsSalesController.js:9`, `finishedGoodsWastageController.js:53` use `req.user?.id || 5`; `finishedGoodsTransferController.js:76` hard-codes `5`.

**Impact:** every purchase, payment, issue, adjustment and FG record can be attributed to someone else, which defeats segregation of duties and forensic review.

**Fix:** one helper, no client input:
```js
// server/utils/actor.js
const { HttpError } = require('./staffLoanUtils');
const actorId = (req) => {
  const id = Number(req.user?.userId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(401, 'Not authenticated');
  return id;
};
module.exports = { actorId };
```
Replace every `resolveUserId(...)`, `req.user?.id`, `|| 5` and body-supplied `created_by` / `prepared_by` / `issued_by` / `user_name` with `actorId(req)`. "Approved by" must come from a separate **approve** action by a different user (see H4/H5), never from the create payload.

### H3 — Accounts-payable integrity
**Where / issues:**
1. **Totals are client-trusted.** `createPurchase`/`updatePurchase` store `subtotal`, `vat_amount` and `total_with_vat` exactly as sent (`purchaseController.js:185, 205-214, 572-593`). They are never recomputed from `items[].quantity × unit_price`, so AP can be inflated or deflated relative to goods received.
2. **`paid_amount` is directly editable** in `updatePurchase` (`:576-592`). A PUT with `paid_amount = total` sets `payment_status='Paid'` and `balance_amount=0` with **no payment, no allocation, no cash/bank movement**. `getAllPurchases`/`getPurchaseById` "heal" it back on the next read (`:361, :496`). Until then, the analyst balance sheet treats `Paid` invoices without `payment_history` as fully paid (`analystController.js:150-172`), so the liability disappears from reporting. Edits are only audited if the client sends `X-RM-Adjustment: true` (H6).
3. **Initial payment is not clamped**, despite the comment (`:186-191`: `appliedPaidAmount = requestedPaidAmount`), which allows negative balances. It is also **not posted to the cash/bank book** (C4).
4. **No item validation:** negative or zero quantities and prices are accepted, and a negative-quantity "purchase" silently reduces stock.
5. `updatePurchase` does not lock or verify that the purchase exists unless the adjustment header is set.

**Fix (core of `updatePurchase`; mirror it in `createPurchase`):**
```js
const { toCents, fromCents } = require('../utils/money');
const { actorId } = require('../utils/actor');

const computeInvoice = (items, vatRate) => {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'At least one item is required');
  let subtotal = 0n;
  const lines = items.map((it) => {
    const itemId = Number(it.item_id);
    const qtyMilli = BigInt(Math.round(Number(it.quantity) * 1000));
    const unit = toCents(it.unit_price);
    if (!Number.isInteger(itemId) || itemId <= 0 || qtyMilli <= 0n || unit < 0n) throw new HttpError(400, 'Invalid item line');
    const lineCents = (unit * qtyMilli + 500n) / 1000n;
    subtotal += lineCents;
    return { itemId, itemName: it.item_name, quantity: Number(qtyMilli) / 1000, unitPrice: fromCents(unit) };
  });
  const rateBp = BigInt(Math.round(Number(vatRate || 0) * 100));         // 18% -> 1800 bp
  if (rateBp < 0n || rateBp > 10000n) throw new HttpError(400, 'Invalid VAT rate');
  const vat = (subtotal * rateBp + 5000n) / 10000n;
  return { lines, subtotal: fromCents(subtotal), vat: fromCents(vat), total: fromCents(subtotal + vat) };
};

// inside updatePurchase, after beginTransaction():
const [[current]] = await connection.query('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
if (!current) { await connection.rollback(); return res.status(404).json({ error: 'Purchase not found' }); }
await assertPeriodOpen(connection, current.company_id, current.purchase_date);   // H7 (old period)
await assertPeriodOpen(connection, company_id, purchase_date);                    // H7 (new period)
const inv = computeInvoice(items, vat_rate);
if (toCents(inv.total) !== toCents(total_with_vat ?? inv.total)) {
  await connection.rollback();
  return res.status(400).json({ error: `Invoice total must equal items + VAT (${inv.total})` });
}
// paid_amount is NEVER taken from the request: derive it from real allocations
const state = await reconcilePurchasePaymentState(connection, id, Number(inv.total), current.paid_amount);
if (toCents(String(state.paid_amount)) > toCents(inv.total)) {
  await connection.rollback();
  return res.status(409).json({ error: 'New total is below the amount already paid; record a supplier credit/return instead' });
}
// UPDATE purchases SET ... subtotal = inv.subtotal, vat_amount = inv.vat, total_with_vat = inv.total,
//   paid_amount = state.paid_amount, balance_amount = state.balance_amount, payment_status = state.payment_status,
//   prepared_by = current.prepared_by, updated_by = actorId(req) ...
// then ALWAYS write the audit row with before/after values (H6)
```
For `createPurchase`, reject `paid_amount > 0` and route payments through `makePayment` (which already posts to the ledger and allocates). Alternatively, call the same posting code inside the create transaction. Do not keep a second, ledger-less payment path.

### H4 — Stock movements: no availability check, no locking, no approval
**Where:**
- `issuanceController.js:5-60`, `wastageController.js`, FG transfer/wastage/sales: no check that stock is available, so balances can go **negative**. Nothing serialises concurrent issues of the same item, and `quantity` is not validated (negative values *increase* stock).
- `adjustmentController.js:309-369`: **`system_qty` and `unit_price` come from the client**, so the variance is whatever the caller says. The adjustment takes effect immediately with **no approval**, the actor is not recorded, the `amount` is not posted to a loss account, and `deleteAdjustment` (`:788-809`) **hard-deletes** the record and its `stock_movements` row.

**Fix A: serialise per item and check availability (all stock-reducing writers):**
```js
// server/services/rmStockService.js  (add)
const { HttpError } = require('../utils/staffLoanUtils');

/** Locks the item rows (fixed order, no deadlocks) and asserts enough stock. Call inside a transaction. */
const lockAndAssertAvailable = async (conn, lines) => {
  const need = new Map();
  for (const l of lines) {
    const id = Number(l.item_id); const q = Number(l.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(q) || q <= 0) throw new HttpError(400, 'Invalid item line');
    need.set(id, (need.get(id) || 0) + q);
  }
  const ids = [...need.keys()].sort((a, b) => a - b);
  const [locked] = await conn.query('SELECT id FROM items WHERE id IN (?) AND deleted = FALSE ORDER BY id FOR UPDATE', [ids]);
  if (locked.length !== ids.length) throw new HttpError(400, 'Unknown or deleted item');
  for (const id of ids) {
    const s = await getItemStock(conn, id);
    if (Number(s.current_stock) + 1e-9 < need.get(id)) {
      throw new HttpError(409, `Insufficient stock for ${s.name}: available ${s.current_stock}, requested ${need.get(id)}`);
    }
  }
};
module.exports.lockAndAssertAvailable = lockAndAssertAvailable;
```
Call it at the top of `createIssuance`, `updateIssuance`, wastage create/update, purchase-return create, and **also** lock the same `items` rows (`SELECT … FOR UPDATE`) in purchase create/update and adjustments, so every movement on an item is serialised. Also fix `getItemStock`/`getAllItemsWithStock` to exclude soft-deleted invoices (M7).

**Fix B: stock adjustments become maker–checker, with server-computed quantities:**
```sql
ALTER TABLE stock_adjustments
  ADD COLUMN status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN created_by INT NOT NULL, ADD COLUMN approved_by INT NULL, ADD COLUMN approved_at DATETIME NULL,
  ADD COLUMN is_void TINYINT(1) NOT NULL DEFAULT 0;
-- Backfill existing rows as APPROVED, then: stock formulas use  WHERE status = 'APPROVED' AND is_void = 0
```
```js
// createAdjustment: ignore client system_qty / unit_price / user_name
const values = await withTransaction(async (conn) => {
  await conn.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [item_id]);
  const s = await getItemStock(conn, item_id);
  const unitCost = await weightedAverageCost(conn, item_id, date);   // §5.2
  const variance = Number((Number(actual_qty) - Number(s.current_stock)).toFixed(3));
  // INSERT ... status='PENDING', created_by=actorId(req), system_qty=s.current_stock, unit_price=unitCost
});

// POST /adjustments/:id/approve  (Admin/Super Admin, approver !== creator)
//  - SELECT ... FOR UPDATE; status must be PENDING; approved_by != created_by
//  - re-check system qty hasn't moved since creation (else 409 'recount')
//  - UPDATE status='APPROVED'; insert stock_movements; postJournal(Dr Inventory Shrinkage / Cr Inventory)
// DELETE -> replace with POST /:id/void (sets is_void=1, writes reversing movement + journal); never DELETE.
```

### H5 — Expense disbursement has no approval hierarchy, and records are hard-deleted
**Where:** `routes/newExpenseRoutes.js`, `expenseRoutes.js`, `cashExpenseRoutes.js`. Any role with the Expenses module (including `FINANCE_USER`) can create **and** pay or release an expense in one step. There is no status that requires a second person. `DELETE /petty-cash/voucher/:id` (`expenseRoutes.js:505-536`) **physically deletes** the voucher. `updatePettyCashBalance()` runs **after commit, outside the transaction** (`:381, :484, :524`), so a crash in between leaves the balance wrong. 38 `DELETE FROM` statements exist across controllers/routes.

**Fix:**
```sql
ALTER TABLE expenses  -- and petty_cash_vouchers, cash_expenses, bank_charges, online expenses
  ADD COLUMN approval_status ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','VOID') NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN submitted_by INT NOT NULL, ADD COLUMN approved_by INT NULL, ADD COLUMN approved_at DATETIME NULL;
CREATE TABLE expense_approval_limits (role VARCHAR(50) PRIMARY KEY, max_amount DECIMAL(14,2) NOT NULL);
```
```js
// POST /expenses/:id/approve
await withTransaction(async (conn) => {
  const [[e]] = await conn.query('SELECT * FROM expenses WHERE id = ? FOR UPDATE', [id]);
  if (!e || e.approval_status !== 'SUBMITTED') throw new HttpError(409, 'Not awaiting approval');
  const approver = actorId(req);
  if (approver === e.submitted_by) throw new HttpError(403, 'Submitter cannot approve their own expense');
  const [[limit]] = await conn.query('SELECT max_amount FROM expense_approval_limits WHERE role = ?', [normalizeRole(req.user.role)]);
  if (!limit || toCents(e.amount) > toCents(limit.max_amount)) throw new HttpError(403, 'Amount exceeds your approval limit');
  await assertPeriodOpen(conn, e.company_id, e.expense_date);
  await conn.query("UPDATE expenses SET approval_status='APPROVED', approved_by=?, approved_at=NOW() WHERE id=?", [approver, id]);
  // ONLY NOW: recordCashTransaction / recordBankTransaction / postJournal
});
```
Replace every financial `DELETE` with a **void**: set a status, write a reversing ledger row, and add an audit entry. Move `updatePettyCashBalance` inside the transaction and pass it the connection.

### H6 — Audit trail is opt-in, mutable and incomplete
**Where:**
- `utils/rmAdjustmentAudit.js:1`: auditing of purchase/issuance/wastage edits happens **only if the client sends `X-RM-Adjustment: true`**, so an attacker just omits the header.
- `recordRmAdjustment` stores no before/after values. `stock_adjustments` audit has `updatedBy: null`.
- Collection reject/restore (`collectionService.js:467-507`) records no audit. Restore clears `rejected_by`/`rejected_at`, which **erases** who rejected it.
- Sync runs, rejected payloads (`invalidSamples`) and RAVON auth failures are only `console.warn` messages and are never persisted.
- No IP address, user agent, request payload or response status is stored anywhere. All audit tables are writable and deletable by the app user.

**Fix: append-only audit log plus middleware:**
```sql
CREATE TABLE audit_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  occurred_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id      INT NULL,
  role         VARCHAR(50) NULL,
  ip           VARCHAR(64) NULL,
  user_agent   VARCHAR(255) NULL,
  method       VARCHAR(10) NOT NULL,
  path         VARCHAR(512) NOT NULL,
  status_code  SMALLINT NULL,
  entity       VARCHAR(64) NULL,
  entity_id    VARCHAR(64) NULL,
  before_json  JSON NULL,
  after_json   JSON NULL,
  request_json JSON NULL,
  error_text   VARCHAR(500) NULL,
  KEY ix_audit_entity (entity, entity_id), KEY ix_audit_user (user_id, occurred_at)
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only'//
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only'//
DELIMITER ;
-- Run the app as a DB user with only INSERT, SELECT on audit_log; ship the table off-box (binlog/SIEM) daily.

CREATE TABLE integration_sync_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, started_at DATETIME(3) NOT NULL, finished_at DATETIME(3) NULL,
  triggered_by INT NULL, source_system VARCHAR(20) NOT NULL, source_type VARCHAR(30) NOT NULL,
  window_start DATE, window_end DATE, fetched INT, inserted INT, updated INT, duplicates INT,
  invalid INT, excluded INT, error_code VARCHAR(60) NULL, error_text VARCHAR(500) NULL,
  invalid_samples JSON NULL
) ENGINE=InnoDB;   -- same append-only triggers
```
```js
// server/middleware/auditTrail.js — mount right after authenticate/authorizeApi in server.js
const pool = require('../config/db');
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REDACT = /pass(word)?|token|secret|authorization|card_?number|cvv/i;
const redact = (v, depth = 0) => {
  if (depth > 6 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT.test(k) ? '[redacted]' : redact(x, depth + 1)]));
};
module.exports = (req, res, next) => {
  if (!MUTATING.has(req.method)) return next();
  const body = JSON.stringify(redact(req.body ?? null)).slice(0, 60000);
  res.on('finish', () => {
    pool.query(
      `INSERT INTO audit_log (user_id, role, ip, user_agent, method, path, status_code, request_json, entity, entity_id, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON), CAST(? AS JSON))`,
      [req.user?.userId ?? null, req.user?.role ?? null, req.ip, String(req.get('user-agent') || '').slice(0, 255),
       req.method, req.originalUrl.slice(0, 512), res.statusCode, body,
       res.locals.auditEntity ?? null, res.locals.auditEntityId ?? null,
       res.locals.auditBefore ? JSON.stringify(res.locals.auditBefore) : null,
       res.locals.auditAfter ? JSON.stringify(res.locals.auditAfter) : null]
    ).catch((e) => console.error('AUDIT WRITE FAILED', e.message));   // alert on this
  });
  next();
};
```
Set `app.set('trust proxy', 1)` only if you are behind a known reverse proxy, so `req.ip` is correct. Delete `isRmAdjustmentRequest` and always record before/after values inside the business transaction for financial entities. The request-level log above is the outer net, and the in-transaction rows are the authoritative trail.

### H7 — No period close; history can be rewritten
**Where:** no period, lock-date or fiscal concept exists anywhere. Every create/update accepts any date. `adjustmentController.updateFinancialAdjustmentRecord` (`:215-233`) **rewrites a posted `finance_transactions` row** (date and amount) and recomputes every `balance_after` for the account (`:265-291`). `recordCashTransaction`/`recordBankTransaction` compute `balance_after` as *current total + amount* even for back-dated rows, so stored running balances are wrong for any back-dated entry (`utils/financeLedger.js:88-104, 140-160`). Late-arriving POS shifts are staged and approved into whatever date the POS reports.

**Fix:**
```sql
CREATE TABLE accounting_periods (
  company_id   INT  NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  closed_by    INT NULL, closed_at DATETIME NULL,
  PRIMARY KEY (company_id, period_start)
) ENGINE=InnoDB;
```
```js
// server/utils/periodLock.js
const { HttpError } = require('./staffLoanUtils');
const assertPeriodOpen = async (conn, companyId, date) => {
  const ymd = String(date instanceof Date ? date.toISOString() : date).slice(0, 10);
  const [rows] = await conn.query(
    `SELECT 1 FROM accounting_periods
      WHERE company_id = ? AND ? BETWEEN period_start AND period_end AND status = 'CLOSED'
      LOCK IN SHARE MODE`, [companyId, ymd]);
  if (rows.length) throw new HttpError(409, `Period containing ${ymd} is closed. Post an adjusting entry in the current period.`);
};
module.exports = { assertPeriodOpen };
```
Call `assertPeriodOpen` at the top of `recordCashTransaction`, `recordBankTransaction`, `createImpactEntry`, `createPendingCardTransaction`, `postJournal`, purchase create/update/payment, issuance/wastage/adjustment, collection approval (`row.collection_date`) and every expense write. Convert `updateFinancialAdjustmentRecord` into **reverse + re-post**: mark the old row `status = 0`, insert a reversal and a new row, and never `UPDATE debit/credit`. Stop persisting `balance_after`; compute running balances at read time with `SUM() OVER (ORDER BY transaction_date, id)`, as `calculateRunningBalances` already does.

### H8 — Inventory valuation and COGS
**Where:** `analystController.js:175-240` values stores at `closing_qty × last purchase unit_price ≤ date`. `getPreviousPurchasePrices` (`purchaseController.js:673`) feeds FG costing the same way. Neither FIFO nor weighted average (IAS 2) is used, and issues to departments carry **no cost**. The RAVON integration imports **no item lines**, so revenue cannot be matched to the cost of what was sold.

**Fix:** see §5.2 (perpetual weighted-average cost, with the unit cost frozen on every issue line). For sales COGS, the RAVON API must expose **sale lines** (sale id, SKU, qty, net unit price, discount, tax). Until it does, COGS can only be approximated as *issues to sales departments at WAC*, and the P&L should label it that way.

---

## MEDIUM

### M1 — RAVON bearer token can leak through a crafted `next_page_url`
`collectionSyncService.js:176`: `candidate.startsWith(origin)` passes for `https://pos.ravonbakers.lk.evil.tld/…` and `https://pos.ravonbakers.lk@evil.tld/…`. `posGet` then sends `Authorization: Bearer <finance token>` to that host (`integrationAuthService.js:173, 500-503`). Exploitable by anyone who can influence a RAVON response (a compromised POS, a MITM if the base URL is `http://`, or a malicious record-level field if the POS echoes user input).
```js
// collectionSyncService.js:176
const sameOrigin = (candidate) => { try { return new URL(candidate).origin === origin; } catch { return false; } };
next = typeof candidate === 'string' && sameOrigin(candidate) ? candidate : null;
```
```js
// integrationAuthService.js buildUrl(): refuse absolute URLs to any other origin, and plain http in production
const u = new URL(url);
if (u.origin !== new URL(config(P).baseUrl).origin) throw new PosConfigError(`Refusing cross-origin request for ${P.label}`, codeOf(P, 'NOT_CONFIGURED'), P.id);
if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') throw new PosConfigError(`${P.label} must use https`, codeOf(P, 'NOT_CONFIGURED'), P.id);
```

### M2 — BSMS password is forwarded to external systems
`authController.js:247-249` sends every Finance/Accountant/Admin/Super-Admin's BSMS username and password to **both** RAVON `/api/login` endpoints on each login. This leaks the BSMS credential to two other systems' logs and operators, encourages password reuse, and makes a compromise of either RAVON system a BSMS compromise. **Fix:** remove `loginAll` from the BSMS login. Use only the explicit "Connect" flow (`integrationAuth.connect`), or better, a RAVON-issued **service token / OAuth client-credentials** scoped read-only to the three collection endpoints and stored in a secrets manager. Enforce HTTPS (M1).

### M3 — Approver can post numbers they never reviewed
A re-sync (`stagePending`, `collectionSyncService.js:256-261`) overwrites a pending row's amounts. Approval (`collectionService.js:344`) posts whatever is in the row when it locks it. If a sync lands between "user reviews" and "user clicks Approve", different amounts are posted.
```js
// client sends, per item, the payload_hash it displayed; server compares under the lock
const crypto = require('crypto');
const hashOf = (raw) => crypto.createHash('sha256').update(String(raw ?? '')).digest('hex');
// in approveCollections, after lockCollection():
if (!input.payload_hash || input.payload_hash !== hashOf(row.raw_payload)) {
  throw new HttpError(409, `Collection ${label(row)} changed since you reviewed it. Refresh and review again.`);
}
```
Return `payload_hash` from the list endpoint, and add `raw_payload` to the `lockCollection` select (it is already there).

### M4 — Payload validation is heuristic; upstream reversals are invisible
`collectionMapper.js` accepts the **first** matching field from broad alias lists (e.g. `id`, `total`, `amount`, `type`, `cash`), case- and punctuation-insensitive. It also searches nested `totals/summary/payments/...` containers. A schema change in RAVON can silently map the wrong field (e.g. `total` → `pos_total_amount`, or `transaction_id` → the dedupe key). Restaurant records are imported **unverified** (`:424-438`). Approved (`completed`) rows are never compared with later RAVON data, so voids, refunds or edits after approval are lost.

**Fix:** replace alias lists with a **versioned strict schema per system and source**, e.g. with `zod`/`ajv`: exact field names, `additionalProperties` logged, numeric strings matching `^\d{1,12}(\.\d{1,2})?$`, `closed_at` as ISO-8601, and `total == cash+card+online+credit` checked. Quarantine non-conforming records (store them in `integration_sync_log.invalid_samples`) instead of best-effort mapping them. Keep the Restaurant source **disabled** until a fixture of its real payload is in `tests/`. Add a nightly **reconciliation job** that re-fetches the last N days and compares `raw_payload` hashes of `completed` rows. On a difference, raise an exception record for an adjusting entry; never edit in place.

### M5 — Floating-point money
About 220 `parseFloat`/`toFixed` sites do money math in IEEE-754 doubles (e.g. `purchaseController.js:23-53`, `financeLedger.js:96-98`, `collectionMapper.js:157-166`). `toFixed` is also not a correct rounding function (`(1.005).toFixed(2) === "1.00"`). The DB columns are `DECIMAL`, and mysql2 already returns them as **strings**, so keep them exact:
```js
// server/utils/money.js — exact 2-dp money as BigInt cents
const MONEY_RE = /^([+-])?(\d{1,13})(?:\.(\d{1,2}))?$/;
const toCents = (value) => {
  const s = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(2) : 'x') : String(value ?? '0').trim().replace(/,/g, '');
  const m = MONEY_RE.exec(s);
  if (!m) throw new RangeError(`Invalid money amount: ${String(value).slice(0, 30)}`);
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] || '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
};
const fromCents = (c) => {
  const neg = c < 0n; const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
const sumCents = (values) => values.reduce((acc, v) => acc + toCents(v), 0n);
module.exports = { toCents, fromCents, sumCents };
```
Pass `fromCents(...)` strings to SQL. Do aggregates in SQL (`SUM(DECIMAL)` is exact) instead of in JS `reduce`. Keep quantities in `DECIMAL(14,3)` and handle them with the same pattern at scale 3.

### M6 — Authentication hardening
There is no throttling or lockout on `POST /api/login` (`authController.js:13`), so passwords can be brute-forced online. `changePassword` (`:71-100`) has no strength rules and crashes on a missing `newPassword` (`bcrypt.hash(undefined)` → 500). bcrypt cost is 10.
```js
// server.js  (npm i express-rate-limit@7.4.1)
const rateLimit = require('express-rate-limit');
app.use('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));
```
Add per-username lockout (e.g. 5 failures → 15 min), a minimum of 12 characters for `newPassword`, cost 12, and a `token_version` bump on password change (H1).

### M7 — Two different "current stock" numbers
`rmStockService.js:47-52, 105` and therefore `orders` low-stock and `adjustment` system qty count purchase lines of **soft-deleted** invoices. `reportController.js:101,151,303` and `analystController` exclude them. Deleting an invoice therefore leaves phantom stock in one view and not the other, and a stock-take adjustment then "corrects" the wrong baseline. **Fix:** add `WHERE (p.deleted = FALSE OR p.deleted IS NULL)` in both rmStockService joins, and make every report call `rmStockService` instead of re-implementing the formula.

### M8 — No company/branch data isolation
`users` has no company or department binding, and no query filters by the caller's company. Any Accountant/Finance/QB user can list and modify every company's ledgers, purchases and collections by changing `company_id`/`bank_id`/`:id` in the request. If the business needs per-company or per-branch confinement:
```sql
CREATE TABLE user_company_access (user_id INT NOT NULL, company_id INT NOT NULL, PRIMARY KEY (user_id, company_id));
```
Load the allowed company ids into `req.user.companyIds` in `authenticate` (from the DB, not the JWT). Enforce them in a shared helper used by every repository query, e.g. `AND company_id IN (?)`, and for `:id` routes `SELECT … WHERE id = ? AND company_id IN (?)` → 404 when it doesn't match.

### M9 — Finished-goods sales
`finishedGoodsSalesController.js`: `unit_price`/`total_value` are taken from the client, the sale number is `Math.random()` (`:3-5`), sales are hard-deleted (`:101-133`), FG stock is not checked or depleted, and there is no transaction (C3). The rewrite in C3 addresses most of this. Also replace delete with void and add the FG stock assertion.

---

## LOW
- **L1** `server.js:194` references `multer`, which is never required, so every error that reaches the global handler throws `ReferenceError` and Express's default handler responds instead (with a stack trace when `NODE_ENV !== 'production'`). Add `const multer = require('multer');`. Many handlers also return `'Server error: ' + error.message` (e.g. `purchaseController.js:285`, `adjustmentController.js:365`), which leaks SQL/schema details. Log the detail and return a generic message.
- **L2** `server.js:110` serves `/uploads` **before** authentication. Move it behind `authenticate`, or serve via signed, short-lived URLs.
- **L3** `server.js:99-104` hard-codes the CORS origin to `http://localhost:3000`. Make it `process.env.CORS_ORIGIN` with an allow-list. Add `helmet()` and `express.json({ limit: '1mb' })`.
- **L4** JWT: pin `HS256`, shorten to ≤ 8h, add `iss`/`aud` (see C1).
- **L5** `financeLedger.js:155-156`: a bank whose `company` text doesn't exactly match a company name is booked to **company id 1**. Throw instead, and store `company_id` on `bank_details` as a foreign key.
- **L6** `middleware/readOnly.js`, `requireRoles.js` and `restrictRoles.js` use their own string role normalisation, which differs from `rolePermissions.normalizeRole` (e.g. `'stores'` lowercase is not blocked by `restrictRoles('Stores')`). `authorizeApi` runs first, so impact is limited. Delete these and route everything through `evaluateApiAccess`. `analystRoutes.js` relies on `requireRoles('Super Admin')`; replace it with the central rule.

---

## 5. Target designs for the missing financial layer

### 5.1 Minimal general ledger with enforced balance
```sql
CREATE TABLE gl_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, code VARCHAR(20) NOT NULL, name VARCHAR(120) NOT NULL,
  type ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_gl_code (company_id, code)
) ENGINE=InnoDB;

CREATE TABLE journal_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, entry_date DATE NOT NULL,
  source_type VARCHAR(40) NOT NULL, source_id VARCHAR(64) NOT NULL,      -- e.g. 'COLLECTION', '123'
  memo VARCHAR(255) NULL, reverses_entry_id BIGINT NULL,
  created_by INT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_je_source (company_id, source_type, source_id)          -- idempotent posting
) ENGINE=InnoDB;

CREATE TABLE journal_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, entry_id BIGINT NOT NULL, account_id INT NOT NULL,
  debit DECIMAL(14,2) NOT NULL DEFAULT 0, credit DECIMAL(14,2) NOT NULL DEFAULT 0,
  department_id INT NULL, item_id INT NULL,
  CONSTRAINT ck_jl_one_side CHECK ((debit >= 0 AND credit >= 0) AND (debit = 0 OR credit = 0) AND (debit + credit > 0)),
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id), FOREIGN KEY (account_id) REFERENCES gl_accounts(id)
) ENGINE=InnoDB;
-- append-only triggers on journal_entries / journal_lines (as in H6); corrections = reversing entries
```
```js
// server/services/glService.js
const { toCents, fromCents } = require('../utils/money');
const { assertPeriodOpen } = require('../utils/periodLock');
const { HttpError } = require('../utils/staffLoanUtils');

/** lines: [{ accountCode, debit?, credit?, departmentId?, itemId? }] — must balance exactly. */
const postJournal = async (conn, { companyId, date, sourceType, sourceId, memo, createdBy, lines }) => {
  await assertPeriodOpen(conn, companyId, date);
  let dr = 0n; let cr = 0n;
  for (const l of lines) { dr += toCents(l.debit || 0); cr += toCents(l.credit || 0); }
  if (dr !== cr || dr === 0n) throw new HttpError(500, `Unbalanced journal ${sourceType}:${sourceId} (Dr ${fromCents(dr)} / Cr ${fromCents(cr)})`);
  const codes = [...new Set(lines.map((l) => l.accountCode))];
  const [accts] = await conn.query('SELECT id, code FROM gl_accounts WHERE company_id = ? AND code IN (?) AND is_active = 1', [companyId, codes]);
  const idOf = new Map(accts.map((a) => [a.code, a.id]));
  for (const c of codes) if (!idOf.has(c)) throw new HttpError(500, `GL account ${c} missing for company ${companyId}`);
  const [je] = await conn.query(
    'INSERT INTO journal_entries (company_id, entry_date, source_type, source_id, memo, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [companyId, date, sourceType, String(sourceId), memo ?? null, createdBy]);
  for (const l of lines) {
    await conn.query(
      'INSERT INTO journal_lines (entry_id, account_id, debit, credit, department_id, item_id) VALUES (?, ?, ?, ?, ?, ?)',
      [je.insertId, idOf.get(l.accountCode), fromCents(toCents(l.debit || 0)), fromCents(toCents(l.credit || 0)), l.departmentId ?? null, l.itemId ?? null]);
  }
  return je.insertId;
};
module.exports = { postJournal };
```
**Posting map (examples):**

| Event | Debit | Credit |
|---|---|---|
| Collection approved (shift) | Cash / Bank / Card Clearing / AR (per method); Cash Short (if short) | Sales Revenue (`total_amount`), Output VAT if applicable; Cash Over (if excess) |
| Credit payment received | Cash / Bank / Card Clearing | AR |
| Card realised | Bank; Card Commission Expense | Card Clearing |
| GRN / purchase invoice | Inventory (net); Input VAT | Accounts Payable |
| Supplier payment | Accounts Payable | Cash / Bank |
| Issue to department | Department Consumption / COGS (qty × WAC) | Inventory |
| Wastage / approved negative adjustment | Inventory Shrinkage Expense | Inventory |
| Expense approved | Expense (by type) | Cash / Bank / Accrued Expenses |

Add a nightly **trial-balance check** (`SELECT SUM(debit)-SUM(credit) FROM journal_lines` must be 0 per company) that alerts on any non-zero result. The **P&L** then becomes `SUM(credit-debit)` over REVENUE and EXPENSE accounts for an open or closed period, and is reproducible because entries are immutable.

### 5.2 Perpetual weighted-average cost
```sql
ALTER TABLE items ADD COLUMN wac_unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0, ADD COLUMN wac_qty DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE issuance_items ADD COLUMN unit_cost DECIMAL(14,4) NULL;     -- frozen at issue time
ALTER TABLE wastage_items  ADD COLUMN unit_cost DECIMAL(14,4) NULL;
```
- **On receipt** (inside the purchase transaction, with the `items` row locked):
  `new_wac = (wac_qty·wac_unit_cost + recv_qty·net_unit_cost) / (wac_qty + recv_qty)`
  where `net_unit_cost` excludes recoverable input VAT.
- **On issue/wastage:** freeze `unit_cost = wac_unit_cost` on the line and post `qty × unit_cost` (§5.1).
- **Back-dated receipts** into an open period trigger a recost job for that item from the receipt date. Receipts into a closed period are refused (H7).
- The stores value on the balance sheet becomes `wac_qty × wac_unit_cost` (or the GL Inventory balance, which must reconcile to it).

---

## 6. Remediation order

| When | Action |
|---|---|
| **Today** | C1 rotate secrets + untrack/purge; C2 lowercase path fix + test; L1 `multer` require; M1 origin check |
| **This week** | C3 `withTransaction` in the 4 FG controllers + API restart + FG data reconciliation; H1 refresh/token_version; H2 `actorId(req)` everywhere; H3 stop `paid_amount` edits, recompute totals, route initial payments through `makePayment` |
| **2–4 weeks** | H4 stock locking/availability + adjustment maker–checker; H5 expense approval + void-not-delete; H6 `audit_log` + sync log; M2 drop password relay; M3 payload hash; M6 rate limiting; M7 stock formula |
| **Quarter** | C4/§5.1 GL + posting map; H7 period close + reverse-and-repost; H8/§5.2 WAC; M4 strict schemas + reconciliation job; M5 money util migration; M8 company scoping; request sale-line data from RAVON for true COGS |

*All line numbers are for commit `189c342`.*
