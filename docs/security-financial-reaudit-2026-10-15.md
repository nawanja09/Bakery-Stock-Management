# BSMS: Security and Financial-Integrity Audit, Third Pass

**Scope:** `server/` at `1b56c0c` (2026-10-15).
**Earlier passes:** [2026-10-12](security-financial-audit-2026-10-12.md) (at `189c342`) and [2026-10-14](security-financial-reaudit-2026-10-14.md) (at `de0a965`). The earlier finding IDs (C, H, M, L and N) are kept. New findings in this pass are numbered **R1–R10**.
**Method:** Manual code review of every module touched by the brief: purchasing, payments, stock movements, expenses, collections, ledgers, RBAC and audit. RBAC decisions were checked by running `config/rolePermissions.evaluateApiAccess` in `node`. The concurrency findings (R1) come from code reading against InnoDB REPEATABLE READ semantics. They were later reproduced on the MySQL test database before being fixed (see R1).

---

## 0. What the system is (unchanged)

| Brief assumes | Reality at `1b56c0c` |
|---|---|
| The sales platform **pushes** orders by webhook | There is no inbound endpoint. BSMS **pulls** shift, credit-payment and deduction **totals** from RAVON POS / Restaurant (ECDSA-signed requests or per-user tokens). |
| Sales lines (SKU, qty, price, discount, tax) | **None.** Sales never deplete stock and cannot be matched to COGS. |
| FIFO / weighted average | Neither. Stock is a live `SUM()` of movement tables. Valuation is qty × **last purchase price** (`analystController.js:211-276`). |
| Double-entry GL, chart of accounts, P&L, period close | **None.** `grep` finds no `journal`, `accounting_period`, `lock_date`, `fiscal`, `cogs` or `weighted` anywhere in `server/`. |

So brief domains 2–4 (valuation, double entry, P&L) are mostly **design gaps** (C4, C5, H7, H8). The target designs in §5 of the 10-12 report still apply. This pass concentrates on defects that corrupt the money and stock data the system **does** keep.

---

## 1. Summary

| ID | Sev | Title | New? |
|---|---|---|---|
| C4 | **CRITICAL (design)** | No double-entry ledger: Debits = Credits cannot be proven, so no P&L can be produced | carried |
| C5 | **CRITICAL (design)** | No COGS: RAVON sends no sale lines, and stock is valued at last price | carried |
| **R1** | **Fixed** 2026-10-15 (was HIGH) | Supplier-invoice payment: a concurrent double payment pays twice, allocations are not capped at the outstanding amount, and the unallocated part of a payment leaves the cash book with no AP record | **new** |
| **R2** | ~~HIGH~~ **Accepted** | Store Keeper can disburse supplier payments from Cash/Bank (no segregation of duties on AP). Business decision 2026-10-15: keep as is | **new** |
| **R3** | **Fixed** (route removed, 2026-10-15) - was MEDIUM | A "deleted" wastage note keeps reducing stock and inventory value; the loss disappears from every wastage list. **No page has a Delete button** - reachable only by a direct API call | **new** |
| H4 | HIGH | No stock-availability check or item lock; adjustments trust client `system_qty`; no approval step | carried |
| H5 | HIGH | No expense maker–checker; ledger rows hard-deleted (see R8) | carried |
| H6 | **Mostly fixed** 2026-10-16 (was HIGH) | Audit trail opt-in (`X-RM-Adjustment` header) and mutable; sync rejects go only to `console.warn`. **Now:** append-only `audit_log` (UPDATE/DELETE refused by triggers) written by the server for every sign-in event (success, failure, lock-out), sign-out, password change, data change and refused (403) request, with user, sign-in session, IP, browser, redacted request / response data and result (`services/auditLog.js`). Data views are not recorded (business decision). Audit Trail page for Admin / Super Admin (`/audit-trail`). **Follow-ups done 2026-10-16:** (1) every POS / Restaurant sync run is an Audit Trail row (event SYNC) with counts, rejected records + reasons and errors; (2) edits / deletes / pay / settle of a single record store the record before and after (`services/auditSnapshots.js`, ~50 routes incl. line items) and the page shows field-by-field old -> new; (3) `scripts/createAppDbUser.js` + `AUDIT_DB`: audit_log in its own schema where the app account has SELECT, INSERT only (no UPDATE / DELETE / ALTER / DROP / TRIGGER) - the test (`tests/db/appDbUser.test.js`) is skipped on the local XAMPP server because `mysql.db` is corrupt, so this part is **not yet verified against a live server**; (4) `TRUST_PROXY` (.env) so the Audit Trail and the per-IP sign-in limit see the real client address behind nginx. **Owner action:** set `TRUST_PROXY` in production, run `createAppDbUser.js --apply` and switch `.env` to the new account | carried |
| H7 | **Fixed** 2026-10-16 (was HIGH) | No period close; back-dating allowed everywhere; `balance_after` wrong for back-dated rows | carried |
| **R4** | **Fixed** 2026-10-15 (was MEDIUM) | Actor spoofing survived the N4 sweep: `issued_by`, `approved_by`, `user_name`, `settled_by` (written into `payment_history.created_by`) | **new** |
| **R5** | MEDIUM | `InsufficientBalanceError` is never thrown, so Cash in Hand can be driven negative; every "insufficient balance" handler is dead code | **new** |
| **R6** | MEDIUM | `GET /api/cutlery-reports/stock-report/test` writes fake purchases, transfers and damages into production data | **new** |
| **R7** | MEDIUM | GRN, issuance, wastage and return payloads are not validated: negative quantities, and client-supplied subtotal/VAT/total | **new** |
| **R8** | MEDIUM | Deleting a bank charge hard-deletes its `finance_transactions` row | **new** (H5 instance) |
| H3 | MEDIUM (latent) | `paid_amount` client-set on create/update; "Initial payment" not booked in the cash book | carried |
| M3 | MEDIUM | Approver can post amounts they never reviewed (pending rows are re-synced in place) | carried |
| M4 | MEDIUM | Heuristic POS payload mapping | carried |
| M5 | MEDIUM | Floating-point money (280 `parseFloat`/`toFixed` sites) | carried |
| M7 | MEDIUM | Three different stock formulas (now confirmed: a fourth via `items.current_stock`) | carried, extended |
| M8 | MEDIUM | No company/branch isolation outside collections (accepted for collections, 2026-10-14) | carried |
| **R9** | LOW | Cross-table reference uniqueness enforced only by `SELECT` (race); 500 responses echo `error.message` | **new** |
| **R10** | LOW | `POST /returns/sync-stock` (Store Keeper) overwrites `items.current_stock` from a table issuances never write | **new** |
| N1-tail | LOW | Host is still not in the request signature (`BSMS-SIG-1`, `integrationAuthService.js:170,194`) | carried |

**Fixed and re-verified since 10-14:** N1 strict origin (`integrationAuthService.js:284-318`, `collectionSyncService.js:179`), N2 unique completed reference, N3 DB-backed sessions (`middleware/authenticate.js`), N4 (11 sites), N5 Finance has no Collection, N8 no source-code passwords, N9 cheque dates.

---

## [CRITICAL]

C4 and C5 are unchanged (see the 10-14 report). Two new facts strengthen C4:
- **Hidden Expenses** (`routes/hiddenExpenseRoutes.js`) are expense records with **no** counter-entry, by design. They raise reported expenses with no Cash, Bank or Card-receivable credit. Card commissions written by `cardLedgerService` land here too. In a GL they must post `Dr Card commission / Cr Card receivable`.
- **R1** shows that the AP sub-ledger (`purchases.paid_amount`) and the cash book (`finance_transactions`) can disagree with no error raised. Only a balanced journal per payment would catch this.

---

## [HIGH]

### R1: Supplier-invoice payment can pay twice, overpay, or send cash out unrecorded
> **Fixed (2026-10-15, uncommitted). Reproduced first on the MySQL test database.** Before the fix, two simultaneous Rs. 10,000 payments of one invoice both succeeded (Rs. 20,000 left cash, balance −10,000), and allocations above the balance were accepted.
> - `makePayment` now locks every selected invoice **as the first statement** of its transaction (`SELECT … FOR UPDATE`, id order). A second payment waits, then sees the invoice paid and gets **409** ("someone may have just paid it, refresh").
> - An allocation above what the invoice still owes gets **409**, and nothing is posted. The same invoice twice, or an amount below the allocations, gets **400**.
> - An amount **above** the allocations (the "Any amount above the invoice balance will be stored as supplier credit" promise on the payment screen) now really creates a `supplier_overpayments` row (`ADV-<date>-P<payment id>`). It has its own `SUPPLIER_ADVANCE` cash/bank line, so it can be settled against later invoices. `payment_history.amount` holds only what reached the invoices, so the Supplier Ledger does not count it twice. This works for Cash and Bank only; Cheque and Card overpayments get **400** (use Advance Payment).
> - `request_id` (body, sent by both payment screens, one per form opening) or `Idempotency-Key` (header): `payment_history.request_id` is UNIQUE (`config/db.js`, `migrations/034_…sql`), so the same request twice records one payment.
> - Amounts compared in 1/10000 units (the columns are DECIMAL(…,4)).
> - Tests: `tests/db/supplierPayments.test.js` (12 tests, including two real concurrent races). 7 of them failed on the old code; all pass on the new code, 5 runs in a row. `npm run test:db` 31/31, `npm test` 217/217.
>
> **Correction to point 3 below:** before the fix, the unallocated part was not completely invisible. `services/purchasingPositionService.js` showed it as "unallocated payment credit" in the Supplier Ledger totals. It could not be settled against invoices, and the Analyst balance sheet ignored it. Payments made before this fix are unchanged. Run the data-check SQL below to find them.

**Where:** `controllers/purchaseController.js` `makePayment` (`:785-1163`). It is reached through `POST /purchases/:id/pay`, `POST /purchases/pay-multiple` and `POST /purchases/purchase/:id/pay`.

Three independent defects:

1. **Concurrent double payment.** The "already paid" guard (`:848-883`) is a **non-locking** `SELECT`. Under REPEATABLE READ it also fixes the transaction's read view. Two requests for the same invoice (a double-click, two tabs, or two users) both pass it. The second then blocks on `SELECT … FOR UPDATE` (`:942`) until the first commits. Its `reconcilePurchasePaymentState` (`:968`) sums allocations with a **non-locking** read, so it still sees the old snapshot without the first payment. It concludes the row "drifted", rewrites `paid_amount` back (`:86-90`), and applies the full amount again. Result: **two Cash/Bank credits** (`:1062-1090`), two allocation rows, and an invoice that shows paid once. On the next reconcile it shows a negative balance.
2. **No cap at outstanding.** `amountToApply = Math.min(requestedAmount, remainingPaymentAmount)` (`:975`) never compares against `currentOutstanding`. An allocation of 50,000 against a 1,000 balance stores `balance_amount = -49,000`, status `Paid`.
3. **Unallocated cash out.** `normalizedPaymentAmount` is the top-level `amount` when it is > 0 (`:889-891`). That amount is what gets posted to the ledger (`:1067`, `:1081`), but only the allocations reach AP. `{ amount: 100000, invoice_allocations: [{ id: 5, amount: 1000 }] }` credits the cash book 100,000 and applies 1,000. The other 99,000 is **not** recorded as supplier credit (the comment at `:1035` says advances moved to another flow). The Analyst balance sheet cannot see it either: `PURCHASE_POSITIONS_SQL` counts allocations, plus `ph.amount` only for payments with **no** allocation rows.

**Impact:** real cash leaves the books with no matching reduction in AP. Supplier statements and the cash book disagree, and nothing reports the difference.

**Fix (lock first, read latest, cap, and require amount = Σ allocations):**
```js
// controllers/purchaseController.js  - helpers
const toCents = (v) => Math.round((parseFloat(v) || 0) * 100);

// getActualAllocatedPaidAmount: add a `locking` option so the payment path reads
// the latest committed allocations, not the transaction's old snapshot.
const getActualAllocatedPaidAmount = async (queryable, purchaseId, excludePaymentId = null, { locking = false } = {}) => {
  // ... unchanged SQL ...
  //   ${extraCondition}
  // ${locking ? 'LOCK IN SHARE MODE' : ''}
};
```
```js
// makePayment - replace :805-905 validation + pre-check
const allocations = (Array.isArray(invoice_allocations) && invoice_allocations.length
  ? invoice_allocations.map((a) => ({ purchase_id: Number(a.purchase_id || a.id), cents: toCents(a.amount) }))
  : [{ purchase_id: Number(id), cents: toCents(amount) }]
).filter((a) => a.cents > 0);

if (allocations.some((a) => !Number.isInteger(a.purchase_id) || a.purchase_id <= 0)) {
  return res.status(400).json({ error: 'Invalid invoice in allocation' });
}
if (new Set(allocations.map((a) => a.purchase_id)).size !== allocations.length) {
  return res.status(400).json({ error: 'An invoice appears twice in this payment' });
}
const allocatedCents = allocations.reduce((s, a) => s + a.cents, 0);
if (amount !== undefined && amount !== null && amount !== '' && toCents(amount) !== allocatedCents) {
  return res.status(400).json({
    error: 'Payment amount must equal the total allocated to invoices. Record any excess as an Advance Payment.'
  });
}

await connection.beginTransaction();
// FIRST statement of the transaction is a locking read, in id order (no deadlocks,
// no early snapshot). A concurrent payment for the same invoice waits here.
const ids = allocations.map((a) => a.purchase_id).sort((a, b) => a - b);
const [locked] = await connection.query(
  `SELECT * FROM purchases WHERE id IN (?) AND COALESCE(deleted, 0) = 0 ORDER BY id FOR UPDATE`, [ids]
);
if (locked.length !== ids.length) { await connection.rollback(); return res.status(404).json({ error: 'One or more selected invoices could not be found' }); }
// ... same supplier / company checks on `locked` ...
```
```js
// inside the allocation loop (replaces :968-980)
const reconciled = await reconcilePurchasePaymentState(
  connection, purchaseId, invoiceTotal, currentPurchase.paid_amount, paymentHistoryId, { locking: true }
);
const outstandingCents = toCents(reconciled.balance_amount);
if (allocation.cents > outstandingCents) {
  await connection.rollback();
  return res.status(409).json({
    error: `Invoice ${currentPurchase.invoice_no} now owes ${(outstandingCents / 100).toFixed(2)} - `
      + 'it may have just been paid by someone else. Refresh and try again.'
  });
}
const amountToApply = allocation.cents / 100;
```
Also add request idempotency, using the same pattern `stock_adjustments.request_id` already has (migration `006`):
```sql
ALTER TABLE payment_history ADD COLUMN request_id VARCHAR(64) NULL, ADD UNIQUE KEY uq_payment_history_request (request_id);
```
The client sends `Idempotency-Key: <uuid per form open>`. The server inserts it into `payment_history` and on `ER_DUP_ENTRY` returns the earlier `payment_id` with 200. Apply the same lock-first ordering to `supplierCreditController.createOverpayment` / `settleCreditToInvoice` and `purchaseController.addSettlementToReturn`.

**Data check before deploy:**
```sql
-- payments whose cash-out exceeds what reached invoices (R1.3)
SELECT ph.id, ph.payment_date, ph.amount, COALESCE(SUM(ppa.allocated_amount), 0) AS allocated
  FROM payment_history ph LEFT JOIN purchase_payment_allocations ppa ON ppa.payment_history_id = ph.id
 GROUP BY ph.id HAVING allocated > 0 AND ph.amount - allocated > 0.009;
-- invoices over-paid (R1.1 / R1.2)
SELECT id, invoice_no, total_with_vat, paid_amount, balance_amount FROM purchases WHERE balance_amount < -0.009;
```

---

### R2: Store Keeper can pay suppliers (no segregation of duties on AP)
> **Decision (2026-10-15): accepted, do not change.** The owner keeps Store Keeper's supplier-payment access exactly as it is. The fix below is kept for reference only and is **not** to be applied.

**Where:** `config/rolePermissions.js:69` grants `STORES` the `rawMaterial` module. The rules `/purchases` (`:130`), `/suppliers` (`:137`) and `/purchase-returns` (`:146`) give that module **full write**, with no `writeRoles`.

Verified with `evaluateApiAccess`:
```
Store Keeper POST /api/purchases/12/pay           => allowed
Store Keeper POST /api/purchases/pay-multiple     => allowed
Store Keeper POST /api/suppliers/pay-now          => allowed   (advance payment, posts Cash/Bank)
Store Keeper POST /api/purchase-returns/5/settle  => allowed
```
**Impact:** the same person can raise a GRN (supplier, quantities and prices are all client-set, see R7) **and** release Cash/Bank against it. This is the classic fictitious-vendor and inflated-invoice fraud path. The 10-14 decision applied segregation of duties to collections. AP has none.

**Fix:** keep GRN entry with Stores, and move money-out to Accountant (and Admin) with `writeRoles`. No controller change is needed:
```js
// config/rolePermissions.js - API_RULES (longest prefix wins)
// Money out to suppliers: Accountant / Admin / Super Admin only. Stores records GRNs.
{ prefix: '/purchases/pay-multiple', modules: [M.RAW_MATERIAL], writeRoles: [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN] },
{ prefix: '/purchases/purchase',     modules: [M.RAW_MATERIAL], writeRoles: [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN] },
{ prefix: '/suppliers/pay-now',      modules: [M.RAW_MATERIAL], writeRoles: [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN] },
{ prefix: '/suppliers/settle-credit',modules: [M.RAW_MATERIAL], writeRoles: [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN] },
```
`/purchases/:id/pay`, `/purchases/:id/settle` and `/purchase-returns/:id/settle` have the id in the middle, so a prefix rule cannot match them. Add a suffix check to `evaluateApiAccess`:
```js
// config/rolePermissions.js
const MONEY_OUT = /^\/(purchases|purchase-returns)\/\d+\/(pay|settle)$/;
const MONEY_OUT_ROLES = [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN];
// in evaluateApiAccess, after the view-only check:
if (!isRead && MONEY_OUT.test(toApiPath(url)) && !MONEY_OUT_ROLES.includes(canonical)) {
  return { allowed: false, reason: 'module' };
}
```
Mirror the change in `client/src/config/rolePermissions.js` and hide the Pay / Settle buttons for Stores. Add tests to `tests/accessControl.test.js` for each route above, for Stores (403) and Accountant (allowed). **Business confirmation needed:** does any branch have a Store Keeper who legitimately pays cash suppliers? If so, give them a cash-only limit instead of full access.

---

### R3: Deleting a wastage note hides the loss but keeps the stock reduction
> **Correction (2026-10-15): severity lowered to MEDIUM.** No client page calls `DELETE /api/wastages/:id`. The Edit and Delete buttons were removed from Wastage History (`WastageHistory.jsx:199`), and the trash icon on Edit Wastage (`EditWastage.jsx:572-581`) only removes an item line from the form. The defect can only be triggered by a direct API call with a valid token from a Raw Material role (Store Keeper, Accountant, Admin, Super Admin), for example from browser dev tools or Postman. The normal way to correct a wrong note is **Edit Wastage**, which replaces the item lines, so the stock is correct. Fix the formulas anyway, or remove the unused `DELETE` route (`routes/wastageRoutes.js:12`).

> **Fixed (2026-10-15, uncommitted):** `DELETE /api/wastages/:id` and `wastageController.deleteWastage` were removed. A note is corrected only through Edit (PUT), which replaces its item lines. Regression test: `tests/wastageRoutes.test.js`. **Still to check in production:** notes deleted before this fix (`SELECT id, wastage_note_number, date FROM wastages WHERE status = 0;`). Each one is still subtracted from stock while hidden from every list. Decide per note whether to restore it (`status = 1`) or reverse it by editing.
**Where:** `controllers/wastageController.js:284` soft-deletes (`UPDATE wastages SET status = 0`). The wastage list (`:83`) and detail (`:150`) then hide it. **No stock formula filters on `w.status`:**
`services/rmStockService.js:62,107` (Orders / low stock), `controllers/reportController.js:114,164,338,345,476,483` (Stock report, stock-by-range), `controllers/adjustmentController.js:638` (system qty used for adjustments), `controllers/analystController.js:254` (balance-sheet stores value), `controllers/dashboardController.js:147`, `controllers/itemController.js:111,173`, `controllers/issuanceController.js:304`.

**Impact:** deleting a wastage note does **not** return the stock. The quantity stays gone from stock, inventory value and the balance sheet, with no visible wastage document behind it. That is exactly "silently vanishing" shrinkage. It can also be used to hide shrinkage: record wastage, then delete it, and the loss stays in stock while it disappears from every wastage report. The daily-transaction drill-down (`reportController.js:653`) still lists deleted notes, so the reports disagree with each other.

**Fix:** add the filter in every formula. The lasting fix is one shared SQL fragment (see M7):
```js
// services/rmStockService.js - single definition, imported by every report
const ACTIVE_WASTAGE = 'COALESCE(w.status, 1) = 1';
// e.g.
//   SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
//     FROM wastage_items wi JOIN wastages w ON wi.wastage_id = w.id
//    WHERE ${ACTIVE_WASTAGE} [AND DATE(w.date) <= ?]
//    GROUP BY wi.item_id
module.exports.ACTIVE_WASTAGE = ACTIVE_WASTAGE;
```
Apply it at all 14 sites listed above. Also require a reason on delete and record it (`wastages.deleted_by`, `deleted_at`, `delete_reason`, with `deleted_by = actorId(req)`). Add `tests/wastageStock.test.js`: create, delete, then `getItemStock` must equal the opening stock.

---

### Carried HIGH (re-verified at `1b56c0c`, unchanged)
- **H4:** `issuanceController.createIssuance` (`:5-60`) has no stock check and no item lock. `adjustmentController.createAdjustment` (`:309-368`) computes `variance = actual_qty - system_qty` from the **client's** `system_qty`, takes `user_name` from the body, and records `updatedBy: null` (`:352`). Adjustments are limited to the Adjustments module (Admin and Super Admin), which reduces the exposure. Fix as in the 10-12 report: recompute `system_qty` server-side under `SELECT … FROM items WHERE id = ? FOR UPDATE`, and add a `pending → approved` status that only a second user can approve.
- **H5:** there is no approval state on any expense (`newExpenseRoutes`, `expenseRoutes`, `cashExpenseRoutes`). 23 `DELETE FROM` statements remain. The ones that matter most: petty cash voucher (`expenseRoutes.js:519`), cheque expense (`:894`), online expense and its payments (`:1422-1427`), stock adjustment (`adjustmentController.js:796`) and R8.
- **H6:** `utils/rmAdjustmentAudit.js:1` still records only when the client sends `X-RM-Adjustment: true`. Sync problems still only `console.warn` (`collectionSyncService.js:295`). There is no `audit_log` table.
- **H7:** fixed 2026-10-16, see below. The design that follows is the original proposal; what was built is described in the box.

#### H7 fix: a lock date that every money/stock write checks
> **Fixed (2026-10-16, uncommitted). Built differently from the proposal below, to the owner's rules:**
> - **A rolling window, not a manual lock date.** Only the current month and the month before it are open (`PERIOD_OPEN_MONTHS`, default 2). On 2026-10-16 everything before 2026-09-01 is closed. It moves by itself at the start of each month.
> - **Closed means closed for everyone**, Admin included: nothing dated in a closed month can be created, edited, moved out of it, or voided.
> - **To correct a closed month:** an Admin (or the Super Admin) sends a re-open request (months + reason, `/period-close`), **only the Super Admin approves** (for 1-168 hours, default 24) or rejects, and either can close it again early. While it is open, **only an Admin / Super Admin** can post or edit in it; Accountant, Stores and the rest stay blocked. Every step is also recorded by the Audit Trail.
> - **Enforced twice:** `middleware/periodGuard.js` checks every data-changing request (the dates in its body, and the date of the record it edits or voids) before the controller runs; `utils/financeLedger.js` checks every Cash / Bank posting again, whatever route made it. A refusal is a `409` with the reason; a controller's catch-all `500` is turned into that same `409` (`services/requestContext.js`). If the check itself fails, the change is refused.
> - **Covered:** purchases and payments, purchase returns and settlements, supplier advance / settle credit, issue notes, wastage, department returns, opening balances, stock adjustments, all Expenses modules (bills, petty cash, cheques, bank charges, online, cash, hidden, credit notes), Finance (cash / bank receive, issue, transfers, intercompany, card realisation, cheque release), staff loans, income, in-hand adjustments, collection approval.
> - **Not covered:** Cutlery (purchases, transfers, damages), Orders, Employees and master data (items, suppliers, payees ...). Add a module by listing its path in `GUARDED_PREFIXES` (and its table + date column in `RECORD_DATES`) in `middleware/periodGuard.js`.
> - **The automatic cheque release** skips (and logs) a cheque whose release date is in a closed month instead of posting behind the closed books, and no longer lets one such cheque roll back the whole batch.
> - **`balance_after` fixed.** A row posted with an earlier date than rows already in the ledger got the account total, and the rows after it kept stale balances. New postings now get the balance at their own date and the later rows are rebuilt (`rebuildBalanceAfter`, a window-function UPDATE in ledger order `transaction_date, created_at, id`). Rows that are edited, moved or voided in place (payment adjustments, petty cash reimbursement, bank charge, bank opening balance, cheque release) are refreshed too. The Cash / Bank ledger screens already computed running balances themselves, so what was wrong was the stored value, which any export or direct query would have shown.
> - **Existing data:** `node scripts/rebuildLedgerBalances.js` is a dry run (counts only); `--apply` repairs. On the local copy of production data the dry run found **931 rows with a wrong stored balance in 8 accounts**. **Not applied** - back up first, then run it.
> - **Operational:** after deploy, anything dated before the window needs a re-open: for example approving an old POS collection, releasing an old cheque, or an old opening balance. Set `PERIOD_OPEN_MONTHS` in `.env` to change the window.
> - Tests: `tests/periodLock.test.js` (24 unit), `tests/db/periodClose.test.js` (22 database, through the real routers and ledger), `client/src/components/PeriodClose/PeriodClose.test.jsx` (14). Each defect was re-introduced once to check a test fails (lock off, anyone may edit, Admin may approve, wrong balance_after, cheque job not skipping).

The original proposal, kept for reference:
```sql
CREATE TABLE accounting_period_lock (
  company_id INT NOT NULL PRIMARY KEY,
  locked_through DATE NOT NULL,          -- nothing dated on/before this may be created, edited or voided
  locked_by INT NOT NULL, locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```
```js
// services/periodLock.js
class PeriodLockedError extends Error { constructor(m) { super(m); this.name = 'PeriodLockedError'; this.status = 409; } }
const assertOpen = async (connection, companyId, ...dates) => {
  const [rows] = await connection.query(
    'SELECT DATE_FORMAT(locked_through, "%Y-%m-%d") AS d FROM accounting_period_lock WHERE company_id = ? LOCK IN SHARE MODE',
    [companyId]);
  const lockedThrough = rows[0]?.d;
  if (!lockedThrough) return;
  for (const d of dates.filter(Boolean)) {
    if (String(d).slice(0, 10) <= lockedThrough) {
      throw new PeriodLockedError(`The books are closed through ${lockedThrough}. Post an adjustment in the open period instead.`);
    }
  }
};
module.exports = { assertOpen, PeriodLockedError };
```
Call it inside `recordCashTransaction` / `recordBankTransaction` (one place covers every cash and bank posting) and in the create/update/delete paths for purchases, issuances, wastages, returns and adjustments. On update, pass both the old and the new date. Setting `locked_through` should be Accountant/Admin with `writeRoles`, and each change should write an `audit_log` row.

---

## [MEDIUM]

### R4: Actor fields still taken from the request body
> **Fixed (2026-10-15, uncommitted).**
> - Issued By (issuances), Entered By (wastages), the new `stock_adjustments.created_by`, Settled By (Settle Now, both return-settle routes, and the `payment_history.created_by` they write) and Returned By now all come from `actorId(req)`. Body values are ignored.
> - **Approved By** (Issue, Wastage, Stock Adjustment `user_name`) is the approver typed on the form when there is one (often someone without a login). Otherwise it is the signed-in user's name (`utils/actor.approverName`). The form field is now optional and labelled so.
> - The pages no longer send `issued_by`, `settled_by`, `returned_by`, `created_by` or `prepared_by`. Issue, Wastage and Stock Adjustment details show Issued By / Entered By.
> - Tests: `tests/db/actorFields.test.js` (5 tests, each sending another user's id). All 5 fail on the old code and pass on the new.
> - Not changed: Cutlery `reported_by` / `transferred_by` are free-text staff names, and the logged-in user is already saved there as `created_by`.

The N4/H2 sweep fixed 11 sites but missed these:

| Where | Field | Effect |
|---|---|---|
| `issuanceController.js:9,13,30` (create) and `:187,191` (update) | `issued_by`, `approved_by` | Issue notes credited to any user id, and "approved by" anyone |
| `wastageController.js:7,179` | `approved_by` (free text) | Wastage "approved" by any name, with no approval step |
| `adjustmentController.js:310,340,758` | `user_name` | Stock adjustment attributed to any name |
| `supplierCreditController.js:296,357,386,412` | `settled_by` → `credit_allocations.settled_by` **and `payment_history.created_by`** | A supplier-credit settlement is recorded as made by any user |
| `purchaseReturnController.js:1136,1266` | `settled_by` | Same, for return settlements |

**Fix:** `const actor = actorId(req); if (!actor) return res.status(401)…` and use `actor` in every one of these places. Approval should be a separate endpoint called by a second user (`approved_by = actorId(req)`, and `approved_by <> issued_by` enforced). Never accept it as a form field. Add a source-level test that fails if `req.body` destructuring contains a field matching `/_by$|user_name/`.

### R5: Cash in Hand can go negative (the "insufficient balance" guard was never written)
`utils/financeLedger.js:3-8` defines `InsufficientBalanceError`. Nothing in `server/` throws it, but 10 handlers catch it (`financeController.js:236,397,712,795`, `purchaseController.js:1156`, `cashExpenseRoutes.js:177,296`, `expenseRoutes.js:394,598`, `intercompanyController.js:227`). `recordCashTransaction` posts any credit. Negative physical cash is impossible, so a negative balance is either an unrecorded receipt or a fictitious payment, and nothing stops it.
```js
// utils/financeLedger.js - recordCashTransaction, after computing newBalance
if (creditAmt > 0 && newBalance < 0 && !allowNegative) {
  throw new InsufficientBalanceError(
    `Cash in hand would fall to ${newBalance.toFixed(2)}. Record the cash received first.`);
}
```
Add an `allowNegative = false` parameter. Leave bank accounts permissive unless the business confirms they have no overdraft facility. The balance read already runs under `FOR UPDATE`, so the check is race-free.

### R6: A test endpoint writes fake transactions in production
`routes/cutleryStockReport.js:14` exposes `GET /api/cutlery-reports/stock-report/test`, handled by `cutleryStockReportController.js:563`. It **deletes** any cutlery purchase, transfer or damage whose number starts with `TEST-`, then inserts a Rs 1,000 "PAID" purchase, a transfer and a damage under the first user in the table, and leaves them there. Any Admin opening the URL changes cutlery stock and purchase totals. Because it is a GET, no "are you sure" applies.
**Fix:** delete the route and the function. If it is needed, move it to a script that runs against the `_test` database only (`tests/db/useTestDatabase.js`).

### R7: GRN and stock-movement payloads are not validated
- `createPurchase` / `updatePurchase` (`purchaseController.js:170,226-233,556,581-588`): `items[].quantity` and `unit_price` are inserted as-is (negative, zero or text). `subtotal`, `vat_amount` and `total_with_vat` are stored as the client sent them and never recomputed from the lines. A negative quantity on a GRN **reduces** stock. An inflated `total_with_vat` raises the amount payable (and with R2, the person who typed it can pay it).
- Issuance, wastage and return items have the same gap. A negative issuance quantity **adds** stock.

```js
// utils/validateLines.js
const toCents = (v) => Math.round(Number(v) * 100);
const validateLines = (items, { needsPrice }) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw httpError(400, 'At least one item is required');
  return items.map((it, i) => {
    const itemId = Number(it.item_id);
    const qty = Number(it.quantity);
    if (!Number.isInteger(itemId) || itemId <= 0) throw httpError(400, `Line ${i + 1}: invalid item`);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6 || Math.round(qty * 1000) !== qty * 1000) throw httpError(400, `Line ${i + 1}: quantity must be > 0 (max 3 decimals)`);
    if (!needsPrice) return { item_id: itemId, quantity: qty };
    const price = Number(it.unit_price);
    if (!Number.isFinite(price) || price < 0 || price > 1e8) throw httpError(400, `Line ${i + 1}: invalid unit price`);
    return { item_id: itemId, quantity: qty, unit_price: price, lineCents: Math.round(qty * price * 100) };
  });
};
// createPurchase / updatePurchase
const lines = validateLines(items, { needsPrice: true });
const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0);
const vatRate = Number(vat_rate);
if (![0, 18].includes(vatRate)) throw httpError(400, 'Unsupported VAT rate');   // confirm the allowed rates
const vatCents = Math.round(subtotalCents * vatRate / 100);
if (Math.abs(toCents(total_with_vat) - (subtotalCents + vatCents)) > 1) {
  throw httpError(400, 'Invoice total does not match its lines. Re-check quantities, prices and VAT.');
}
// store subtotalCents/100, vatCents/100, (subtotalCents+vatCents)/100 - never the client's numbers
```
Also confirm that each `item_id` exists and is active, and that `supplier_id` / `company_id` exist (`SELECT … FOR SHARE`). Check the supplier's invoice before deploying: some suppliers round VAT per line. If so, allow ±1 cent per line rather than ±1 overall.

### R8: Bank-charge delete removes the ledger row
`routes/expenseRoutes.js:1220-1253` runs `DELETE FROM bank_charges` and then **`DELETE FROM finance_transactions`** (`:1242`), and patches the `bank_details.current_balance` cache by hand. The cash/bank ledger is the only book of record, and a row disappears from it with no trace. Every other void in the codebase (`cashOtherLedgerController.voidCashIssued`, `financeController`) reverses with `status = 0` or a contra row.
**Fix:** void with a contra entry, and keep both rows:
```js
await connection.query("UPDATE bank_charges SET status = 0, voided_by = ?, voided_at = NOW() WHERE id = ?", [actorId(req), id]);
await recordBankTransaction(connection, {
  bankId: oldRows[0].bank_id, date: todayInOpenPeriod, remark: `VOID bank charge #${id}`,
  debit: oldCredit, transactionType: 'Bank Charges Reversal',
  referenceType: 'BANK_CHARGE_VOID', referenceId: id, createdBy: actorId(req)
});
```
After that, `REVOKE DELETE ON bsms.finance_transactions FROM 'bsms_app'@'%'` (run the app as a least-privilege user, N6), so the database refuses ledger deletes even if a code path is missed.

### Carried MEDIUM (unchanged, fixes in earlier reports)
- **H3:** `purchaseController.js:174-221` still uses `paid_amount` from the body and writes "Initial payment" with no cash/bank posting. Remove `paid_amount` from create/update and route every payment through `makePayment` (after R1).
- **M3:** `collectionSyncService.js:260-261` updates amounts on `pending` rows in place, so an accountant can approve figures that changed after review. Fix: `payload_hash` per item in `POST /collections/approve`.
- **M5:** add `utils/money.js` (integer cents, or BigInt where amounts can be large). `newExpenseRoutes.js:273` already has `toCents`; promote it and use it in `purchaseController`, `financeLedger` and `collectionMapper.toMoney`. DB columns are already `DECIMAL`.
- **M7, extended:** at least **four** stock definitions now exist: `rmStockService` (7 sources); `dashboardController.js:144-148` and `itemController.js` (5 sources, **no purchase returns or adjustments**); `analystController` (filters deleted purchases, the others do not); and `items.current_stock` (see R10). Make `rmStockService` the only definition, export it as a SQL fragment, and use it everywhere. Fix R3 in that one place.

---

## [LOW]

- **R9a:** `services/referenceValidationService.js` blocks duplicate voucher, cheque and reference numbers across 11 tables with a plain `SELECT`. Two concurrent saves with the same number both pass. Only `purchases.invoice_no` and `inhand_adjustments.reference_no` have a real UNIQUE key. **Fix:** a `reference_registry (ref_norm VARCHAR(100) PRIMARY KEY, source_table, source_id)` table, inserted in the same transaction (`ref_norm = LOWER(TRIM(ref))`). The unique key does the check, and `ER_DUP_ENTRY` maps to the existing `DuplicateReferenceError`.
- **R9b:** these 500 responses return `'Server error: ' + error.message`: `purchaseController.js:270,1159` and `adjustmentController.js:365,813`. SQL errors then leak table and column names. Return a fixed message and log the detail.
- **R10:** `POST /api/returns/sync-stock` (`returnRoutes.js:13`, open to Store Keeper) rewrites `items.current_stock` for **every** item from `stock_movements`. Issuances and wastages never write `stock_movements`, and adjustments write type `ADJUSTMENT`, which the sync ignores (it only counts `ADJUSTMENT_POSITIVE/NEGATIVE`). The result is wrong and is shown by `GET /returns/item-stock/:itemId`. Remove the endpoint and the `current_stock` column reads, and use `rmStockService.getItemStock`.
- **N1-tail:** still `BSMS-SIG-1`, so the host is not signed. Strict origin and HTTPS in production already close the practical path. Do this when the Laravel side is next deployed.

---

## 2. Domain-by-domain answer to the brief

| Domain | Verdict at `1b56c0c` |
|---|---|
| 1. Ingestion auth | **Good.** ECDSA P-256 signed pulls with nonce and 5-min window. Strict same-origin pagination and HTTPS in production (N1 fixed). Host not yet signed (low). |
| 1. Idempotency | **Good for collections.** `UNIQUE(source_system, source_type, source_id)`, unique completed reference (N2), `FOR UPDATE` in id order with per-record savepoints. Supplier payments: fixed 2026-10-15 (R1: invoice lock first, `request_id` UNIQUE). |
| 1. Payload validation | Collections: heuristic mapping (M4), POS total cross-check before approval (`collectionService.js:410-414`). GRNs and stock lines: **none** (R7). |
| 2. Valuation / COGS | Not implemented (C5). Last-price valuation, and the balance-sheet stores value is skewed by deleted wastage (R3). |
| 2. Atomic stock reductions | None: no item lock or availability check (H4). Negative quantities accepted (R7). |
| 2. Adjustments / write-offs | No approval (H4). Client-supplied system qty and user name (H4, R4). Deleted wastage still reduces stock (R3). No loss-ledger posting (C4). |
| 3. Double entry / CoA | Absent (C4). AP and cash book can diverge silently (R1, H3). |
| 3. Approval workflows | Collections: Accountant-only approve (good). Expenses: none (H5). Supplier payments: Store Keeper can pay (R2, accepted 2026-10-15). |
| 4. P&L / precision | No P&L engine. Money handled as floats in JS (M5). Columns are `DECIMAL`. The expense-payment path already uses cents (`newExpenseRoutes.js:273`). |
| 4. Period close | **Fixed 2026-10-16** (H7): rolling 2-month window, Super Admin-approved re-opens, Admin-only edits inside them. |
| 5. RBAC | Central default-deny table. Role re-read from the DB on every request (N3 fixed). Store Keeper pays suppliers by design (R2, accepted 2026-10-15). |
| 5. IDOR / branches | Collections are row-filtered in per-user mode. All Accountants see all branches (accepted 2026-10-14). Everything else has no company scoping (M8). |
| 6. Audit trail | Opt-in by header and mutable (H6). Ledger rows hard-deleted (R8). Sync rejects not persisted (H6). |

---

## 3. Remediation order

| When | Action |
|---|---|
| **Now** | R3 done (route removed); check production for `wastages.status = 0`. R6 (delete the test route). Run the R1 data-check SQL on production. |
| **This week** | R1 done (lock first, cap, excess → supplier credit, request_id). R4 (`actorId`). R5 (negative cash guard). R7 (line validation + server-side totals). R8 (void, not delete) + least-privilege DB user. |
| **2–4 weeks** | H7 done. H5 expense approval + void-not-delete everywhere. H6 `audit_log` + `integration_sync_log`. M3 payload hash. R9 reference registry. M7 single stock definition (also removes R10). |
| **Quarter** | C4 GL and posting map. C5 WAC + RAVON sale lines. M5 money migration. M8 company scoping. BSMS-SIG-2. |

*All line numbers are for commit `1b56c0c`.*
