require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeRequest, shouldRecord, toStoredJson } = require('../services/auditLog');
const { evaluateApiAccess } = require('../config/rolePermissions');

test('records every data change, sign-in event and refusal - but not data views', () => {
  assert.equal(shouldRecord('POST', '/api/purchases', 201), true);
  assert.equal(shouldRecord('PUT', '/api/items/4', 400), true);
  assert.equal(shouldRecord('DELETE', '/api/items/4', 200), true);
  assert.equal(shouldRecord('POST', '/api/login', 401), true);
  assert.equal(shouldRecord('GET', '/api/finance/cash/ledger/1', 403), true);
  assert.equal(shouldRecord('GET', '/api/items', 200), false);
  assert.equal(shouldRecord('GET', '/api/items', 404), false);
  assert.equal(shouldRecord('POST', '/api/refresh-token', 200), false);
});

test('names the action, module and record from the request', () => {
  assert.deepEqual(describeRequest('POST', '/api/purchases/pay-multiple', 200),
    { module: 'Purchasing', entityId: null, action: 'PAY', eventType: 'CHANGE' });
  assert.deepEqual(describeRequest('PATCH', '/api/inhand/3/approve', 200),
    { module: 'Adjustments', entityId: '3', action: 'APPROVE', eventType: 'CHANGE' });
  assert.deepEqual(describeRequest('PUT', '/api/purchases/payments/91-12/adjust?x=1', 409),
    { module: 'Purchasing', entityId: '91-12', action: 'ADJUST', eventType: 'CHANGE' });
  assert.deepEqual(describeRequest('DELETE', '/api/cutlery-assets/7', 200),
    { module: 'Cutlery', entityId: '7', action: 'DELETE', eventType: 'CHANGE' });
  assert.deepEqual(describeRequest('GET', '/api/audit-logs', 403),
    { module: 'Audit Trail', entityId: null, action: 'ACCESS_DENIED', eventType: 'DENIED' });
  assert.equal(describeRequest('POST', '/api/login', 200).action, 'LOGIN');
  assert.equal(describeRequest('POST', '/api/logout', 200).action, 'LOGOUT');
  assert.equal(describeRequest('POST', '/api/change-password', 400).action, 'PASSWORD_CHANGE');
});

test('never stores passwords or tokens, and caps stored data', () => {
  const stored = JSON.parse(toStoredJson({
    username: 'admin', password: 'secret1', currentPassword: 'a', newPassword: 'b',
    token: 'eyJ', nested: { api_key: 'k', amount: 10 }
  }));
  assert.deepEqual(stored, {
    username: 'admin', password: '[REDACTED]', currentPassword: '[REDACTED]', newPassword: '[REDACTED]',
    token: '[REDACTED]', nested: { api_key: '[REDACTED]', amount: 10 }
  });
  assert.equal(toStoredJson({}), null);
  const big = toStoredJson({ rows: Array.from({ length: 3000 }, (_, i) => ({ i, text: 'x'.repeat(150) })) });
  assert.ok(big.length <= 16 * 1024);
  assert.equal(JSON.parse(big).truncated, true);
});

test('only Admin and Super Admin can read the audit trail', () => {
  for (const role of ['Admin', 'Super Admin']) {
    assert.equal(evaluateApiAccess(role, 'GET', '/api/audit-logs').allowed, true, role);
    assert.equal(evaluateApiAccess(role, 'GET', '/api/audit-logs/12').allowed, true, role);
  }
  for (const role of ['Accountant', 'Store Keeper', 'Finance', 'View Only']) {
    assert.equal(evaluateApiAccess(role, 'GET', '/api/audit-logs').allowed, false, role);
  }
});
