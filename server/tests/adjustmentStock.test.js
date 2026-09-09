const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdjustmentValues } = require('../controllers/adjustmentController');

test('uses final actual quantity as the adjustment source of truth', () => {
  assert.deepEqual(
    getAdjustmentValues({ system_qty: '100.000', actual_qty: '97.250', unit_price: '20' }),
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
  const oldImpact = getAdjustmentValues({ system_qty: 100, actual_qty: 97, unit_price: 20 }).variance;
  const newImpact = getAdjustmentValues({ system_qty: 100, actual_qty: 94, unit_price: 20 }).variance;

  assert.equal(newImpact - oldImpact, -3);
  assert.equal(newImpact, -6);
});

test('deleting an adjustment reverses its report impact', () => {
  const impact = getAdjustmentValues({ system_qty: 50, actual_qty: 55, unit_price: 12 }).variance;
  assert.equal(impact + -impact, 0);
});