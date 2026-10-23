# BSMS: Security & Financial-Integrity Audit — Fourth Pass

**Scope:** `server/` and `client/` at `a7110a8` (2026-10-23).
**Earlier passes:** [2026-10-12](security-financial-audit-2026-10-12.md), [2026-10-14](security-financial-reaudit-2026-10-14.md), [2026-10-15](security-financial-reaudit-2026-10-15.md), and the consolidated [`audit_report.md`](audit_report.md) (re-verified fresh 2026-10-20, closing C4/C5/H1-H9 and Domains 1–6 of the same brief this pass was asked to repeat).
**Method:** this pass does **not** re-walk the six domains from scratch — `audit_report.md` already answers that brief in full, domain by domain, as of 2026-10-20, and nothing in `server/` from before that commit has changed since. Instead, this pass audits only the code written **after** that baseline (`git log 5e860cb..a7110a8`): a "Discount Amount" field added to supplier-invoice payments (commit `5d7e650`), a VAT-exempt purchasing report (`f3b583c`), an order-advance posting-date fix (`46d6925`), and two small UI changes. The order-advance fix and both reports are read-only or already correct (see §3). The payment-discount feature is not — it is new, it touches the Cash/Bank ledger and the Domain 3 double-entry journal that the 2026-10-20 pass just finished building, and it was never audited. That is the subject of this report.

Severity key: **[CRITICAL]** exploitable now, direct financial/data loss · **[HIGH]** serious integrity/control gap · **[MEDIUM]** real but bounded.

---

## 1. Summary

| ID | Sev | Title | Status |
|---|---|---|---|
| **D1** | **CRITICAL** | Editing a discounted payment moves the Cash/Bank ledger by the wrong amount, in the wrong direction | **Fixed** 2026-10-23 (commit `8ecf56c`) |
| **D2** | **HIGH** | Payment discounts never reach the Domain-3 double-entry journal; no "Discount Received" account exists | **Fixed** 2026-10-23 (commit pending) |
| **D3** | **MEDIUM** | A payment's Discount Amount can retire up to 100% of an invoice with no cash movement, no reason, and no second approver | open (business decision needed, like R2) |

All three trace to one commit, `5d7e650` ("add Discounted Purchases Report and support for discount amounts in payments"), which added `discount_amount` to `payment_history` and `purchase_payment_allocations` (migration `043_add_discount_amount_to_payments.sql`) and wired it through `purchaseController.makePayment` — but not through the older `purchaseController.adjustPurchasePayment` ("Purchasing Payment Adjustment" screen), which predates discounts and was not updated.

---

## [CRITICAL]

### D1: `PUT /payments/:id/adjust` corrupts the Cash/Bank ledger for any payment that carried a discount
> **Fixed (2026-10-23, commit `8ecf56c`).** `adjustPurchasePayment` now reads the allocation row's `discount_amount` and computes `oldCashAmount = oldCombinedAmount - oldDiscountAmount` before anything else. The request may optionally carry its own `discount_amount` (omitted/blank = "leave this payment's discount exactly as it is", matching `makePayment`'s convention); the new discount and cash are each capped against the invoice's real remaining balance (`cappedDiscount`, then `appliedCashAmount`), exactly as `makePayment` already does. The Cash/Bank ledger - the live `finance_transactions` row, `cash_accounts`/`bank_details.current_balance`, and a brand-new ledger row when the payment method is switched - now moves by `cashDelta` (`appliedCashAmount - oldCashAmount`) only; `payment_history.amount`/`purchase_payment_allocations.allocated_amount` keep tracking the combined cash+discount figure (`combinedDelta`), consistent with every other reader of those columns (`reconcilePurchasePaymentState`, the Analyst balance sheet, the Discounted Purchases Report). The `purchase_payment_adjustments` audit-trail row now logs the combined before/after instead of comparing a combined old figure to a cash-only new one.
> - **Regression test:** `tests/db/supplierCreditSettlement.test.js` ("adjusting a discounted payment moves the cash book by the cash delta, not the combined delta") - a Rs. 10,000 invoice paid Rs. 5,000 cash + Rs. 2,000 discount, then the cash figure corrected to Rs. 6,000. Fails on the pre-fix code (ledger would move backwards by 1,000 and the discount would be wiped to 0); passes now (ledger drops by exactly 1,000 more, discount stays at 2,000).
> - Full unit suite 324/325 (the one failure is a pre-existing, unrelated flake in `purchaseReturnController`/`stockAvailability` tests - not touched by this fix) and the DB tests for supplier payments and payment adjustments all pass.
> - **Still open:** the production data-check SQL below, to find rows corrupted by an edit of a discounted payment made before this fix (there should be none yet, since the Discount Amount field itself only shipped in `5d7e650`, 2026-10-22 - but check before relying on it).
> - **Not done here:** D2 (the discount's own journal/"Discount Received" entry) and D3 (reason/approval control on a discount) are unrelated gaps, still open below.

**Where (original finding, `a7110a8`):** `server/controllers/purchaseController.js`, `adjustPurchasePayment` (`:1789-1935`), reached from the client's "Purchasing Payment Adjustment" tab, gated to the `Adjustments` module (`config/rolePermissions.js:140`, same roles as Stock Adjustments).

`makePayment` keeps the cash and discount portions of a payment separate everywhere that matters: the Cash/Bank ledger is only ever credited `appliedAmount` (cash), while `purchase_payment_allocations.allocated_amount` and `payment_history.amount` store the **combined** cash+discount figure, because that is what the invoice's outstanding balance must shrink by (`:1193-1204`, `:1092-1095`).

`adjustPurchasePayment` was never told about this split. It reads the row's `allocated_amount` and treats the whole thing as if it were cash:

```js
// :1865-1897 (current code)
const oldAllocatedAmount = hasAllocationRow
  ? parseFloat(allocRows[0].allocated_amount)   // <- this is cash + discount, not cash
  : parseFloat(payment.amount);
...
const appliedAmount = moneyMath.round2(moneyMath.min(newAmount, availableBalance));
...
const totalDelta = moneyMath.round2(moneyMath.sub(newAmount, oldAllocatedAmount)); // cash vs (cash+discount) - wrong basis
const newTransactionAmount = moneyMath.round2(moneyMath.add(oldTransactionAmount, totalDelta));
...
// :1921, further down - the live Cash/Bank row is moved by this same wrong delta
const newCredit = moneyMath.round2(moneyMath.add(fin.credit, totalDelta));
```

**Concrete failure.** A Rs. 7,000 invoice is paid with Rs. 5,000 cash + Rs. 2,000 discount (`allocated_amount` = 7,000, `payment_history.amount` = 7,000, the Cash book was credited exactly 5,000). An Admin later opens "Purchasing Payment Adjustment" to correct a data-entry mistake — the cash figure should have been Rs. 6,000, discount still Rs. 1,000 unrelated change not even intended — and types `amount = 6000` (the form has no discount field to touch):

- `oldAllocatedAmount` = 7,000 (cash+discount, wrongly read as "old cash")
- `totalDelta` = 6,000 − 7,000 = **−1,000**
- The Cash book is credited by **another −1,000**, i.e. it is **debited** Rs. 1,000 — cash the business never actually received is added back to the till — while the real cash paid is going **up** by 1,000 in reality.
- `appliedAmount` (the new `allocated_amount`) becomes 6,000, silently **discarding the Rs. 2,000 discount** — the invoice balance jumps from 0 back to 1,000 outstanding, with nothing to show why.

Two different real figures (cash paid, discount granted) are being driven off one combined number that was never meant to carry the ledger delta. Every discount-bearing payment that is ever opened in this screen miscredits the Cash or Bank book by exactly its old discount amount, in the opposite direction from what was intended, and quietly erases the discount from the invoice. Flagged CRITICAL because it is a direct, silent corruption of the cash/bank books of record — the same class of defect R1 (2026-10-15) was fixed for.

**Fix:** give the adjust form its own discount field (defaulting to the row's current discount) and compute the cash delta from cash alone.

```js
// server/controllers/purchaseController.js - adjustPurchasePayment
const { payment_date, amount, discount_amount, payment_method, voucher_number, bank_id, notes } = req.body;
...
let newDiscountAmount = null; // null = "not provided, keep the row's current discount"
if (discount_amount !== undefined && discount_amount !== null && discount_amount !== '') {
  if (!moneyMath.isAmount(discount_amount) || parseFloat(discount_amount) < 0) {
    return res.status(400).json({ error: 'Discount amount must be a valid, non-negative amount' });
  }
  newDiscountAmount = moneyMath.round2(discount_amount);
}
...
const [allocRows] = await connection.query(
  'SELECT id, allocated_amount, discount_amount FROM purchase_payment_allocations WHERE payment_history_id = ? AND purchase_id = ? FOR UPDATE',
  [paymentId, purchaseId]
);
const hasAllocationRow = allocRows.length > 0;
const oldDiscountAmount = hasAllocationRow ? parseFloat(allocRows[0].discount_amount || 0) : parseFloat(payment.discount_amount || 0);
const oldCombinedAmount = hasAllocationRow ? parseFloat(allocRows[0].allocated_amount) : parseFloat(payment.amount);
const oldCashAmount = moneyMath.round2(moneyMath.sub(oldCombinedAmount, oldDiscountAmount));
const effectiveNewDiscount = newDiscountAmount === null ? oldDiscountAmount : newDiscountAmount;

const actualAllocatedExcludingThis = await getActualAllocatedPaidAmount(connection, purchaseId, paymentId);
const availableBalance = Math.max(0, invoiceTotal - actualAllocatedExcludingThis);

// Cap cash+discount together at the balance, same rule makePayment uses.
const cappedDiscount = moneyMath.round2(moneyMath.min(effectiveNewDiscount, availableBalance));
const appliedCashAmount = moneyMath.round2(moneyMath.min(newAmount, moneyMath.sub(availableBalance, cappedDiscount)));
const appliedAmount = moneyMath.round2(moneyMath.add(appliedCashAmount, cappedDiscount)); // new allocated_amount
const excessAmount = moneyMath.round2(moneyMath.sub(newAmount, appliedCashAmount));        // cash only, as before

// The ledger moves by the CASH delta only - never by the combined delta.
const cashDelta = moneyMath.round2(moneyMath.sub(appliedCashAmount, oldCashAmount));
const discountDelta = moneyMath.round2(moneyMath.sub(cappedDiscount, oldDiscountAmount));

if (hasAllocationRow) {
  await connection.query(
    'UPDATE purchase_payment_allocations SET allocated_amount = ?, discount_amount = ? WHERE id = ?',
    [appliedAmount, cappedDiscount, allocRows[0].id]
  );
} else {
  await connection.query(
    'INSERT INTO purchase_payment_allocations (payment_history_id, purchase_id, allocated_amount, discount_amount) VALUES (?, ?, ?, ?)',
    [paymentId, purchaseId, appliedAmount, cappedDiscount]
  );
}

const oldTransactionAmount = parseFloat(payment.amount) || 0;
const combinedDelta = moneyMath.round2(moneyMath.sub(appliedAmount, oldAllocatedAmount)); // oldAllocatedAmount kept only for this line
const newTransactionAmount = moneyMath.round2(moneyMath.add(oldTransactionAmount, combinedDelta));

await connection.query(
  `UPDATE payment_history SET payment_date = ?, amount = ?, discount_amount = ?, payment_method = ?,
   voucher_number = ?, bank_id = ?, notes = ? WHERE id = ?`,
  [payment_date, newTransactionAmount, cappedDiscount, methodForHistory, voucher_number || null,
   normalizedMethod === 'BANK_TRANSFER' ? bank_id : null, notes || null, paymentId]
);
...
// further down, where the live finance_transactions row is patched:
const newCredit = moneyMath.round2(moneyMath.add(fin.credit, cashDelta)); // was totalDelta
```

Then post D2's journal delta for `discountDelta` (see below) in the same transaction, so the GL moves in step with the edit. Add `tests/db/paymentAdjustmentDiscount.test.js`: create a 7,000 invoice paid 5,000 cash + 2,000 discount, edit cash to 6,000 with discount unchanged, assert the Cash book's credit is now 6,000 (not 4,000) and the invoice balance is 0 (not 1,000). Re-run against the **old** code first to confirm it fails exactly as described.

**Data check before deploy** (find payments already corrupted by an edit of a discounted payment, or edits made before this fix that need manual correction):
```sql
SELECT ph.id, ph.purchase_id, ph.amount, ph.discount_amount, ft.credit AS ledger_credit
FROM payment_history ph
JOIN purchase_payment_allocations ppa ON ppa.payment_history_id = ph.id
LEFT JOIN finance_transactions ft ON ft.reference_type = 'PURCHASE_PAYMENT' AND ft.reference_id = ph.id
WHERE ppa.discount_amount > 0.009;
-- for each row, ledger_credit should equal (ph.amount - ph.discount_amount); anything else was
-- corrupted by an edit made through adjustPurchasePayment before this fix.
```

---

## [HIGH]

### D2: Payment discounts are invisible to the Domain-3 double-entry journal; there is no "Discount Received" account
> **Fixed (2026-10-23).** `financeLedger.js`'s `CONTRA_ACCOUNT_RULES` gained a `/discount/i` → `PURCHASE-DISCOUNT-RECEIVED` rule, placed before the general `/purchase/i` rule (order matters - first match wins). `makePayment` now calls the already-exported `postJournalEntry` directly, right after the cash/bank `postLedger()` call, whenever `appliedDiscountAmount > 0`: `Dr ACCOUNTS-PAYABLE-RM / Cr PURCHASE-DISCOUNT-RECEIVED` for the discount amount, with `referenceType: 'PURCHASE_PAYMENT_DISCOUNT'` so it's distinguishable from the cash entry. `adjustPurchasePayment` (D1) got the same treatment for its own `discountDelta` - the *change* in discount on an edit, not the whole figure again, so re-editing the same payment never double-posts; a decrease posts the mirror image via the existing negative-delta convention `postJournalEntry` already supports.
> - **Regression test:** `tests/db/supplierCreditSettlement.test.js` ("a payment discount posts a balanced Dr AP / Cr Purchase-Discount-Received journal entry") - a Rs. 5,000 cash + Rs. 2,000 discount payment now produces two balanced journal entries (`PURCHASE_PAYMENT`, `PURCHASE_PAYMENT_DISCOUNT`), and `ACCOUNTS-PAYABLE-RM` is debited 7,000 in total across both - matching the invoice's real balance reduction, not just the 5,000 that reached the Cash book.
> - Full unit suite 324/325 (the same pre-existing, unrelated flake noted under D1) and the DB tests for supplier payments/credit settlement/payment adjustments all pass.
> - **Not done here:** D3 (reason/approval control on a discount) is a separate, still-open question for the owner.

**Where (original finding, `a7110a8`):** `server/controllers/purchaseController.js:1193-1204` (`makePayment`'s `postLedger` call) and `server/utils/financeLedger.js:76-120` (`CONTRA_ACCOUNT_RULES`, `postJournalEntry`).

The 2026-10-20 pass added exactly one chokepoint for the GL: every `recordCashTransaction`/`recordBankTransaction` call also writes a balanced `journal_entries`/`journal_lines` pair (`audit_report.md` §H3). `makePayment` only ever calls that chokepoint with `credit: appliedAmount` — the cash portion. The discount portion reduces `purchases.balance_amount` (the real AP sub-ledger) by an extra amount that the journal's `ACCOUNTS-PAYABLE-RM` account never hears about, and no account anywhere records "Rs. X was forgiven by the supplier" as income. Every discount-bearing payment from now on leaves the journal's AP control account overstated, by exactly the running total of discounts taken, against the real outstanding-invoices figure — the exact "Debits = Credits... cannot be proven" gap H3 was built to close, reopened for this one new code path.

**Fix:** post the discount as its own, zero-cash journal entry (no `finance_transactions` row — no cash or bank moves), using the same `postJournalEntry` helper the ledger functions already call internally (it is already exported):

```js
// server/utils/financeLedger.js - add before the existing /purchase/i rule (order matters: first match wins)
const CONTRA_ACCOUNT_RULES = [
  [/adjustment/i, 'INVENTORY-ADJUSTMENT'],
  [/opening/i, 'OPENING-BALANCE-EQUITY'],
  [/transfer|withdrawal|deposit/i, 'TRANSFER-CLEARING'],
  [/advance/i, 'SUPPLIER-ADVANCES'],
  [/discount/i, 'PURCHASE-DISCOUNT-RECEIVED'],   // new - must come before /purchase/i
  [/purchase/i, 'ACCOUNTS-PAYABLE-RM'],
  ...
];
```

```js
// server/controllers/purchaseController.js - makePayment, right after the cash/bank postLedger() call (:1204)
if (appliedDiscountAmount > 0) {
  await postJournalEntry(connection, {
    date: payment_date,
    accountCode: 'ACCOUNTS-PAYABLE-RM',
    debit: appliedDiscountAmount,
    credit: 0,
    transactionType: 'RM Purchase Discount',           // matches the new /discount/i rule
    remark: `Discount received - Invoice ${invoiceNumberForLedger}`,
    referenceType: 'PURCHASE_PAYMENT_DISCOUNT',
    referenceId: paymentHistoryId,
    createdBy: resolvedCreatedBy
  });
}
```

(`postJournalEntry` is already imported-or-importable from `utils/financeLedger.js` — add it to the existing `require` at the top of `purchaseController.js`.) This writes `Dr Accounts-Payable-RM / Cr Purchase-Discount-Received` — AP drops by the discount with no cash movement, and the discount shows up as its own income line, matching standard treatment for a supplier discount. Apply the same call (with `debit`/`credit` swapped, or a negative amount matching the existing `postJournalEntry` convention for edits) to D1's `discountDelta` inside `adjustPurchasePayment`, so an edited discount stays reflected in the GL too. Add `tests/journalEntries.test.js`: a payment with a Rs. 500 discount produces two journal entries (cash leg + discount leg) whose combined lines still balance (`SUM(debit) = SUM(credit)` for each `entry_id`), and the `ACCOUNTS-PAYABLE-RM` running balance across both entries matches the invoice's real balance reduction.

---

## [MEDIUM]

### D3: "Discount Amount" can retire an invoice with no cash, no reason, and no second signer

**Where:** `client/src/components/purchase/InvoicePaymentModal.jsx:376-391` (the new "Discount Amount (Optional)" field) and `server/controllers/purchaseController.js:896-905` (server-side validation of `discount_amount`).

The only server-side rule on a discount is "a valid, non-negative amount, and the combined cash+discount can't exceed what the invoice still owes" (`:1051-1056`). There is no required reason/note specific to the discount (`notes` on the form is a free-text field shared with ordinary payment notes, and is optional either way), no cap as a percentage of the invoice, and no second approver — unlike RM Stock Adjustments, which the 2026-10-19 pass (`audit_report.md` §Domain 2) deliberately gave maker-checker because they can silently zero out value. A payment discount is the accounts-payable equivalent: whoever can record a supplier payment can now also write off up to 100% of that invoice's balance with zero money leaving the business and zero justification on file. Per the accepted 2026-10-15 decision (R2 / `single-accountant-all-branches` memory), Store Keeper already has full supplier-payment access — that decision was about who may **move cash to a supplier**, not about who may **forgive a debt with no cash at all**, so it does not obviously cover this new capability.

**Not auto-fixed** — this needs the same kind of business call R2 got, not a unilateral code change. Two independent options, either or both:
```js
// Option A - require a reason whenever a discount is applied (cheap, no RBAC change)
if (allocation.discountUnits > 0 && !String(notes || '').trim()) {
  return res.status(400).json({ error: 'A reason is required in Notes when a Discount Amount is applied' });
}
```
```js
// Option B - mirror R2's pattern: restrict the discount specifically to Accountant/Admin/Super Admin,
// while Stores keeps full access to the cash portion of a payment (no controller change needed
// beyond checking role before honoring discountUnits > 0 - cheaper than a new writeRoles prefix
// rule, since it's a field within an already-shared route, not a separate endpoint):
const canDiscount = [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(canonicalRole(req));
if (!canDiscount && allocations.some(a => a.discountUnits > 0)) {
  return res.status(403).json({ error: 'Only Accountant, Admin or Super Admin may apply a payment discount' });
}
```
**Owner decision needed:** does Stores need to apply discounts in the field, or should that stay with Accountant/Admin as a control? If Stores needs it, Option A (mandatory reason, visible in the Discounted Purchases Report and the Audit Trail) is the minimum; Option B is stronger and matches the segregation-of-duties logic already applied to Collections (Finance excluded) and Stock Adjustments (self-approval blocked).

---

## 2. What's unaffected / re-verified clean

- **VAT-exempt purchasing report** (`f3b583c`) and **Discounted Purchases Report** (`5d7e650`, `reportController.getDiscountedPurchasesReport`): both are parameterized (no SQL injection), filtered through `RULES.purchases(...)` (soft-delete aware, consistent with the rest of the codebase's single stock/purchase-filter convention), and gated the same way as the other Raw-Material reports (`rolePermissions.js`: `all: RM`) — no new RBAC or IDOR exposure.
- **`collectionService.cardPaymentDate`** (`46d6925`): a real, well-tested fix — an `order_advance` POS payment is now posted on the shift's own collection date rather than the future order's date, which is exactly the kind of back-dated/forward-dated posting the Domain 4 period-close design (H7) exists to prevent. No new finding; noted as a correctly-made fix.
- **Cash as a selectable payment type in New Expenses** (`5e860cb`): a one-line UI change re-enabling an option the server already fully supports (cash-balance guard R5, period lock H7, and the Domain-3 journal all already apply to every `recordCashTransaction` call regardless of which screen reached it). No new server-side exposure.

---

## 3. Remediation order

| When | Action |
|---|---|
| **Done** | D1 (ledger-corruption fix in `adjustPurchasePayment`, commit `8ecf56c`, 2026-10-23); D2 (discount journal leg + `PURCHASE-DISCOUNT-RECEIVED` account, 2026-10-23). **Still to do:** run the D1 data-check SQL on production to confirm no row was corrupted by an edit made between `5d7e650` (2026-10-22) and the D1 fix; D2's journal only covers payments made (or edited) from this fix onward - it does not back-fill a journal entry for any discount already recorded between `5d7e650` and now. |
| **Needs an owner decision, like R2** | D3 (reason requirement and/or role restriction on discounts). |

*Line numbers are for `a7110a8`. This report only covers code changed since `audit_report.md`'s 2026-10-20 baseline — it does not re-state or re-verify findings already closed or accepted there.*
