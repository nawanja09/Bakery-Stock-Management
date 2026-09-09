const test = require('node:test');
const assert = require('node:assert/strict');
const { validateItemInput } = require('../controllers/itemController');

test('validates and normalizes a new item payload', () => {
  assert.deepEqual(
    validateItemInput({ item_code: ' RM-001 ', name: ' Flour ', unit: 'kg', reorder_level: '2.5' }),
    { itemCode: 'RM-001', name: 'Flour', unit: 'kg', reorderLevel: 2.5 }
  );
});

test('rejects incomplete or invalid item payloads', () => {
  assert.equal(validateItemInput({ item_code: '', name: 'Flour', unit: 'kg', reorder_level: 1 }).error, 'Item code is required');
  assert.equal(validateItemInput({ item_code: 'RM-001', name: 'Flour', unit: 'box', reorder_level: 1 }).error, 'A valid unit of measurement is required');
  assert.equal(validateItemInput({ item_code: 'RM-001', name: 'Flour', unit: 'kg', reorder_level: -1 }).error, 'A valid non-negative reorder level is required');
});