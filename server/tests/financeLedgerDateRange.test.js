const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateDateRangeBalance, calculateRunningBalances } = require('../utils/financeLedger');

test('uses closing balance as the reference and then applies later debits and credits in the correct direction', () => {
  const result = calculateDateRangeBalance({
    closingBalance: 1200,
    creditAfterDate: 250,
    debitAfterDate: 75
  });

  assert.equal(result, 1025);
});

test('keeps the previous balance when there are no later transactions', () => {
  const result = calculateDateRangeBalance({
    closingBalance: 820,
    creditAfterDate: 0,
    debitAfterDate: 0
  });

  assert.equal(result, 820);
});

test('starts the selected date range from the last known closing balance before the start date', () => {
  const rows = [
    { id: 1, date: '2026-07-16', debit: 4000, credit: 0 },
    { id: 2, date: '2026-07-17', debit: 10000, credit: 0 },
    { id: 3, date: '2026-07-31', debit: 0, credit: 25000 }
  ];

  const result = calculateRunningBalances(rows, 200000);

  assert.deepEqual(result.map(row => row.balance), [204000, 214000, 189000]);
});
