// server/services/rmStockService.js
//
// Single source of truth for "what is the current RM stock of item X" - the Orders (Low Stock tab),
// the issuance availability check, the adjustment system quantity and every screen that shows a
// current quantity read it from here.
//
// The formula itself, and which records count, is defined ONCE in services/stockRules.js (audit
// M7); this file only runs it. Nothing here writes to stock.

const pool = require('../config/db');
const { currentStockSql } = require('./stockRules');

// Every RM item with its live current_stock and reorder_level (= Minimum
// Buffer Stock). Used by the Low Stock tab.
const getAllItemsWithStock = async (connection = pool) => {
  const { joins, expr, params } = currentStockSql();
  const [rows] = await connection.query(`
    SELECT
      i.id,
      i.item_code,
      i.name,
      i.unit,
      i.reorder_level,
      ${expr} AS current_stock
    FROM items i
    ${joins}
    WHERE i.deleted = FALSE AND i.is_active = TRUE
  `, params);

  return rows;
};

// Live stock + reorder_level for a single item (used when snapshotting an
// Order at creation time).
//
// `forUpdate` (audit H4): under REPEATABLE READ, a transaction's non-locking reads
// all share the snapshot taken by the FIRST non-locking read ANYWHERE in that
// transaction - even one on a completely different table, run earlier for something
// else (e.g. looking up a user's name). Locking an item row first is not enough on
// its own to make THIS read see a concurrent write that just committed: this read
// must also be a locking read to bypass that stale snapshot. Callers that checked
// availability before writing (services/stockAvailability.js, the stock-adjustment
// controller) pass forUpdate: true; plain reporting reads leave it off.
const getItemStock = async (connection, itemId, { forUpdate = false } = {}) => {
  const { joins, expr, params } = currentStockSql({ itemId });
  const [rows] = await connection.query(
    `
    SELECT
      i.id, i.item_code, i.name, i.unit, i.reorder_level,
      ${expr} AS current_stock
    FROM items i
    ${joins}
    WHERE i.id = ? AND i.deleted = FALSE
    ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [...params, itemId]
  );

  return rows[0] || null;
};

module.exports = { getAllItemsWithStock, getItemStock };
