const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MODULES,
  ROLES,
  canWrite,
  evaluateApiAccess,
  getRoleModules,
  normalizeRole
} = require('../config/rolePermissions');

test('Finance role has only Management and Expenses privileges (no Collection: segregation of duties)', () => {
  assert.equal(normalizeRole('Finance'), ROLES.FINANCE_USER);
  assert.equal(normalizeRole(ROLES.FINANCE_USER), ROLES.FINANCE_USER);
  assert.deepEqual(getRoleModules('Finance'), [MODULES.MANAGEMENT, MODULES.EXPENSES]);
  assert.deepEqual(getRoleModules(ROLES.FINANCE_USER), [MODULES.MANAGEMENT, MODULES.EXPENSES]);
  assert.equal(canWrite('Finance'), true);
});

test('Finance cannot reach any Collection or POS / Restaurant endpoint', () => {
  const canAccess = (method, url) => evaluateApiAccess('Finance', method, url).allowed;
  for (const url of ['/api/collections/pending', '/api/collections/completed', '/api/collections/12',
    '/api/collections/departments', '/api/collections/integrations/status', '/api/integrations/access']) {
    assert.equal(canAccess('GET', url), false, url);
  }
  for (const url of ['/api/collections/approve', '/api/collections/reject', '/api/collections/restore',
    '/api/collections/integrations/pos/connect', '/api/Collections/APPROVE']) {
    assert.equal(canAccess('POST', url), false, url);
  }
});

test('Finance dashboard APIs only expose the scoped dashboard overview', () => {
  const canAccess = (method, path) => evaluateApiAccess('Finance', method, path).allowed;

  assert.equal(canAccess('GET', '/api/dashboard/finance-overview'), true);
  assert.equal(canAccess('POST', '/api/dashboard/finance-overview'), false);
  assert.equal(canAccess('GET', '/api/dashboard/dashboard/overview'), false);
  assert.equal(canAccess('GET', '/api/dashboard/charts'), false);
  assert.equal(canAccess('GET', '/api/dashboard/top-items'), false);
  assert.equal(canAccess('GET', '/api/stats'), false);
});

test('Finance can use Management and Expenses APIs but receives default-deny elsewhere', () => {
  const canAccess = (method, path) => evaluateApiAccess('Finance', method, path).allowed;

  assert.equal(canAccess('GET', '/api/companies'), true);
  assert.equal(canAccess('GET', '/api/expense-types'), true);
  assert.equal(canAccess('POST', '/api/expenses'), true);
  assert.equal(canAccess('GET', '/api/items'), false);
  assert.equal(canAccess('GET', '/api/finance/cash'), false);
  assert.equal(canAccess('GET', '/api/fg-production/recipes'), false);
  assert.equal(canAccess('GET', '/api/reports/vat'), false);
  assert.equal(canAccess('GET', '/api/analyst/income'), false);
});
