// server/services/stockAvailability.js
//
// Audit finding H4: issuing more of an item than is actually in stock. Before an
// issuance is recorded, every item it names is LOCKED (SELECT ... FOR UPDATE,
// ascending id so two multi-item issuances never deadlock on each other) and its
// live stock - never a value the client sent - is checked. Two issuances of the
// same item at the same moment are serialized by that lock: the second one sees
// the first's effect and is refused if there is no longer enough.
//
// Nothing here writes to stock; it only locks and reads (services/rmStockService.js
// is the single current-stock formula). The caller inserts the issuance rows itself,
// inside the same transaction that took the locks.

const { getItemStock } = require('./rmStockService');

class StockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StockError';
    this.status = 400;
  }
}

// Sums duplicate item_id lines, drops zero lines, and rejects anything that is not
// a plain positive quantity - a negative or non-numeric quantity would otherwise
// ADD to stock instead of being issued, defeating the check entirely.
const normalizeLines = (items) => {
  if (!Array.isArray(items) || items.length === 0) throw new StockError('At least one item is required');
  const byItem = new Map();
  for (const item of items) {
    const itemId = Number(item?.item_id);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new StockError('Invalid item in the list');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new StockError('Quantity must be greater than 0 for every item');
    byItem.set(itemId, (byItem.get(itemId) || 0) + quantity);
  }
  return [...byItem.entries()].map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity.toFixed(3)) }));
};

/**
 * Locks every item named in `items` and refuses the whole request (throws
 * StockError, nothing is written) if any one of them does not have enough stock.
 * `creditBack` (Map: itemId -> quantity) is added back before checking - used
 * when EDITING an issuance, so its own old lines (about to be replaced, not
 * added on top of) are excluded from the check.
 *
 * Returns the deduped { itemId, quantity } lines for the caller to insert.
 */
const lockAndCheckAvailability = async (connection, items, { creditBack = new Map() } = {}) => {
  const lines = normalizeLines(items);
  const sorted = [...lines].sort((a, b) => a.itemId - b.itemId);

  const shortages = [];
  for (const { itemId, quantity } of sorted) {
    const [rows] = await connection.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (rows.length === 0) throw new StockError(`Item ${itemId} was not found`);
    // forUpdate: true - a plain read here would still be able to see a stale snapshot
    // from an earlier, unrelated read in this same transaction (see rmStockService.js).
    const stock = await getItemStock(connection, itemId, { forUpdate: true });
    const available = Number(stock?.current_stock ?? 0) + Number(creditBack.get(itemId) || 0);
    if (quantity > available + 0.0005) {
      const label = stock?.name || `Item ${itemId}`;
      const unit = stock?.unit ? ` ${stock.unit}` : '';
      shortages.push(`${label}: requested ${quantity}${unit}, only ${Math.max(available, 0).toFixed(3)}${unit} available`);
    }
  }
  if (shortages.length) throw new StockError(`Not enough stock - ${shortages.join('; ')}`);
  return lines;
};

module.exports = { StockError, normalizeLines, lockAndCheckAvailability };
