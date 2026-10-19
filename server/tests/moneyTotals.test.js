require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const { totalPricedLines } = require('../utils/documentLines');
const { calculateRunningBalances, calculateDateRangeBalance } = require('../utils/financeLedger');
const { toMoney } = require('../services/collectionMapper');

// Audit M5: the money paths use exact decimals (utils/money.js), not floats.

test('invoice totals: 1.005 x 1000 and VAT are exact, stored total = subtotal + VAT', () => {
  const lines = [{ quantity: 1000, unitPrice: 1.005, vatApplicable: true }];
  const t = totalPricedLines(lines, { vatRate: 18, supplierVatRegistered: true });
  assert.equal(t.subtotal, 1005);
  assert.equal(t.vatAmount, 180.9);
  assert.equal(t.totalWithVat, 1185.9);
});

test('invoice totals: many small lines add up without drift', () => {
  const lines = Array.from({ length: 1000 }, () => ({ quantity: 1, unitPrice: 0.1, vatApplicable: false }));
  const t = totalPricedLines(lines, { vatRate: 0, supplierVatRegistered: false });
  assert.equal(t.subtotal, 100);
  assert.equal(t.totalWithVat, 100);
});

test('invoice totals: sub-cent line amounts are kept at 4 decimals until stored', () => {
  // 3 x 0.3333 = 0.9999 -> 1.00 stored; per-line 2dp rounding would have given 3 x 0.33 = 0.99
  const t = totalPricedLines([{ quantity: 3, unitPrice: 0.3333, vatApplicable: false }], {});
  assert.equal(t.subtotal, 1);
});

test('ledger running balance has no float drift', () => {
  const rows = Array.from({ length: 1000 }, () => ({ debit: 0.1, credit: 0 }));
  const out = calculateRunningBalances(rows, 0);
  assert.equal(out[out.length - 1].balance, 100);
  assert.equal(calculateDateRangeBalance({ closingBalance: 0.3, creditAfterDate: 0.1, debitAfterDate: 0.2 }), 0.4);
});

test('POS amounts round half up like the database', () => {
  assert.equal(toMoney('1.005'), 1.01);
  assert.equal(toMoney(2.675), 2.68);
  assert.equal(toMoney('Rs. 1,250.50'), 1250.5);
  assert.ok(Number.isNaN(toMoney('abc')));
});
