require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const money = require('../utils/money');

// Audit M5: money arithmetic must not drift.

test('the float problems this replaces', () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(money.add(0.1, 0.2), 0.3);
  assert.equal((1.005).toFixed(2), '1.00');           // JS rounds the wrong way
  assert.equal(money.round2(1.005), 1.01);            // half away from zero, like MySQL DECIMAL
  assert.equal(money.round2('1.005'), 1.01);
  assert.equal(money.fixed(1.005, 2), '1.01');
  assert.equal(money.round2(-1.005), -1.01);
});

test('rounds to 4 decimals, half away from zero', () => {
  assert.equal(money.round(1.23455), 1.2346);
  assert.equal(money.round(1.23454), 1.2345);
  assert.equal(money.round('2.00005'), 2.0001);
  assert.equal(money.round(-2.00005), -2.0001);
  assert.equal(money.round(10), 10);
  assert.equal(money.round('1e-7'), 0);
});

test('thousands of additions do not drift', () => {
  let floatTotal = 0;
  let exactTotal = 0;
  for (let i = 0; i < 100000; i += 1) {
    floatTotal += 0.1;
    exactTotal = money.add(exactTotal, 0.1);
  }
  assert.equal(exactTotal, 10000);
  assert.notEqual(floatTotal, 10000);                  // the float total is off
});

test('price x quantity and VAT are exact', () => {
  assert.equal(money.mul(19.99, 3), 59.97);
  assert.equal(money.mul('0.1', '0.2'), 0.02);
  assert.equal(money.mul(1.005, 1000), 1005);
  assert.equal(money.mul(12.3456, 2.5), 30.864);       // 30.8640
  assert.equal(money.mul(-2, 3.5), -7);
  assert.equal(money.percent(100.25, 18), 18.045);
  assert.equal(money.percent(0.05, 15), 0.0075);
  assert.equal(money.percent(1, 0), 0);
});

test('sub, compare, fixed', () => {
  assert.equal(money.sub(0.3, 0.1), 0.2);
  assert.equal(money.sub(1000, 999.9999), 0.0001);
  assert.equal(money.compare(0.1 + 0.2, 0.3), 0);
  assert.equal(money.compare(1.004, 1.005), -1);       // 1.00 vs 1.01
  assert.equal(money.compare(2, 1), 1);
  assert.equal(money.fixed(0, 2), '0.00');
  assert.equal(money.fixed(1234.5, 2), '1234.50');
  assert.equal(money.fixed(-0.5, 2), '-0.50');
  assert.equal(money.fixed(1e21, 2), '1000000000000000000000.00');
});

test('accepts the shapes the database and forms produce; bad input is 0 / rejected', () => {
  assert.equal(money.round2('1,234.567'), 1234.57);
  assert.equal(money.round2('  12.5 '), 12.5);
  assert.equal(money.round2('0016.10'), 16.1);
  assert.equal(money.add('10.10', '20.20'), 30.3);     // mysql2 returns DECIMAL as text
  assert.equal(money.round2(null), 0);
  assert.equal(money.round2(undefined), 0);
  assert.equal(money.round2('abc'), 0);
  assert.equal(money.round2(NaN), 0);
  assert.equal(money.round2(Infinity), 0);
  assert.equal(money.isAmount('12.50'), true);
  assert.equal(money.isAmount('12.5x'), false);
  assert.equal(money.isAmount(''), false);
  assert.throws(() => money.toUnits('abc', 4, { strict: true }), TypeError);
});

test('units round-trip', () => {
  assert.equal(money.toUnits(12.3456), 123456n);
  assert.equal(money.fromUnits(123456n), 12.3456);
  assert.equal(money.toUnits(-0.0001), -1n);
  assert.equal(money.toUnits(5, 2), 500n);
});

// ---- M5 (2026-10-20): min / max / sum, used wherever Math.min / Math.max / reduce touched money
test('min / max compare exactly, so 0.1 + 0.2 equals 0.3', () => {
  assert.equal(money.min(0.1 + 0.2, 0.3), 0.3);
  assert.equal(money.max(0.1 + 0.2, 0.3), 0.3);
  assert.equal(money.min('5', '5.001'), 5);
  assert.equal(money.max('5', '5.001'), 5.001);
  assert.equal(money.max(0, money.sub(10, 12.5)), 0);
});

test('sum adds thousands of cents without drift', () => {
  const rows = Array.from({ length: 10000 }, () => ({ amount: 0.1 }));
  assert.equal(rows.reduce((s, r) => s + r.amount, 0) === 1000, false, 'plain float addition drifts');
  assert.equal(money.sum(rows, (r) => r.amount), 1000);
  assert.equal(money.sum([]), 0);
});

test('whole-cent conversion is exact where float * 100 is not', () => {
  assert.equal(Math.round(1.005 * 100), 100);
  assert.equal(Number(money.toUnits('1.005', 2)), 101);
  assert.equal(Number(money.toUnits('0.29', 2)), 29);
  assert.equal(money.fromUnits(12345n, 2), 123.45);
});
