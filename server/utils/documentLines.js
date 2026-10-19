const { toYmd } = require('./dateOnly');
const money = require('./money');

class DocumentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DocumentError';
    this.status = status;
  }
}

const requireDate = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !toYmd(value)) {
    throw new DocumentError(`${label} must be a valid date in YYYY-MM-DD format`);
  }
};

const requireDepartment = async (connection, departmentId) => {
  const id = Number(departmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DocumentError('Invalid department');
  }

  const [departments] = await connection.query(
    'SELECT id FROM departments WHERE id = ? AND is_deleted = 0',
    [id]
  );
  if (departments.length === 0) {
    throw new DocumentError('Department not found', 404);
  }
};

const prepareStockLines = async (connection, items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    throw new DocumentError('At least one item is required (maximum 500)');
  }

  const lines = items.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new DocumentError(`Line ${index + 1}: invalid item`);
    }

    const itemId = Number(source.item_id);
    const quantity = Number(source.quantity);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new DocumentError(`Line ${index + 1}: invalid item`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6
      || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-8) {
      throw new DocumentError(`Line ${index + 1}: quantity must be greater than 0 with at most 3 decimal places`);
    }

    return { itemId, quantity, source };
  });

  const itemIds = [...new Set(lines.map(({ itemId }) => itemId))];
  const [existingItems] = await connection.query(
    'SELECT id FROM items WHERE id IN (?) AND deleted = FALSE',
    [itemIds]
  );
  const existingIds = new Set(existingItems.map(({ id }) => Number(id)));
  const missingItem = lines.find(({ itemId }) => !existingIds.has(itemId));
  if (missingItem) {
    throw new DocumentError(`Item ${missingItem.itemId} was not found`, 404);
  }

  return lines;
};

// Like prepareStockLines, but for lines that carry a price (GRN / purchase return):
// item_id, quantity (same rules as above) and unit_price, each validated server-side -
// the client's numbers are never trusted (audit finding R7). Also fetches each item's
// `vat_applicable` flag, since VAT must be computed from the item's real record, not
// whatever the client claims about it.
const preparePricedLines = async (connection, items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    throw new DocumentError('At least one item is required (maximum 500)');
  }

  const lines = items.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new DocumentError(`Line ${index + 1}: invalid item`);
    }

    const itemId = Number(source.item_id);
    const quantity = Number(source.quantity);
    const unitPrice = Number(source.unit_price);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new DocumentError(`Line ${index + 1}: invalid item`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6
      || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-8) {
      throw new DocumentError(`Line ${index + 1}: quantity must be greater than 0 with at most 3 decimal places`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1e8) {
      throw new DocumentError(`Line ${index + 1}: unit price must be a valid, non-negative number`);
    }

    return {
      itemId, quantity, unitPrice,
      itemName: typeof source.item_name === 'string' && source.item_name.trim() ? source.item_name.slice(0, 255) : null,
      source
    };
  });

  const itemIds = [...new Set(lines.map(({ itemId }) => itemId))];
  const [existingItems] = await connection.query(
    'SELECT id, name, vat_applicable FROM items WHERE id IN (?) AND deleted = FALSE',
    [itemIds]
  );
  const byId = new Map(existingItems.map((row) => [Number(row.id), row]));
  const missingItem = lines.find(({ itemId }) => !byId.has(itemId));
  if (missingItem) {
    throw new DocumentError(`Item ${missingItem.itemId} was not found`, 404);
  }

  return lines.map((line) => {
    const item = byId.get(line.itemId);
    return {
      ...line,
      // item_name is a required column; fall back to the item's real name when
      // the client sends none, rather than trusting it blindly or crashing.
      itemName: line.itemName || item.name,
      vatApplicable: item.vat_applicable === 1 || item.vat_applicable === true
    };
  });
};

// Subtotal / VAT / grand total computed from validated lines - never from whatever
// the client claims the totals are (audit finding R7). VAT applies only to a line
// whose item is vat_applicable, and only when the supplier is VAT-registered.
const totalPricedLines = (lines, { vatRate = 0, supplierVatRegistered = false } = {}) => {
  // Exact decimal arithmetic carried at 4 decimals (utils/money.js); rounded to the 2 decimals the
  // purchases columns store only at the end, so the stored total is always subtotal + VAT.
  let subtotal = 0;
  let vatAmount = 0;
  for (const line of lines) {
    const amount = money.mul(line.quantity, line.unitPrice);
    subtotal = money.add(subtotal, amount);
    if (supplierVatRegistered && line.vatApplicable) {
      vatAmount = money.add(vatAmount, money.percent(amount, vatRate));
    }
  }
  const roundedSubtotal = money.round2(subtotal);
  const roundedVat = money.round2(vatAmount);
  return { subtotal: roundedSubtotal, vatAmount: roundedVat, totalWithVat: money.round2(money.add(roundedSubtotal, roundedVat)) };
};

module.exports = {
  DocumentError, requireDate, requireDepartment, prepareStockLines, preparePricedLines, totalPricedLines
};
