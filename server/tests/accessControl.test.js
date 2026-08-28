const test = require('node:test');
const assert = require('node:assert/strict');

const itemTypeController = require('../controllers/itemTypeController');
const departmentController = require('../controllers/departmentController');
const companyController = require('../controllers/companyController');
const restrictRoles = require('../middleware/restrictRoles');
const requireRoles = require('../middleware/requireRoles');
const readOnly = require('../middleware/readOnly');

test('master-data controllers expose update and delete handlers', () => {
  assert.equal(typeof itemTypeController.updateItemType, 'function');
  assert.equal(typeof itemTypeController.deleteItemType, 'function');
  assert.equal(typeof departmentController.updateDepartment, 'function');
  assert.equal(typeof departmentController.deleteDepartment, 'function');
  assert.equal(typeof companyController.updateCompany, 'function');
  assert.equal(typeof companyController.deleteCompany, 'function');
});

test('restrictRoles blocks configured roles and allows everyone else', () => {
  const next = () => {};
  const blocked = restrictRoles('Store Keeper');

  const blockedReq = { user: { role: 'Store Keeper' } };
  const allowedReq = { user: { role: 'Admin' } };

  let blockedStatus = null;
  let blockedBody = null;
  const blockedRes = {
    status(code) {
      blockedStatus = code;
      return { json(payload) { blockedBody = payload; } };
    }
  };

  blocked(blockedReq, blockedRes, next);
  assert.equal(blockedStatus, 403);

  blocked(allowedReq, { status: () => ({ json: () => {} }) }, next);
  assert.equal(blockedStatus, 403);
});

test('requireRoles only allows the listed roles', () => {
  const next = () => {};
  const allowed = requireRoles('Admin', 'Accountant');

  let blockedStatus = null;
  let blockedBody = null;
  const blockedRes = {
    status(code) {
      blockedStatus = code;
      return { json(payload) { blockedBody = payload; } };
    }
  };

  allowed({ user: { role: 'Store Keeper' } }, blockedRes, next);
  assert.equal(blockedStatus, 403);

  let allowedCalled = false;
  allowed({ user: { role: 'Admin' } }, { status: () => ({ json: () => {} }) }, () => {
    allowedCalled = true;
  });
  assert.equal(allowedCalled, true);
});

test('readOnly blocks view-only mutations with the standard warning', () => {
  const token = require('jsonwebtoken').sign(
    { role: 'View Only' },
    process.env.JWT_SECRET || 'test-secret'
  );
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  let response = null;
  readOnly(
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
    { status(code) { response = { status: code }; return { json(body) { response.body = body; } }; } },
    () => { response = { passed: true }; }
  );
  process.env.JWT_SECRET = previousSecret;

  assert.deepEqual(response, {
    status: 403,
    body: { error: 'You have view-only access. You do not have permission to edit or delete this information.' }
  });
});
