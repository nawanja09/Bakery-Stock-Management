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
| H4 | **Fixed** 2026-10-19 (was HIGH) | No stock-availability check or item lock; adjustments trust client `system_qty`; no approval step | carried |
| H5 | HIGH (part 2 **fixed** 2026-10-17) | **No expense maker–checker (open)**. Hard deletes: **fixed**, nothing is hard deleted any more | carried |
| H6 | **Mostly fixed** 2026-10-16 (was HIGH) | Audit trail opt-in (`X-RM-Adjustment` header) and mutable; sync rejects go only to `console.warn`. **Now:** append-only `audit_log` (UPDATE/DELETE refused by triggers) written by the server for every sign-in event (success, failure, lock-out), sign-out, password change, data change and refused (403) request, with user, sign-in session, IP, browser, redacted request / response data and result (`services/auditLog.js`). Data views are not recorded (business decision). Audit Trail page for Admin / Super Admin (`/audit-trail`). **Follow-ups done 2026-10-16:** (1) every POS / Restaurant sync run is an Audit Trail row (event SYNC) with counts, rejected records + reasons and errors; (2) edits / deletes / pay / settle of a single record store the record before and after (`services/auditSnapshots.js`, ~50 routes incl. line items) and the page shows field-by-field old -> new; (3) `scripts/createAppDbUser.js` + `AUDIT_DB`: audit_log in its own schema where the app account has SELECT, INSERT only (no UPDATE / DELETE / ALTER / DROP / TRIGGER) - the test (`tests/db/appDbUser.test.js`) is skipped on the local XAMPP server because `mysql.db` is corrupt, so this part is **not yet verified against a live server**; (4) `TRUST_PROXY` (.env) so the Audit Trail and the per-IP sign-in limit see the real client address behind nginx. **Owner action:** set `TRUST_PROXY` in production, run `createAppDbUser.js --apply` and switch `.env` to the new account | carried |
| H7 | **Fixed** 2026-10-16 (was HIGH) | No period close; back-dating allowed everywhere; `balance_after` wrong for back-dated rows | carried |
| **R4** | **Fixed** 2026-10-15 (was MEDIUM) | Actor spoofing survived the N4 sweep: `issued_by`, `approved_by`, `user_name`, `settled_by` (written into `payment_history.created_by`) | **new** |
| **R5** | **Fixed** 2026-10-19 (was MEDIUM) | `InsufficientBalanceError` was never thrown, so Cash in Hand can be driven negative; every "insufficient balance" handler is dead code | **new** |
| **R6** | **Fixed** 2026-10-17 (route removed) | `GET /api/cutlery-reports/stock-report/test` writes fake purchases, transfers and damages into production data | **new** |
| **R7** | **Fixed** 2026-10-19 (was MEDIUM) | GRN, issuance, wastage and return payloads are not validated: negative quantities, and client-supplied subtotal/VAT/total | **new** |
| **R8** | **Fixed** (void, not delete) | Deleting a bank charge hard-deleted its `finance_transactions` row | **new** (H5 instance) |
| H3 | **Fixed** 2026-10-20 (was MEDIUM, latent) | `paid_amount` client-set on create/update; "Initial payment" not booked in the cash book | carried |
| M3 | **Fixed** 2026-10-20 (was MEDIUM) | Approver can post amounts they never reviewed (pending rows are re-synced in place) | carried |
| M4 | MEDIUM | Heuristic POS payload mapping | carried |
| M5 | **Fixed** 2026-10-20 (was MEDIUM) | Floating-point money: every place that adds, subtracts, multiplies, compares or sums money now uses exact decimals (`utils/money.js`). About 130 `parseFloat` calls remain that only convert a database value for JSON output (no arithmetic) | carried |
| M7 | **Fixed** 2026-10-19 (was MEDIUM) | Several different stock formulas (dashboard, items, issuance page, purchase return page, system quantity, reports, balance sheet) that disagreed on what counts | carried, extended |
| M8 | **Accepted** 2026-10-20 (was MEDIUM) | No company/branch isolation: a user with a module sees and edits every company and branch. Business decision: staff are trusted across companies, so no scoping is built | carried |
| **R9** | **Fixed** 2026-10-19 (was LOW) | Cross-table reference uniqueness enforced only by `SELECT` (race); 500 responses echo `error.message` | **new** |
| **R10** | **Fixed** 2026-10-19 (was LOW) | `POST /returns/sync-stock` (Store Keeper) overwrote `items.current_stock` from a table issuances never write | **new** |
| N1-tail | LOW (**deferred**, 2026-10-20) | Host is still not in the request signature (`BSMS-SIG-1`, `integrationAuthService.js:170,194`). Needs the matching change in the RAVON Laravel apps, which cannot be deployed or accessed now; only this repo is available. Strict origin + HTTPS in production already cover the practical risk | carried |

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
**Impact:** the same person can raise a GRN (supplier and quantities are client-chosen; R7 now validates and server-recomputes the numbers, but does not require a second person) **and** release Cash/Bank against it. This is the classic fictitious-vendor and inflated-invoice fraud path. The 10-14 decision applied segregation of duties to collections. AP has none.

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
- **H4:** fixed 2026-10-19, see below. The original finding is kept for reference: `issuanceController.createIssuance` had no stock check and no item lock. `adjustmentController.createAdjustment` computed `variance = actual_qty - system_qty` from the **client's** `system_qty`, took `user_name` from the body, and recorded `updatedBy: null`. Adjustments were limited to the Adjustments module (Admin and Super Admin), which reduced the exposure.
- **H5, part 2 (hard deletes) fixed 2026-10-17, owner's rule: nothing is hard deleted, a deleted record stays in the database with a status so it can be found later.**
  - Records (companies, departments, item types, cutlery damages / locations, expense vouchers, bank charges ...): `is_deleted` + `deleted_at` + `deleted_by` through `services/softDelete.js`; lists, lookups and reports filter `is_deleted = 0`. Ledger rows are voided (`status = 0`), never removed.
  - **Stock adjustments** (the last record type): soft deleted with who / when / **why** (`delete_reason`, optional); its stock movement is flagged too. All 17 places that sum or list adjustments now ignore deleted ones (12 were missing the filter: system quantity, lists, details, summary, stock report, stock-by-range, issue stock).
  - **Item lines** replaced when an invoice / issue note / wastage note / cutlery document is edited cannot be soft deleted in place (every stock and cost sum would count the old and new lines together). The old lines are copied as they were into `record_line_history` (who, when, JSON) before they are replaced (`services/lineHistory.js`). The edited record itself is in the Audit Trail with old and new values.
  - **Audit Trail** now records a soft delete as "deleted" (it kept showing the flagged row).
  - The code has 6 `DELETE FROM` left, all line replacement, each preceded by `archiveLines`. A test (`tests/db/softDelete.test.js`) scans the code and fails if any other hard delete, or an unarchived one, is added.
  - **Still to do on the server:** take `DELETE` away from the application's database user, except on the 6 line tables, so the database refuses any missed hard delete.
- **H5 (original wording, part 1 still open):** there is no approval state on any expense (`newExpenseRoutes`, `expenseRoutes`, `cashExpenseRoutes`). 23 `DELETE FROM` statements remain. The ones that matter most: petty cash voucher (`expenseRoutes.js:519`), cheque expense (`:894`), online expense and its payments (`:1422-1427`), stock adjustment (`adjustmentController.js:796`) and R8.
- **H6:** `utils/rmAdjustmentAudit.js:1` still records only when the client sends `X-RM-Adjustment: true`. Sync problems still only `console.warn` (`collectionSyncService.js:295`). There is no `audit_log` table.
- **H7:** fixed 2026-10-16, see below. The design that follows is the original proposal; what was built is described in the box.

#### H4 fix: stock locked and checked before issuing; adjustments need a second approver
> **Fixed (2026-10-19, uncommitted).**
> - **Issue to Department (`services/stockAvailability.js`, used by `issuanceController.createIssuance`/`updateIssuance`)** now locks every item named on the note (`SELECT id FROM items WHERE id = ? FOR UPDATE`, in ascending item-id order so two multi-item issuances can never deadlock on each other) and checks its **live** stock before anything is written. If any line would take an item below zero, the whole note is refused with the item name and the shortfall ("Flour: requested 15 kg, only 10.000 kg available") and nothing is inserted. Editing an issuance excludes its own current lines from the check first (they are being replaced, not added on top of).
> - **The race this was meant to close:** two Store Keepers issuing the same item at the same moment, both reading "10 in stock" and both succeeding, taking the item to −2. The item lock alone did not close it - the real cause was **statement order**. Under MySQL/MariaDB REPEATABLE READ, a transaction's first plain (non-locking) read anchors the snapshot every later plain read in that transaction shares, no matter which table it touches. The controllers were looking up the approver's name (a plain `SELECT` on `users`) *before* locking and checking the item, which anchored a stale snapshot before the lock-wait even started. The fix was to make the stock lock-and-check the **first** database statement of the transaction, every time, in `createIssuance`, `updateIssuance`, `createAdjustment` and `updateAdjustment` - confirmed by a mutation test (revert the ordering, the concurrency test fails every time; restore it, it passes).
> - **Stock Adjustment (`adjustmentController.js`)**: `system_qty` is never taken from the client - `resolveSystemQuantity` locks the item and reads live, approved-only stock itself. A tampered `system_qty: 0` in the request body is silently ignored and overwritten with the real figure.
> - **Maker-checker on adjustments:** a new adjustment is saved `Pending` and has **no stock effect** - every "current stock" query everywhere (reports, stock-by-range, issue stock, the adjustment screen itself) now requires `status = 'Approved'`. `PATCH /adjustments/:id/approve` moves it to `Approved` only when the approver is a **different** user than whoever created it (403 otherwise), is Admin/Super Admin (role-gated by the existing route permissions), and it is not already approved (409). Once `Approved` it is immutable - edit is refused (409); delete it and create a fresh one instead. New columns: `status`, `approved_by`, `approved_at` (`migrations/040_stock_adjustment_approval.sql`).
> - The client UI (`StoresAdjustments.jsx`) shows a Pending/Approved badge, an Approve button for anyone except the creator, and disables Edit once approved; the save confirmation says the adjustment is pending approval.
> - Tests: `tests/db/stockAvailability.test.js` (17) - availability (success down to exactly zero, shortage with message format, zero-stock item, multi-item shortage, negative/zero/non-numeric quantity rejected, duplicate lines summed), the real concurrency race (2-way and 3-way, over real HTTP against the test database), editing with credit-back, tampered `system_qty` ignored, and the full maker-checker flow (pending has no effect, self-approval blocked, role-restricted, double-approve blocked, edit-blocked-once-approved, period-lock on approve). Full unit suite (262 tests) and full DB suite (113 tests, 2 skipped) both pass with no regressions.
> - **Not covered:** Wastage and Return do not yet have the same availability check (they can still reduce stock below zero); the same `lockAndCheckAvailability` pattern should be applied there next.


#### H4, second half: wastage and purchase returns (fixed 2026-10-20)
Goods leaving stock by wastage or by return to a supplier had no availability check, so stock could go below zero. Both now use the same `lockAndCheckAvailability` as Issue to Department (`services/stockAvailability.js`):
- **Wastage create / edit** (`wastageController.js`): the items are locked and their live stock checked as the **first query** of the transaction; "Not enough stock - Flour: requested 8 kg, only 5.000 kg available" (HTTP 400, nothing written). On edit, the note's own old lines are credited back first (they are replaced, not added on top).
- **Purchase return** (`purchaseReturnController.js` `createPurchaseReturn`): the same lock + check, before the supplier lookup or any insert. Lines that arrive without an `item_id` (resolved by name further down) are not covered; the page always sends `item_id`.
- **Department Return** adds stock, so no availability check applies. (Whether a department may return more than it was issued is a separate business rule, not built.)
- Tests: `tests/wastageReturnStock.test.js` (6); the DB test `tests/db/supplierCreditSettlement.test.js` now gives its item opening stock. Unit suite 307/307, DB suite 137/137.

#### M5 fix: exact decimal money everywhere it is calculated (fixed 2026-10-20)
2026-10-19 covered the core paths (ledger, invoice totals, payment state, POS amounts). This pass converted **every remaining place that does arithmetic on money**. The ~280 `parseFloat`/`toFixed` sites became about 150, and the rest only turn a database value into a number for JSON output.
- **`utils/money.js`** gained `min`, `max` and `sum` (float-safe `Math.min`, `Math.max` and `reduce`).
- **Payments and settlements:** `purchaseController` (settle a return against an invoice, payment adjustment, paid-amount drift check, 4-decimal payment units now parsed as text), `purchaseReturnController` (item amounts, VAT, subtotal/total, settlements; VAT is rounded once at the end, the same rule as an invoice), `supplierCreditController`.
- **Expenses and cash:** `expenseRoutes` (online expense pay and split across bills, edit of a bill, reimbursement and bank-charge ledger deltas, bank opening-balance recalculation), `newExpenseRoutes` (`toCents` was `Math.round(parseFloat(v) * 100)`, which turns 1.005 into 100 instead of 101; bill totals and balance), `cashExpenseRoutes` (edit delta), `hiddenExpenseRoutes`, `financeController` and `intercompanyController` (transfer amounts), `inhandController` / `inhandPostingService`, `chequeReleaseService`, `incomeController`.
- **Ledgers and helpers:** `otherLedgerService` and `adjustmentController` (running balances), `staffLoanUtils` (`dbToCents`), `creditCardRateService` (rate to basis points), `cardLedgerController`, `collectionService` (AR settlement total).
- **Reports and balance sheet:** `reportController` (`roundMoney`, VAT/expense/purchase totals, stock value), `analystController` (balance sheet assets, payables, net balance, reconciliation check), `purchaseRoutes` (item VAT, amount due), cutlery damage and purchase totals.
- **DECIMAL(n,4) migration: not needed.** Every amount is rounded to the scale of the column it is stored in at the moment it is stored (`round2` for DECIMAL(n,2), 4 decimals for the purchasing columns that already are DECIMAL(14,4)), so the database never has to round again and `balance_after` equals the sum of the stored rows.
- **Left as is:** `parseFloat` on a value read from the database and sent straight to the browser (no arithmetic), and stock *quantities* (not money).
- Tests: `tests/money.test.js` (+3: min/max, 10,000-row sum, cents), `tests/wastageReturnStock.test.js` (+1: purchase-return totals 0.30 / 18.00 / 118.29). Unit suite 311/311, DB suite 137/137.

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
> **Fixed (2026-10-19, uncommitted).** `recordCashTransaction` (`utils/financeLedger.js`) now throws `InsufficientBalanceError` (HTTP 400, code `INSUFFICIENT_CASH`) when a posting would take the company's **cash book total** below zero: "Not enough cash in hand: this payment of Rs. 1,500.00 needs more than the Rs. 1,000.00 available. Record the cash received first (for example approve the collection), then try again." The balance is read under the existing row lock, so two payments at the same moment cannot spend the same cash.
> - **Total only, not the balance at the posting's date.** Checked against the real data (read-only): both cash books were deeply negative at past dates (lowest -5.6M and -0.85M, and -837k / -322k inside the current window) although today they hold 379k and 219k, because payments are recorded before the collection that covers them is approved. Forbidding every dip would have blocked normal work.
> - Money coming in is never refused; an account that is already negative can receive but not pay. **Bank accounts are not checked** (an overdraft facility is possible - confirm with the owner before adding it).
> - Any controller's catch-all `500 Server error` is returned as the real `400` with this message (`middleware/periodGuard.js`, same hook as the period lock). Every flow that pays from cash is covered because they all post through this helper: expenses, supplier payments, transfers, staff loans, intercompany, in-hand reversals.
> - **The automatic cheque release** leaves a cash cheque the cash book cannot cover Pending and tries again on the next run, instead of failing every other due cheque.
> - `CASH_ALLOW_NEGATIVE=on` in `.env` switches the check off if it ever blocks the business while opening balances are being fixed (default off).
> - **Not covered:** edits and voids of existing cash rows (voiding a receipt that was already spent, or raising a payment in Adjustments) are not checked.
> - Tests: `tests/db/cashBalance.test.js` (12). Re-introduced once each: no check, decreases allowed on a negative book, no 400 translation, cheque job not skipping.

The original proposal, kept for reference:
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
> **Fixed (2026-10-19, uncommitted).** Every document that carries item lines now validates each one server-side (`utils/documentLines.js`) - `item_id` must be a real, non-deleted item; `quantity` must be a plain positive number with at most 3 decimal places (so a negative or zero quantity can never reduce or increase stock); a priced line's `unit_price` must be a valid, non-negative number. The client's numbers are never trusted past that point:
> - **Purchase (`createPurchase`/`updatePurchase`)**: `subtotal`, `vat_amount` and `total_with_vat` are always **recomputed from the validated lines** (`preparePricedLines` + `totalPricedLines`), never stored as the client sent them - an inflated `total_with_vat` can no longer raise the amount payable. The supplier's VAT registration is re-verified from the database (never trusted from the client, same rule Purchase Return already followed), and VAT is applied per line only when that line's item is itself `vat_applicable` in the `items` table - not whatever the client claims about it. `vat_rate` itself is still a trusted input (the system supports more than the single 18% rate); only the computed totals are never trusted.
> - **Issuance** already got the equivalent fix as part of H4 (`services/stockAvailability.js` locks and validates every line before writing). **Return** (`returnController.js`) already used `prepareStockLines` from an earlier fix in this engagement. This pass closes the three remaining gaps:
>   - **Wastage (`createWastage`/`updateWastage`)**: quantity validated the same way; `estimated_loss` is range-checked (a valid, non-negative number) but not recomputed - there is no single authoritative unit cost to recompute it from yet (tracked separately as the valuation/COGS design gap, C4/C5).
>   - **Purchase Return (`createPurchaseReturn`)**: `return_quantity` and `unit_price` validated the same way. Before the fix, a negative `return_quantity` would flow through to `purchase_return_items`, and since stock reads **subtract** that column, it would silently **add** stock back instead of recording a return - the mirror image of the issuance bug.
> - Tests: `tests/documentLines.test.js` (12, pure unit tests of the shared helpers) and `tests/db/lineValidation.test.js` (9, over real HTTP against the test database) - bad quantity/price rejected for all three documents, unknown item/supplier rejected, and the purchase-totals recomputation specifically mutation-tested (reverting the fix makes that test fail, confirming it actually catches the regression). Full unit suite (267) and full DB suite (122, 2 skipped) both pass with no regressions.
> - **Wastage and Purchase Return availability: fixed 2026-10-20** (H4 second half, see below). Department Returns add stock, so they need no availability check. Purchase's `item_name` (a free-text display column) is trusted from the client when present, and only falls back to the item's real name when absent, so a mismatched display name is still possible (cosmetic, not a stock or money risk).

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
- **H3 - Fixed 2026-10-20.** `createPurchase` now ignores the request's `paid_amount`: a new invoice is always unpaid and no "Initial payment" or allocation rows are written (money is recorded only through `makePayment`, which posts to the Cash/Bank book). `updatePurchase` locks the invoice row first, then sets `paid_amount` from the real payment allocations (`getActualAllocatedPaidAmount`), also ignoring the request, and returns 409 if the new total would be lower than what is already paid (use a purchase return instead). Tests: `tests/purchasePaidAmount.test.js` (3). Unit suite 297/297. Old data needs no change (the 812 historical initial payments predate the cash book).
- **M3 - Fixed 2026-10-20.** Every collection list/detail row now carries `version` = SHA-256 over the posted figures, dates, company/department, linked record and `raw_payload` (`services/collectionVersion.js`; `last_synced_at` is excluded). `POST /collections/approve` needs each item's `version`; `approveCollections` compares it with the row it has just locked (`FOR UPDATE`) and, if it differs or is missing, **skips that record** with the reason (nothing posted; the rest of the batch continues). The Collection page sends `version` with each selected row. Tests: `tests/collectionVersion.test.js` (4); existing collection test fixtures now send a version. Unit suite 301/301. Old open pages must be refreshed once after deploy.
- **M5 (original wording; fixed 2026-10-20, see "M5 fix" below):** add `utils/money.js` (integer cents, or BigInt where amounts can be large). `newExpenseRoutes.js:273` already has `toCents`; promote it and use it in `purchaseController`, `financeLedger` and `collectionMapper.toMoney`. DB columns are already `DECIMAL`.
  > **Partly fixed (2026-10-19, uncommitted).** New `utils/money.js`: exact decimal arithmetic on BigInt (values are parsed as decimal text, never as binary floats), **4 decimal places** for calculations, rounding **half away from zero** (the rule MySQL applies on store; JS `(1.005).toFixed(2)` gives `1.00`, `money.round2(1.005)` gives `1.01`). Functions: `round`, `round2`, `add`, `sub`, `mul`, `percent`, `compare`, `fixed`. Now used in: `utils/financeLedger.js` (every cash and bank posting, running balances, `balance_after`; amounts are rounded to the stored 2 decimals first, so `balance_after` always equals the sum of the stored rows), `utils/documentLines.js` `totalPricedLines` (line amount, subtotal and VAT carried at 4 decimals, rounded once at the end; stored total = stored subtotal + stored VAT), `purchaseController.js` (payment state, invoice total, settlement balances, payment totals) and `services/collectionMapper.js` (`toMoney` for every POS amount). Tests: `tests/money.test.js` (7) and `tests/moneyTotals.test.js` (5), including 100,000 additions of 0.1 giving exactly 10,000.
  > **Limits.** Most money columns are `DECIMAL(10,2)` / `DECIMAL(15,2)` (purchases, payment history, `finance_transactions`, bank and cash balances), so MySQL stores 2 decimals there whatever the code sends; only `purchase_items.total_price`, allocations and supplier credits are `DECIMAL(16-18,4)`. The 4 decimals therefore protect the **calculation** (no drift, no wrong-way rounding); the amount is rounded to the column scale as it is stored. Widening those columns to `DECIMAL(n,4)` is a migration of the live ledger tables and was not done. **Behaviour change:** an invoice total used to be the sum of lines each rounded to 2 decimals; it is now the exact sum rounded once, so it can differ by a cent from a supplier invoice that rounds per line. About 230 other float sites remain (reports, dashboards, expense routes other than their cents helpers); convert them as they are touched.
- **M7, extended:** at least **four** stock definitions now exist: `rmStockService` (7 sources); `dashboardController.js:144-148` and `itemController.js` (5 sources, **no purchase returns or adjustments**); `analystController` (filters deleted purchases, the others do not); and `items.current_stock` (see R10). Make `rmStockService` the only definition, export it as a SQL fragment, and use it everywhere. Fix R3 in that one place.
  > **Fixed (2026-10-19, uncommitted).** New `services/stockRules.js` is the only definition: the seven sources with their signs, `RULES` (which records count: a deleted purchase, a deleted wastage note, and a pending or deleted adjustment do not), `sourceSql` / `sourceTotalSql` (one source, optionally one item and/or a date), and `currentStockSql` (the full formula for an `items i` query). `rmStockService` is now a thin runner over it. Switched to it: the dashboard low-stock list, the Items list and Item view, the Issue to Department item list, both Purchase Return stock calls, and the Stock Adjustment system quantity (all six were separate copies; the dashboard and purchase-return copies left out returns and/or adjustments, the purchase-return copy also left out returns from departments, and the issuance list cut off at today and left out returns and purchase returns, so it could offer more than the save would accept). The Stock report, the day/range stock queries and the balance sheet keep their date-sliced shape but now embed the same `RULES` instead of their own predicates (a deleted purchase was already skipped there; the unit-price lookups and the two wastage drill-down reports now skip deleted records as well). Tests: `tests/stockRules.test.js` (8, including a scan that fails if a new file adds up stock sources without going through `stockRules`) and `tests/db/stockParity.test.js` (9: one data set with a deleted purchase, a deleted wastage note, a pending and a deleted adjustment; every screen above must answer 116 for the same item).
  > **Not done / read this.** The rules cover only flags the code already uses (`purchases.deleted`, `wastages.status` / `deleted`, `stock_adjustments.is_deleted` / `status`). `issuances`, `returns`, `purchase_returns` and `opening_balances` have no delete flag today (nothing sets one), so their rule is empty - when a delete feature is added for one of them, add its rule in `RULES` and every screen follows. `items.current_stock` is no longer read or written by any code; the column itself is still in the table (dropping it is a schema change). I first reported that an item with two opening rows would be counted twice on the purchase-return page; that was wrong - `opening_balances` has a unique key on `item_id`, so one row per item.

---

## [LOW]

- **R9a:** `services/referenceValidationService.js` blocks duplicate voucher, cheque and reference numbers across 11 tables with a plain `SELECT`. Two concurrent saves with the same number both pass. Only `purchases.invoice_no` and `inhand_adjustments.reference_no` have a real UNIQUE key. **Fix:** a `reference_registry (ref_norm VARCHAR(100) PRIMARY KEY, source_table, source_id)` table, inserted in the same transaction (`ref_norm = LOWER(TRIM(ref))`). The unique key does the check, and `ER_DUP_ENTRY` maps to the existing `DuplicateReferenceError`.
  > **Fixed (2026-10-19, uncommitted). Reproduced first on the MySQL test database:** two saves of one number, 400 ms apart in their transactions, both succeeded (2 rows). Built differently from the proposal above: instead of a permanent `reference_registry`, a **lock-only** table `reference_locks` (`ref_norm` PRIMARY KEY; `migrations/041_reference_locks.sql`, also created at boot by `config/db.js`). `checkDuplicateReference` now (1) takes a row lock on the lower-cased, trimmed number (`INSERT … ON DUPLICATE KEY UPDATE`, held until the transaction ends; numbers over 100 chars are SHA-256 hashed), (2) checks the 11 tables on its own connection as before, and (3) checks them again on a separate pool connection, because a REPEATABLE READ transaction cannot see a record another request committed after its snapshot. A second request with the same number waits at (1), then finds the first one's record at (3). Why not the registry: it would keep a number burned after the record is edited or soft-deleted, and the existing rule (a soft-deleted voucher frees its number) would change. If the lock table is missing the check falls back to the old behaviour with a warning. Two numbers in one transaction are locked one after the other, so a deadlock is possible in theory (InnoDB aborts one with an error; nothing is saved twice). Tests: `tests/db/referenceLock.test.js` (6, including a control that shows the old race; `npm run test:db`).
- **R9b:** these 500 responses return `'Server error: ' + error.message`: `purchaseController.js:270,1159` and `adjustmentController.js:365,813`. SQL errors then leak table and column names. Return a fixed message and log the detail.
  > **Fixed (2026-10-19, uncommitted).** New `utils/safeError.js`: `sendServerError(res, error)` answers `{ error: 'Server error' }` and logs the detail; an error thrown as `ClientError(message, status)` keeps its own text and status. 53 sites in 11 files now use it: `'Server error: ' + error.message` (purchase, purchase return, adjustment, finance, in-hand, order, supplier credit, wastage, report, purchase routes) and `details: error.message` (dashboard, purchase return detail) - more than the 4 originally listed. Messages meant for the user that were plain `Error`s (purchase-return and settlement validation, adjustment value and item-not-found) are now `ClientError` with 400/401/404, so they still reach the screen. Tests: `tests/safeError.test.js` (4, including a scan that fails if the old pattern comes back). Not changed: handlers that already choose their own message (`error.message` behind an `HttpError` / `DocumentError` check).
- **R10:** `POST /api/returns/sync-stock` (`returnRoutes.js:13`, open to Store Keeper) rewrites `items.current_stock` for **every** item from `stock_movements`. Issuances and wastages never write `stock_movements`, and adjustments write type `ADJUSTMENT`, which the sync ignores (it only counts `ADJUSTMENT_POSITIVE/NEGATIVE`). The result is wrong and is shown by `GET /returns/item-stock/:itemId`. Remove the endpoint and the `current_stock` column reads, and use `rmStockService.getItemStock`.
  > **Fixed (2026-10-19, uncommitted).** `POST /returns/sync-stock` and `syncAllStock` are deleted (`routes/returnRoutes.js`, `controllers/returnController.js`). `GET /returns/item-stock/:itemId`, the Returns list and the Return detail now read live stock from `rmStockService.getItemStock` (the Returns screen still receives it as `current_stock_quantity`, so the client is unchanged). `createReturn` no longer writes `items.current_stock`, so nothing in the returns code touches that column any more; the `stock_movements` row is still written. Tests: `tests/returnStock.test.js` (3 tests). The `items.current_stock` column itself is left in the table; removing it stays part of M7.
- **N1-tail:** still `BSMS-SIG-1`, so the host is not signed. Strict origin and HTTPS in production already close the practical path. Do this when the Laravel side is next deployed.

---

## 2. Domain-by-domain answer to the brief

| Domain | Verdict at `1b56c0c` |
|---|---|
| 1. Ingestion auth | **Good.** ECDSA P-256 signed pulls with nonce and 5-min window. Strict same-origin pagination and HTTPS in production (N1 fixed). Host not yet signed (low). |
| 1. Idempotency | **Good for collections.** `UNIQUE(source_system, source_type, source_id)`, unique completed reference (N2), `FOR UPDATE` in id order with per-record savepoints. Supplier payments: fixed 2026-10-15 (R1: invoice lock first, `request_id` UNIQUE). |
| 1. Payload validation | Collections: heuristic mapping (M4), POS total cross-check before approval (`collectionService.js:410-414`). GRNs and stock lines: **fixed 2026-10-19** (R7: item/quantity/price validated, purchase totals server-recomputed). |
| 2. Valuation / COGS | Not implemented (C5). Last-price valuation. (R3 is fixed, so deleted wastage no longer skews the balance-sheet stores value.) |
| 2. Atomic stock reductions | Issue to Department: **fixed 2026-10-19** (H4: item lock + live availability check before writing). Wastage and Purchase Return (stock out): **fixed 2026-10-20** - same lock-first availability check (see "H4, second half"). Department Return adds stock, so none is needed. Negative quantities are rejected (R7). |
| 2. Adjustments / write-offs | **Fixed 2026-10-19** (H4): server-resolved `system_qty`, maker-checker approval (no stock effect until a different user approves). Wastage notes can no longer be deleted (R3 fixed). No loss-ledger posting (C4). |
| 3. Double entry / CoA | Absent (C4). AP and cash book can no longer diverge silently (R1 and H3 fixed), but a true journal is still missing. |
| 3. Approval workflows | Collections: Accountant-only approve (good). Expenses: no maker-checker yet (H5). Supplier payments: Store Keeper can pay (R2, accepted 2026-10-15). |
| 4. P&L / precision | No P&L engine. All money arithmetic uses exact decimals (M5 fixed 2026-10-20). Columns are `DECIMAL`. The expense-payment path already uses cents (`newExpenseRoutes.js:273`). |
| 4. Period close | **Fixed 2026-10-16** (H7): rolling 2-month window, Super Admin-approved re-opens, Admin-only edits inside them. |
| 5. RBAC | Central default-deny table. Role re-read from the DB on every request (N3 fixed). Store Keeper pays suppliers by design (R2, accepted 2026-10-15). |
| 5. IDOR / branches | Collections are row-filtered in per-user mode. All Accountants see all branches (accepted 2026-10-14). Everything else has no company scoping (M8). |
| 6. Audit trail | Mostly fixed (H6): append-only `audit_log`. Ledger rows are voided, not deleted (R8 fixed). Sync-run log (`integration_sync_log`) still open. |

---

## 3. Remediation order

| When | Action |
|---|---|
| **Now** | **Done:** R3 (route removed), R6 (test route removed). **Still to do on production:** check `wastages.status = 0`, and run the R1 data-check SQL. |
| **This week** | **Done:** R1 (lock first, cap, excess to supplier credit, `request_id`), R4 (`actorId`), R5 (negative cash guard), R7 (line validation + server totals), R8 (void, not delete). **Still to do:** run the app as a least-privilege DB user. |
| **2–4 weeks** | **Done:** H3, H4, H5 part 2 (no hard deletes), H6 (mostly), H7, M3, M5, M7, R9, R10. **Still open:** H5 expense approval (maker-checker, waiting on the team's rules); H6 `integration_sync_log`; M4 strict POS schemas. |
| **Deferred (needs RAVON Laravel access)** | N1-tail (host in the signature, `BSMS-SIG-2`): do it with a joint deploy of both Laravel apps and this repo; accept SIG-1 and SIG-2 for one release. |
| **Accepted (no work)** | R2 (Store Keeper pays suppliers, 2026-10-15), M8 (no company scoping, 2026-10-20), branch scope for Accountants (2026-10-14). |
| **Quarter** | C4 GL and posting map. C5 WAC + RAVON sale lines. |

*Line numbers in the original findings are for commit `1b56c0c`. Fix status was last updated 2026-10-20 (H3, M3 fixed; M8 accepted).*
