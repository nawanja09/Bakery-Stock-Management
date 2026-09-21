const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePositiveMoney,
  dbToCents,
  centsToNumber,
  formatCents,
  parseDateOnly,
  parseId
} = require('../utils/staffLoanUtils');

test('parsePositiveMoney accepts positive whole and decimal amounts as integer cents', () => {
  assert.deepEqual(parsePositiveMoney('50000'), { cents: 5000000 });
  assert.deepEqual(parsePositiveMoney('50000.5'), { cents: 5000050 });
  assert.deepEqual(parsePositiveMoney('50000.55'), { cents: 5000055 });
  assert.deepEqual(parsePositiveMoney(' 12.30 '), { cents: 1230 });
  assert.deepEqual(parsePositiveMoney(.5), { cents: 50 });
  assert.deepEqual(parsePositiveMoney('.5'), { cents: 50 });
  assert.deepEqual(parsePositiveMoney(0.01), { cents: 1 });
  assert.deepEqual(parsePositiveMoney(999999999999.99), { cents: 99999999999999 });
});

test('parsePositiveMoney rejects zero, negative, empty and malformed values', () => {
  for (const bad of ['0', '0.00', 0, '-1', -50, '-0.5', '', '   ', null, undefined, 'abc', '1e3', '1,000', '.', '+5', '5 0', NaN, Infinity, {}, [], true]) {
    const result = parsePositiveMoney(bad);
    assert.ok(result.error, `expected an error for ${JSON.stringify(bad)}`);
    assert.equal(result.cents, undefined);
  }
});

test('parsePositiveMoney rejects more than two decimal places instead of silently rounding', () => {
  assert.match(parsePositiveMoney('10.005').error, /2 decimal places/);
  assert.match(parsePositiveMoney(0.1 + 0.2).error, /2 decimal places/);
});

test('parsePositiveMoney rejects amounts too large for DECIMAL(14,2)', () => {
  assert.match(parsePositiveMoney('1000000000000').error, /too large/);
});

test('parsePositiveMoney uses the supplied label in its messages', () => {
  assert.equal(parsePositiveMoney('', 'Loan amount').error, 'Loan amount is required');
  assert.equal(parsePositiveMoney('0', 'Loan amount').error, 'Loan amount must be greater than zero');
});

test('cent helpers convert database values without floating point drift', () => {
  assert.equal(dbToCents('50000.00'), 5000000);
  assert.equal(dbToCents(19.99), 1999);
  assert.equal(dbToCents(null), 0);
  assert.equal(centsToNumber(5000050), 50000.5);
  assert.equal(centsToNumber(1999), 19.99);
  assert.equal(formatCents(4000000), '40,000.00');
});

test('parseDateOnly accepts real calendar dates only', () => {
  assert.equal(parseDateOnly('2026-09-21'), '2026-09-21');
  assert.equal(parseDateOnly('2028-02-29'), '2028-02-29');
  for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '21/09/2026', '2026-9-1', '', null, undefined, 20260921, '1999-12-31', '2101-01-01']) {
    assert.equal(parseDateOnly(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('parseId only accepts positive integers', () => {
  assert.equal(parseId('12'), 12);
  assert.equal(parseId(7), 7);
  for (const bad of ['0', 0, '-3', 'abc', '1.5', '', null, undefined, '12abc', ' ', 1.5]) {
    assert.equal(parseId(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});
