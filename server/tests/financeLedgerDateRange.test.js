const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateDateRangeBalance } = require('../utils/financeLedger');

test('uses closing balance as the reference and then applies later credits and debits', () => {
  const result = calculateDateRangeBalance({
    closingBalance: 1200,
    creditAfterDate: 250,
    debitAfterDate: 75
  });

  assert.equal(result, 1375);
});

test('keeps the previous balance when there are no later transactions', () => {
  const result = calculateDateRangeBalance({
    closingBalance: 820,
    creditAfterDate: 0,
    debitAfterDate: 0
  });

  assert.equal(result, 820);
});
