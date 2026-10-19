const { toYmd } = require('./dateOnly');

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

module.exports = { DocumentError, requireDate, requireDepartment, prepareStockLines };
