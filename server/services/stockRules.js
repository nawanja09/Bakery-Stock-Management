// server/services/stockRules.js
//
// THE definition of RM stock (audit finding M7). Pure SQL text - no database access.
//
//   stock = opening balances
//         + purchases              (purchase_items)
//         - issuances              (issuance_items)
//         - wastages               (wastage_items)
//         + returns from depts     (return_items)
//         - purchase returns       (purchase_return_items)
//         + approved adjustments   (stock_adjustments.variance)
//
// Before this file the formula was copied into the dashboard, the items list, the issuance page,
// the purchase-return page, the stock report, the balance sheet and more, and the copies
// disagreed: some left out purchase returns or adjustments, some counted a deleted wastage note
// or a deleted purchase, so the same item showed a different quantity on different screens.
//
// Two things live here and nowhere else:
//   1. RULES  - which records COUNT (deleted / unapproved ones do not). Every stock query embeds
//               these, whatever its shape (current stock, as-of-date, one day, a date range).
//   2. currentStockSql() / sourceSql() - ready-made queries for the common shapes.
//
// tests/stockRules.test.js fails if a controller sums a stock source without going through here.
//
// A record that a workflow can delete or hold back must get its rule HERE, once. (issuances,
// returns, purchase returns and opening balances have no such flag today - nothing sets one.)

// Predicates take the alias the calling query gave the table.
const RULES = {
  // A deleted purchase invoice no longer adds stock.
  purchases: (h = 'p') => `COALESCE(${h}.deleted, 0) = 0`,
  // A deleted wastage note (status 0) no longer takes stock out (audit R3).
  wastage: (h = 'w') => `COALESCE(${h}.status, 1) = 1 AND COALESCE(${h}.deleted, 0) = 0`,
  // A deleted adjustment, or one still waiting for its second user (maker-checker, H4), has no effect.
  adjustments: (s = 'sa') => `${s}.is_deleted = 0 AND ${s}.status = 'Approved'`,
  // No flags today - kept so every source reads the same way and a future flag has one home.
  opening: () => '1 = 1',
  issues: () => '1 = 1',
  returns: () => '1 = 1',
  purchaseReturns: () => '1 = 1'
};

// How to read each source. `date` is the column the source is dated by.
const SOURCES = {
  opening: {
    from: 'opening_balances s',
    where: () => RULES.opening(),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(s.date)'
  },
  purchases: {
    from: 'purchase_items s JOIN purchases h ON h.id = s.purchase_id',
    where: () => RULES.purchases('h'),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(h.purchase_date)'
  },
  issues: {
    from: 'issuance_items s JOIN issuances h ON h.id = s.issuance_id',
    where: () => RULES.issues(),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(h.issuance_date)'
  },
  wastage: {
    from: 'wastage_items s JOIN wastages h ON h.id = s.wastage_id',
    where: () => RULES.wastage('h'),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(h.date)'
  },
  returns: {
    from: 'return_items s JOIN returns h ON h.id = s.return_id',
    where: () => RULES.returns(),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(h.return_date)'
  },
  purchaseReturns: {
    from: 'purchase_return_items s JOIN purchase_returns h ON h.id = s.return_id',
    where: () => RULES.purchaseReturns(),
    item: 's.item_id', qty: 's.quantity', date: 'DATE(h.return_date)'
  },
  adjustments: {
    from: 'stock_adjustments s',
    where: () => RULES.adjustments('s'),
    item: 's.item_id', qty: 's.variance', date: 'DATE(s.date)'
  }
};

// Stock goes UP for these, DOWN for the others.
const SIGN = { opening: 1, purchases: 1, issues: -1, wastage: -1, returns: 1, purchaseReturns: -1, adjustments: 1 };
const SOURCE_NAMES = Object.keys(SOURCES);

const DATE_OPS = new Set(['<=', '<', '=', '>=', '>']);

/**
 * One source as a derived table: columns item_id, qty (grouped by item).
 * @param name    one of SOURCE_NAMES
 * @param options { itemId, date: { op, value }, autoStockOnly }
 *                itemId         only this item
 *                date           only records dated `op` value (op: <= < = >= >)
 *                autoStockOnly  only items that are auto-managed stock and not deleted (the stock reports)
 * @returns { sql, params }
 */
const sourceSql = (name, { itemId = null, date = null, autoStockOnly = false } = {}) => {
  const source = SOURCES[name];
  if (!source) throw new Error(`Unknown stock source: ${name}`);
  const params = [];
  const conditions = [source.where()];
  let joinItems = '';

  if (itemId !== null && itemId !== undefined) {
    conditions.push(`${source.item} = ?`);
    params.push(itemId);
  }
  if (date) {
    if (!DATE_OPS.has(date.op)) throw new Error(`Unsupported date operator: ${date.op}`);
    conditions.push(`${source.date} ${date.op} ?`);
    params.push(date.value);
  }
  if (autoStockOnly) {
    joinItems = ` JOIN items it ON it.id = ${source.item}`;
    conditions.push('it.auto_add_to_stock = 1', '(it.deleted = FALSE OR it.deleted IS NULL)');
  }

  return {
    sql: `SELECT ${source.item} AS item_id, SUM(${source.qty}) AS qty FROM ${source.from}${joinItems} WHERE ${conditions.join(' AND ')} GROUP BY ${source.item}`,
    params
  };
};

/**
 * The total of one source over all matching records (one number): SELECT ... AS qty.
 */
const sourceTotalSql = (name, options = {}) => {
  const { sql, params } = sourceSql(name, options);
  return { sql: `SELECT COALESCE(SUM(t.qty), 0) AS qty FROM (${sql}) t`, params };
};

/**
 * Current stock for the items table aliased `i` (the caller supplies FROM items i):
 *   const { joins, expr, params } = currentStockSql({ itemId });
 *   `SELECT i.id, ${expr} AS current_stock FROM items i ${joins} WHERE ...`  with params first.
 * `date` (optional) = stock as of that date: records dated after it are ignored.
 */
const currentStockSql = ({ itemId = null, date = null } = {}) => {
  const joins = [];
  const params = [];
  const terms = [];
  for (const name of SOURCE_NAMES) {
    const { sql, params: p } = sourceSql(name, { itemId, date: date ? { op: '<=', value: date } : null });
    const alias = `stock_${name}`;
    joins.push(`LEFT JOIN (${sql}) ${alias} ON ${alias}.item_id = i.id`);
    params.push(...p);
    terms.push(`${SIGN[name] > 0 ? '+' : '-'} COALESCE(${alias}.qty, 0)`);
  }
  // "+ a - b ..." -> "(a - b ...)": the first term is always a plus.
  const expr = `(${terms.join(' ').replace(/^\+ /, '')})`;
  return { joins: joins.join('\n    '), expr, params };
};

module.exports = { RULES, SOURCES, SOURCE_NAMES, SIGN, sourceSql, sourceTotalSql, currentStockSql };
