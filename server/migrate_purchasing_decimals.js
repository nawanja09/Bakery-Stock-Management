// migrate_purchasing_decimals.js
// Run once: node migrate_purchasing_decimals.js
//
// Widens every numeric column on Purchasing-module tables (Purchase Orders,
// Purchase Requests/Purchases, GRN-equivalent purchase items, Purchase
// Returns, and the supplier-payment/credit ledger tables that back
// purchasing transactions) from decimal(x,2)/(x,3) to decimal(x,4).
//
// This is required for the "4 decimal places across all Purchasing pages"
// rule to hold end-to-end: the frontend can display/format 4 decimals, but
// without this migration the underlying values are still rounded to 2 (or
// 3) decimal places by MySQL as soon as they are written, so anything past
// that precision would silently be lost. Widening the column does NOT
// change the value of existing data (100.50 stays 100.5000) - it just stops
// future writes from being truncated.
//
// Safe to re-run: every statement uses MODIFY COLUMN with the target
// precision, so re-running this script against already-migrated columns is
// a no-op change.
const pool = require('./config/db');

// Each entry: [table, column, new definition]
const ALTERATIONS = [
  // purchases (Purchasing transactions / invoices)
  ['purchases', 'bill_amount', 'decimal(14,4) NOT NULL'],
  ['purchases', 'subtotal', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchases', 'vat_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchases', 'total_with_vat', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchases', 'paid_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchases', 'balance_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],

  // purchase_items (Purchasing line items / GRN quantities & prices)
  ['purchase_items', 'quantity', 'decimal(14,4) DEFAULT NULL'],
  ['purchase_items', 'returned_quantity', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_items', 'unit_price', 'decimal(14,4) NOT NULL'],
  // total_price is a STORED generated column - widen it too so the stored
  // result keeps full precision instead of being rounded back to 2 dp.
  ['purchase_items', 'total_price', 'decimal(18,4) GENERATED ALWAYS AS (`quantity` * `unit_price`) STORED'],

  // orders / order_items (Purchase Orders)
  ['order_items', 'quantity', 'decimal(14,4) NOT NULL'],
  ['order_items', 'current_stock_at_order', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['order_items', 'buffer_stock_at_order', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['order_items', 'required_quantity', "decimal(14,4) NOT NULL DEFAULT 0.0000"],

  // purchase_payment_adjustments / purchase_payment_allocations (Purchasing payments)
  ['purchase_payment_adjustments', 'original_amount', 'decimal(16,4) NOT NULL'],
  ['purchase_payment_adjustments', 'adjusted_amount', 'decimal(16,4) NOT NULL'],
  ['purchase_payment_adjustments', 'adjustment_difference', 'decimal(16,4) NOT NULL'],
  ['purchase_payment_allocations', 'allocated_amount', 'decimal(16,4) NOT NULL'],

  // purchase_returns / purchase_return_items / purchase_return_credits
  ['purchase_returns', 'subtotal', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_returns', 'vat_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_returns', 'total_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_returns', 'settled_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_returns', 'balance_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_return_items', 'quantity', 'decimal(14,4) NOT NULL'],
  ['purchase_return_items', 'unit_price', 'decimal(14,4) NOT NULL'],
  ['purchase_return_items', 'vat_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_return_items', 'total_amount', "decimal(14,4) NOT NULL DEFAULT 0.0000"],
  ['purchase_return_credits', 'original_amount', 'decimal(16,4) NOT NULL'],
  ['purchase_return_credits', 'remaining_credit', 'decimal(16,4) NOT NULL'],

  // supplier-side ledger tables that purchasing payments/settlements post to
  ['supplier_credits', 'amount', 'decimal(18,4) NOT NULL'],
  ['supplier_credits', 'available_amount', 'decimal(18,4) NOT NULL'],
  ['supplier_overpayments', 'original_amount', 'decimal(16,4) NOT NULL'],
  ['supplier_overpayments', 'remaining_credit', 'decimal(16,4) NOT NULL'],
  ['supplier_payments', 'total_amount', "decimal(16,4) NOT NULL DEFAULT 0.0000"],
  ['supplier_payment_allocations', 'allocated_amount', "decimal(16,4) NOT NULL DEFAULT 0.0000"],
];

(async () => {
  let succeeded = 0;
  let failed = 0;

  for (const [table, column, definition] of ALTERATIONS) {
    const sql = `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`;
    try {
      await pool.query(sql);
      console.log(`OK   ${table}.${column} -> ${definition}`);
      succeeded += 1;
    } catch (err) {
      console.error(`FAIL ${table}.${column}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nMigration complete. ${succeeded} column(s) updated, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
})();
