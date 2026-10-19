require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const rules = require('../services/stockRules');

// Audit M7: ONE definition of stock. (The same quantities, end to end, are checked against the
// database in tests/db/stockParity.test.js.)

test('the seven sources, with the right sign', () => {
  assert.deepEqual(rules.SOURCE_NAMES, ['opening', 'purchases', 'issues', 'wastage', 'returns', 'purchaseReturns', 'adjustments']);
  assert.deepEqual(rules.SIGN, { opening: 1, purchases: 1, issues: -1, wastage: -1, returns: 1, purchaseReturns: -1, adjustments: 1 });
});

test('what counts: deleted purchases and wastage notes, pending and deleted adjustments do not', () => {
  assert.equal(rules.RULES.purchases('p'), 'COALESCE(p.deleted, 0) = 0');
  assert.equal(rules.RULES.wastage('w'), 'COALESCE(w.status, 1) = 1 AND COALESCE(w.deleted, 0) = 0');
  assert.equal(rules.RULES.adjustments('sa'), "sa.is_deleted = 0 AND sa.status = 'Approved'");
  assert.match(rules.sourceSql('purchases').sql, /h\.deleted/);
  assert.match(rules.sourceSql('wastage').sql, /h\.status/);
  assert.match(rules.sourceSql('adjustments').sql, /s\.status = 'Approved'/);
});

test('sourceSql: item and date filters add placeholders in order', () => {
  const { sql, params } = rules.sourceSql('issues', { itemId: 7, date: { op: '<', value: '2026-10-01' } });
  assert.deepEqual(params, [7, '2026-10-01']);
  assert.match(sql, /s\.item_id = \?.*DATE\(h\.issuance_date\) < \?/);
  assert.deepEqual(rules.sourceSql('issues').params, []);
});

test('sourceSql: auto-stock items only, and bad input is refused', () => {
  const { sql } = rules.sourceSql('adjustments', { autoStockOnly: true });
  assert.match(sql, /JOIN items it ON it\.id = s\.item_id/);
  assert.match(sql, /it\.auto_add_to_stock = 1/);
  assert.throws(() => rules.sourceSql('nope'), /Unknown stock source/);
  assert.throws(() => rules.sourceSql('issues', { date: { op: '; DROP TABLE items', value: 'x' } }), /Unsupported date operator/);
});

test('currentStockSql: every source joined once; plus for stock in, minus for stock out; params match placeholders', () => {
  const { joins, expr, params } = rules.currentStockSql({ itemId: 9 });
  for (const name of rules.SOURCE_NAMES) assert.equal(joins.split(`stock_${name} ON`).length, 2, name);
  assert.equal(expr, '(COALESCE(stock_opening.qty, 0) + COALESCE(stock_purchases.qty, 0) - COALESCE(stock_issues.qty, 0) '
    + '- COALESCE(stock_wastage.qty, 0) + COALESCE(stock_returns.qty, 0) - COALESCE(stock_purchaseReturns.qty, 0) '
    + '+ COALESCE(stock_adjustments.qty, 0))');
  assert.equal((joins.match(/\?/g) || []).length, params.length);
  assert.deepEqual(params, [9, 9, 9, 9, 9, 9, 9]);

  const asOf = rules.currentStockSql({ date: '2026-10-19' });
  assert.equal(asOf.params.length, 7);
  assert.ok(asOf.params.every((value) => value === '2026-10-19'));
  assert.equal(rules.currentStockSql().params.length, 0);
});

test('sourceTotalSql wraps one source into a single number', () => {
  const { sql, params } = rules.sourceTotalSql('wastage', { itemId: 3 });
  assert.match(sql, /^SELECT COALESCE\(SUM\(t\.qty\), 0\) AS qty FROM \(SELECT /);
  assert.deepEqual(params, [3]);
});

// Nobody may add up a stock source with their own rules again.
test('every file that adds up stock sources goes through services/stockRules', () => {
  const root = path.join(__dirname, '..');
  // Not stock: these read the same tables for something else (a document's own lines, who used what).
  const allowed = new Map([
    ['controllers/wastageController.js', 'wastage notes themselves: list, view, edit lines'],
    ['routes/departmentUsageReport.js', 'issues per department over a period - a usage report, not a balance']
  ]);
  const looksLikeStock = /SUM\((?:wi|pi|ii|ri|pri|sa)\.(?:quantity|variance)\)|SUM\(variance\)|FROM wastage_items|FROM stock_adjustments/;
  const offenders = [];
  for (const dir of ['controllers', 'services', 'routes', 'utils']) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'))) {
      const rel = `${dir}/${file}`;
      if (rel === 'services/stockRules.js') continue;
      const source = fs.readFileSync(path.join(root, rel), 'utf8');
      if (looksLikeStock.test(source) && !source.includes('stockRules') && !allowed.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the old per-screen copies of the stock formula are gone', () => {
  const root = path.join(__dirname, '..');
  const copies = [];
  for (const rel of ['controllers/dashboardController.js', 'controllers/itemController.js', 'controllers/issuanceController.js',
    'controllers/purchaseReturnController.js', 'controllers/adjustmentController.js', 'services/rmStockService.js']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    // A copy of the formula carries its derived-table names; the dashboard's "top issued items" chart is not one.
    if (/total_purchase_returned|total_opening|total_purchased|total_wasted/.test(source)) copies.push(rel);
  }
  assert.deepEqual(copies, []);
});
