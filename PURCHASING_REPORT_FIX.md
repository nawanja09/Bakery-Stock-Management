# Purchasing Report Fix - Paid Amount & Due Amount Issue

## Problem Description
The purchasing report was displaying:
- **Paid Amount (Rs.)**: 0 (zero)
- **Due Amount (Rs.)**: equal to Bill Amount (Rs.)

Even though bills were paid between the system launch date and 2026/04/07.

## Root Cause Analysis

### Issue #1: Report Query Not Aggregating from Payment History
The original `getPurchasingReport()` query in the backend was reading the `paid_amount` directly from the `purchases` table:

```sql
-- ❌ BEFORE (BROKEN)
SELECT COALESCE(p.paid_amount, 0) AS paid_amount
FROM purchases p
```

However, the actual payments are recorded in a separate `payment_history` table. The `purchases.paid_amount` field may not be in sync with the actual payments if:
1. Payments were recorded in `payment_history` but `purchases.paid_amount` wasn't updated
2. There was a data consistency issue during migration
3. Old records predated the payment tracking system

### Issue #2: Duplicate Report Functions
There were two duplicate `getPurchasingReport()` functions in the controller file, both with the same bug.

## Solution Implemented

### Backend Fix (✅ COMPLETED)
Updated both `getPurchasingReport()` functions in `server/controllers/reportController.js` to aggregate payments from the `payment_history` table:

```sql
-- ✅ AFTER (FIXED)
SELECT 
  p.id,
  p.invoice_no,
  p.purchase_date,
  ...
  -- Aggregate actual payments from payment_history
  COALESCE(SUM(ph.amount), 0) AS paid_amount,
  ...
FROM purchases p
JOIN supplier s ON p.supplier_id = s.id
LEFT JOIN company c ON p.company_id = c.id
LEFT JOIN payment_history ph ON p.id = ph.purchase_id
WHERE p.purchase_date BETWEEN ? AND ?
  AND (p.deleted = FALSE OR p.deleted IS NULL)
GROUP BY p.id, p.invoice_no, p.purchase_date, ...
ORDER BY p.purchase_date DESC
```

### Key Changes:
1. **Added LEFT JOIN** to `payment_history` table
2. **Used SUM() aggregation** to calculate total payments: `SUM(ph.amount)`
3. **Added GROUP BY** to properly aggregate at purchase level
4. **Updated both duplicate functions** for consistency

### How It Works Now:
```
Paid Amount = SUM of all payments in payment_history for that purchase_id
Due Amount = Bill Amount - Paid Amount
```

## Frontend Behavior
The frontend (PurchasingReport.jsx) calculates:
```javascript
const displayDueAmount = displayBillAmount - displayPaidAmount;
```

Now that the backend returns the correct `paid_amount`, the due amount will be calculated correctly.

## Data Consistency (Optional Maintenance)

If you want to sync the `purchases.paid_amount` field with the aggregated values from `payment_history`, you can run this SQL:

```sql
-- Optional: Sync purchases.paid_amount with payment_history totals
UPDATE purchases p
SET p.paid_amount = (
  SELECT COALESCE(SUM(ph.amount), 0)
  FROM payment_history ph
  WHERE ph.purchase_id = p.id
)
WHERE p.id IN (
  SELECT DISTINCT purchase_id FROM payment_history
);
```

## Testing the Fix

1. **Regenerate the Purchasing Report** with the date range: `2025-09-01` to `2026-04-27`
2. **Verify results**:
   - Paid Amount (Rs.) should now show actual payment totals
   - Due Amount (Rs.) should equal `Bill Amount - Paid Amount`
   - For fully paid bills: Due Amount should be 0 (or very close to 0)

## Files Modified
- `server/controllers/reportController.js` - Updated both `getPurchasingReport()` functions (lines 574 and 649)

## Impact
- ✅ Purchasing report now shows accurate payment data
- ✅ Due amounts are calculated correctly
- ✅ No breaking changes to API or frontend
- ✅ Backward compatible with existing payment history
