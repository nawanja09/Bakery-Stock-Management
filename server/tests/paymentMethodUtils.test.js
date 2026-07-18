const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePaymentMethodValue } = require('../utils/paymentMethodUtils');

test('normalizes common display names to canonical payment method values', () => {
  assert.equal(normalizePaymentMethodValue('Cash'), 'CASH');
  assert.equal(normalizePaymentMethodValue('Cheque'), 'CHEQUE');
  assert.equal(normalizePaymentMethodValue('Bank'), 'BANK_TRANSFER');
  assert.equal(normalizePaymentMethodValue('Bank Transfer'), 'BANK_TRANSFER');
  assert.equal(normalizePaymentMethodValue('credit card'), 'CREDIT');
  assert.equal(normalizePaymentMethodValue('CASH'), 'CASH');
});

test('preserves already canonical values', () => {
  assert.equal(normalizePaymentMethodValue('BANK_TRANSFER'), 'BANK_TRANSFER');
  assert.equal(normalizePaymentMethodValue('CREDIT'), 'CREDIT');
  assert.equal(normalizePaymentMethodValue('CHEQUE'), 'CHEQUE');
});
