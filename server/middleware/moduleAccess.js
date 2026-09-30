// server/middleware/moduleAccess.js
//
// Per-router guards. Access rules are NOT defined here any more: every guard
// delegates to the central RBAC table in config/rolePermissions.js (through
// authorizeApi), so a role change only ever needs to be made in one place.
//
// server.js already applies `authenticate + authorizeApi` to all of /api; these
// arrays keep each router protected on its own too (defence in depth) and keep
// the existing `router.use(...rawMaterialAccess)` call sites unchanged.

const authenticate = require('./authenticate');
const authorizeApi = require('./authorizeApi');
const { requireWriteCapability } = authorizeApi;

const moduleGate = [authenticate, authorizeApi];

const rawMaterialAccess = moduleGate;
const fgProductionAccess = moduleGate;
const financeReadAccess = moduleGate;
const staffLoanReadAccess = moduleGate;
const adjustmentsAccess = moduleGate;
const employeeAccess = moduleGate;

// Finance write endpoints and write-only look-ups: module rule + view-only
// roles (QB) are refused even on GET, as before.
const financeWriteAccess = [authenticate, authorizeApi, requireWriteCapability];

module.exports = {
  rawMaterialAccess,
  fgProductionAccess,
  financeReadAccess,
  financeWriteAccess,
  staffLoanReadAccess,
  adjustmentsAccess,
  employeeAccess
};
