// server/services/auditSnapshots.js
//
// "Before" and "after" copies of the record an API request edits, deletes,
// pays, settles, approves ... so the Audit Trail shows old -> new values.
//
// services/auditLog.js takes the BEFORE copy just before the request is handled
// and the AFTER copy once its response has been sent (the handler has committed
// by then). Only requests whose path names one record are covered - the rules
// below map each such API path to its table (and line-item tables). Anything
// else is still recorded, with the data that was sent.

// [path pattern (after /api, without query), table, child tables [[table, foreign key]]]
// The first capture group is the record id.
const RULES = [
  // ---- Raw Materials ----
  [/^\/purchases\/(\d+)$/, 'purchases', [['purchase_items', 'purchase_id']]],
  [/^\/purchases\/(\d+)\/pay$/, 'purchases'],
  [/^\/purchases\/purchase\/(\d+)\/pay$/, 'purchases'],
  [/^\/purchases\/(\d+)\/settle$/, 'purchase_returns'],
  [/^\/purchases\/payments\/(\d+)-\d+\/adjust$/, 'payment_history', [['purchase_payment_allocations', 'payment_history_id']]],
  [/^\/purchase-returns\/(\d+)\/settle$/, 'purchase_returns'],
  [/^\/issuances\/(\d+)$/, 'issuances', [['issuance_items', 'issuance_id']]],
  [/^\/wastages\/(\d+)$/, 'wastages', [['wastage_items', 'wastage_id']]],
  [/^\/adjustments\/(\d+)$/, 'stock_adjustments'],
  [/^\/opening-balance\/(\d+)$/, 'opening_balances'],
  [/^\/orders\/(\d+)\/cancel$/, 'orders', [['order_items', 'order_id']]],
  [/^\/items\/(\d+)(\/status)?$/, 'items'],
  [/^\/item-types\/(\d+)$/, 'item_types'],
  [/^\/suppliers\/(\d+)$/, 'supplier'],
  [/^\/departments\/(\d+)$/, 'departments'],
  [/^\/companies\/(\d+)$/, 'company'],

  // ---- Expenses ----
  [/^\/new-expenses\/(\d+)$/, 'expenses'],
  [/^\/new-expenses\/cheque-registry\/(\d+)$/, 'expenses_cheque_registry'],
  [/^\/cash-expenses\/(\d+)$/, 'cash_expenses'],
  [/^\/hidden-expenses\/(\d+)$/, 'hidden_expenses'],
  [/^\/expenses\/petty-cash\/voucher\/(\d+)$/, 'petty_cash_vouchers'],
  [/^\/expenses\/petty-cash\/reimbursement\/(\d+)$/, 'petty_cash_reimbursements'],
  [/^\/expenses\/cheque\/(voucher|realise)\/(\d+)$/, 'cheque_expenses', [], 2],
  [/^\/expenses\/bank-charges\/(\d+)$/, 'bank_charges'],
  [/^\/expenses\/banks\/(\d+)$/, 'bank_details'],
  [/^\/expenses\/online\/(\d+)$/, 'online_expenses', [['online_expense_payments', 'expense_id']]],
  [/^\/payees\/(\d+)$/, 'payees'],
  [/^\/expense-types\/(\d+)$/, 'expense_types'],
  [/^\/sub-expense-types\/(\d+)(\/status)?$/, 'sub_expense_types'],
  [/^\/bank-charges-types\/(\d+)$/, 'bank_charges_types'],
  [/^\/payment-methods\/(\d+)$/, 'payment_methods'],

  // ---- Finance ----
  [/^\/finance\/cash\/(issued|receive)\/(\d+)$/, 'finance_transactions', [], 2],
  [/^\/finance\/cheque-registry\/(\d+)$/, 'expenses_cheque_registry'],
  [/^\/staff-loans\/(\d+)\/repayments$/, 'staff_loans'],
  [/^\/other-ledgers\/(\d+)(\/status)?$/, 'other_ledgers'],
  [/^\/receive-types\/(\d+)(\/restore)?$/, 'receive_types'],
  [/^\/credit-card-rates\/(\d+)(\/activate|\/deactivate)?$/, 'credit_card_rates'],
  [/^\/incomes\/(\d+)$/, 'incomes'],

  // ---- Adjustments / Management ----
  [/^\/inhand\/(\d+)\/(submit|approve|cancel)$/, 'inhand_adjustments'],
  [/^\/employees\/(\d+)(\/status)?$/, 'employees'],

  // ---- Cutlery / FG Production ----
  [/^\/cutlery-assets\/(\d+)$/, 'cutlery_assets'],
  [/^\/cutlery-locations\/(\d+)$/, 'cutlery_locations'],
  [/^\/cutlery-purchases\/(\d+)$/, 'cutlery_purchases', [['cutlery_purchase_items', 'purchase_id']]],
  [/^\/cutlery-damages\/(\d+)$/, 'cutlery_damages', [['cutlery_damage_items', 'damage_id']]],
  [/^\/cutlery-transfers\/(\d+)$/, 'cutlery_transfers', [['cutlery_transfer_items', 'transfer_id']]],
  [/^\/fg-production\/(\d+)$/, 'fg_production'],
  [/^\/fg-production\/recipes\/(\d+)$/, 'fg_production_recipes']
];

const MAX_CHILD_ROWS = 200;

const apiPathOf = (url = '') => String(url).split('?')[0].replace(/^\/api(?=\/)/i, '').replace(/\/+$/, '').toLowerCase();

/** { table, id, children } for a request path, or null when it names no single record. */
const snapshotTargetOf = (url) => {
  const path = apiPathOf(url);
  for (const [pattern, table, children = [], group = 1] of RULES) {
    const match = path.match(pattern);
    if (match) return { table, id: Number(match[group]), children };
  }
  return null;
};

// dateStrings: dates exactly as stored ('2026-10-16 09:15:02'), never shifted to UTC.
const read = (db, sql, values) => db.query({ sql, values, dateStrings: true });

/** { row, <childTable>: [rows] } of the record now, or null when it does not exist. */
const takeSnapshot = async (db, target) => {
  if (!target || !Number.isInteger(target.id) || target.id <= 0) return null;
  const [rows] = await read(db, 'SELECT * FROM ?? WHERE id = ? LIMIT 1', [target.table, target.id]);
  if (!rows.length) return null;
  const snapshot = { row: rows[0] };
  for (const [childTable, foreignKey] of target.children) {
    try {
      const [childRows] = await read(
        db, 'SELECT * FROM ?? WHERE ?? = ? ORDER BY id LIMIT ?', [childTable, foreignKey, target.id, MAX_CHILD_ROWS]
      );
      snapshot[childTable] = childRows;
    } catch (error) {
      // A line-item table missing on this install never blocks the record itself.
    }
  }
  return snapshot;
};

// Fields that change on every save and say nothing about the edit.
const IGNORED_FIELDS = new Set(['updated_at']);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What changed between two snapshots:
 *   { fields: [{ field, before, after }], children: { table: { added, removed, changed } } }
 * after = null means the record no longer exists (deleted).
 */
const diffSnapshots = (before, after) => {
  if (!before && !after) return null;
  const oldRow = before?.row || {};
  const newRow = after?.row || {};
  const fields = [];
  for (const field of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) {
    if (IGNORED_FIELDS.has(field)) continue;
    if (!same(oldRow[field], newRow[field])) fields.push({ field, before: oldRow[field] ?? null, after: newRow[field] ?? null });
  }
  const children = {};
  for (const table of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (table === 'row') continue;
    const oldRows = new Map((before?.[table] || []).map((r) => [r.id, r]));
    const newRows = new Map((after?.[table] || []).map((r) => [r.id, r]));
    const added = [...newRows.keys()].filter((id) => !oldRows.has(id)).map((id) => newRows.get(id));
    const removed = [...oldRows.keys()].filter((id) => !newRows.has(id)).map((id) => oldRows.get(id));
    const changed = [...newRows.keys()]
      .filter((id) => oldRows.has(id) && !same(oldRows.get(id), newRows.get(id)))
      .map((id) => ({ before: oldRows.get(id), after: newRows.get(id) }));
    if (added.length || removed.length || changed.length) children[table] = { added, removed, changed };
  }
  // Removed for good, or soft-deleted (is_deleted 0 -> 1, services/softDelete.js): either way "deleted".
  const softDeleted = Boolean(before && after) && Number(oldRow.is_deleted) === 0 && Number(newRow.is_deleted) === 1;
  return { deleted: Boolean(before && !after) || softDeleted, fields, children };
};

module.exports = { snapshotTargetOf, takeSnapshot, diffSnapshots, RULES };
