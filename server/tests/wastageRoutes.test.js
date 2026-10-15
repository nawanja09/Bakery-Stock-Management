require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../routes/wastageRoutes');
const wastageController = require('../controllers/wastageController');

const routes = router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));

// A deleted wastage note was hidden from every list while the stock formulas
// still subtracted its quantity. Notes are corrected through Edit (PUT) only.
test('wastage notes cannot be deleted through the API', () => {
  assert.ok(!routes.some((route) => route.startsWith('DELETE ')), `unexpected DELETE route: ${routes.join(', ')}`);
  assert.equal(wastageController.deleteWastage, undefined);
});

test('wastage notes can still be created, listed, viewed and edited', () => {
  assert.deepEqual(routes.sort(), ['GET /', 'GET /:id', 'POST /', 'PUT /:id']);
});
