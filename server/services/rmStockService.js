// server/services/rmStockService.js
//
// Single source of truth for "what is the current RM stock of item X" -
// re-used by the Orders module (Low Stock tab) instead of duplicating the
// calculation. This is the exact dynamic aggregation formula already used by
// the Stock Report / stock adjustment "system quantity" lookup
// (see controllers/adjustmentController.js:getSystemQuantity):
//
//   current_stock = opening_balances
//                  + purchases (purchase_items)
//                  - issuances (issuance_items)
//                  - wastages (wastage_items)
//                  + returns (return_items)
//                  - purchase_returns (purchase_return_items)
//                  + stock_adjustments (variance)
//
// Nothing here writes to stock - it only reads the existing transaction
// tables. Stock is only ever changed by inserting into those tables via the
// existing Purchasing / Issuance / Wastage / Return / Adjustment workflows.

const pool = require('../config/db');

// Every RM item with its live current_stock and reorder_level (= Minimum
// Buffer Stock). Used by the Low Stock tab.
const getAllItemsWithStock = async (connection = pool) => {
  const [rows] = await connection.query(`
    SELECT
      i.id,
      i.item_code,
      i.name,
      i.unit,
      i.reorder_level,
      (
        COALESCE(ob.total_opening, 0) +
        COALESCE(purchases.total_purchased, 0) -
        COALESCE(issues.total_issued, 0) -
        COALESCE(wastage.total_wasted, 0) +
        COALESCE(returns.total_returned, 0) -
        COALESCE(purchase_returns.total_purchase_returned, 0) +
        COALESCE(adjustments.total_adjusted, 0)
      ) AS current_stock
    FROM items i
    LEFT JOIN (
      SELECT item_id, SUM(quantity) AS total_opening
      FROM opening_balances GROUP BY item_id
    ) ob ON i.id = ob.item_id
    LEFT JOIN (
      SELECT pi.item_id, SUM(pi.quantity) AS total_purchased
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      GROUP BY pi.item_id
    ) purchases ON i.id = purchases.item_id
    LEFT JOIN (
      SELECT ii.item_id, SUM(ii.quantity) AS total_issued
      FROM issuance_items ii
      JOIN issuances iss ON ii.issuance_id = iss.id
      GROUP BY ii.item_id
    ) issues ON i.id = issues.item_id
    LEFT JOIN (
      SELECT wi.item_id, SUM(wi.quantity) AS total_wasted
      FROM wastage_items wi
      JOIN wastages w ON wi.wastage_id = w.id
      GROUP BY wi.item_id
    ) wastage ON i.id = wastage.item_id
    LEFT JOIN (
      SELECT ri.item_id, SUM(ri.quantity) AS total_returned
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      GROUP BY ri.item_id
    ) returns ON i.id = returns.item_id
    LEFT JOIN (
      SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pri.return_id = pr.id
      GROUP BY pri.item_id
    ) purchase_returns ON i.id = purchase_returns.item_id
    LEFT JOIN (
      SELECT item_id, SUM(variance) AS total_adjusted
      FROM stock_adjustments GROUP BY item_id
    ) adjustments ON i.id = adjustments.item_id
    WHERE i.deleted = FALSE AND i.is_active = TRUE
  `);

  return rows;
};

// Live stock + reorder_level for a single item (used when snapshotting an
// Order at creation time).
const getItemStock = async (connection, itemId) => {
  const [rows] = await connection.query(
    `
    SELECT
      i.id, i.item_code, i.name, i.unit, i.reorder_level,
      (
        COALESCE(ob.total_opening, 0) +
        COALESCE(purchases.total_purchased, 0) -
        COALESCE(issues.total_issued, 0) -
        COALESCE(wastage.total_wasted, 0) +
        COALESCE(returns.total_returned, 0) -
        COALESCE(purchase_returns.total_purchase_returned, 0) +
        COALESCE(adjustments.total_adjusted, 0)
      ) AS current_stock
    FROM items i
    LEFT JOIN (SELECT item_id, SUM(quantity) AS total_opening FROM opening_balances WHERE item_id = ? GROUP BY item_id) ob ON i.id = ob.item_id
    LEFT JOIN (SELECT pi.item_id, SUM(pi.quantity) AS total_purchased FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE pi.item_id = ? GROUP BY pi.item_id) purchases ON i.id = purchases.item_id
    LEFT JOIN (SELECT ii.item_id, SUM(ii.quantity) AS total_issued FROM issuance_items ii JOIN issuances iss ON ii.issuance_id = iss.id WHERE ii.item_id = ? GROUP BY ii.item_id) issues ON i.id = issues.item_id
    LEFT JOIN (SELECT wi.item_id, SUM(wi.quantity) AS total_wasted FROM wastage_items wi JOIN wastages w ON wi.wastage_id = w.id WHERE wi.item_id = ? GROUP BY wi.item_id) wastage ON i.id = wastage.item_id
    LEFT JOIN (SELECT ri.item_id, SUM(ri.quantity) AS total_returned FROM return_items ri JOIN returns r ON ri.return_id = r.id WHERE ri.item_id = ? GROUP BY ri.item_id) returns ON i.id = returns.item_id
    LEFT JOIN (SELECT pri.item_id, SUM(pri.quantity) AS total_purchase_returned FROM purchase_return_items pri JOIN purchase_returns pr ON pri.return_id = pr.id WHERE pri.item_id = ? GROUP BY pri.item_id) purchase_returns ON i.id = purchase_returns.item_id
    LEFT JOIN (SELECT item_id, SUM(variance) AS total_adjusted FROM stock_adjustments WHERE item_id = ? GROUP BY item_id) adjustments ON i.id = adjustments.item_id
    WHERE i.id = ? AND i.deleted = FALSE
    `,
    [itemId, itemId, itemId, itemId, itemId, itemId, itemId, itemId]
  );

  return rows[0] || null;
};

module.exports = { getAllItemsWithStock, getItemStock };
