require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Audit R10: POST /returns/sync-stock rewrote items.current_stock for every item from
// stock_movements - a table issuances and wastages never write - so it produced wrong stock.
// Stock now comes only from services/rmStockService.

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('the sync-stock endpoint and its controller are gone', () => {
  assert.doesNotMatch(read('routes', 'returnRoutes.js'), /sync-stock/);
  const controller = require('../controllers/returnController');
  assert.equal(controller.syncAllStock, undefined);
});

test('return code never reads or writes the stale items.current_stock column', () => {
  const src = read('controllers', 'returnController.js');
  assert.doesNotMatch(src, /SET current_stock/);
  assert.doesNotMatch(src, /i\.current_stock|COALESCE\(current_stock/);
  assert.match(src, /rmStockService/);
});

test('/returns/item-stock reports the live stock from rmStockService', async () => {
  const stockService = require('../services/rmStockService');
  const original = stockService.getItemStock;
  // returnController destructures getItemStock at load, so reload it with the stub in place.
  stockService.getItemStock = async (_conn, id) => (Number(id) === 7
    ? { id: 7, item_code: 'RM-07', name: 'Flour', current_stock: '12.500' }
    : null);
  const controllerPath = require.resolve('../controllers/returnController');
  delete require.cache[controllerPath];
  try {
    const controller = require('../controllers/returnController');
    const call = async (itemId) => {
      let status = 200;
      let body;
      const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
      await controller.getItemCurrentStock({ params: { itemId } }, res);
      return { status, body };
    };
    const hit = await call('7');
    assert.equal(hit.body.current_stock, 12.5);
    assert.equal(hit.body.item_code, 'RM-07');
    assert.equal((await call('99')).status, 404);
  } finally {
    stockService.getItemStock = original;
    delete require.cache[controllerPath];
  }
});
