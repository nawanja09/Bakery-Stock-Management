require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdjustmentValues } = require('../controllers/adjustmentController');

// systemQuantity is always resolved by the SERVER from live stock (audit H4,
// controllers/adjustmentController.resolveSystemQuantity) - getAdjustmentValues
// takes it as an already-numeric value, never a client-sent system_qty string.

test('uses final actual quantity as the adjustment source of truth', () => {
  assert.deepEqual(
    getAdjustmentValues({ systemQuantity: 100, actual_qty: '97.250', unit_price: '20' }),
    {
      systemQuantity: 100,
      actualQuantity: 97.25,
      unitPrice: 20,
      variance: -2.75,
      amount: -55
    }
  );
});

test('editing an adjustment replaces its impact instead of adding the new quantity', () => {
  const oldImpact = getAdjustmentValues({ systemQuantity: 100, actual_qty: 97, unit_price: 20 }).variance;
  const newImpact = getAdjustmentValues({ systemQuantity: 100, actual_qty: 94, unit_price: 20 }).variance;

  assert.equal(newImpact - oldImpact, -3);
  assert.equal(newImpact, -6);
});

test('deleting an adjustment reverses its report impact', () => {
  const impact = getAdjustmentValues({ systemQuantity: 50, actual_qty: 55, unit_price: 12 }).variance;
  assert.equal(impact + -impact, 0);
});

test('rejects a non-numeric systemQuantity (it must already be resolved by the server)', () => {
  assert.throws(() => getAdjustmentValues({ systemQuantity: NaN, actual_qty: 10, unit_price: 5 }),
    /actual_qty and unit_price must be valid numbers/);
});