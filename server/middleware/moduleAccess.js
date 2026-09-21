const authenticate = require('./authenticate');
const requireRoles = require('./requireRoles');

const rawMaterialAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin', 'Store Keeper', 'Stores', 'View Only')
];

const fgProductionAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin', 'Accountant', 'Store Keeper', 'Stores', 'View Only')
];

const financeReadAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin', 'Accountant', 'Store Keeper', 'Stores', 'View Only')
];

const financeWriteAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin', 'Accountant')
];

// Staff Loans (Finance -> Staff Loans) hold personal loan balances, so reads are
// limited to the same roles that can open the Finance pages in the client.
// Store Keeper / Stores are intentionally excluded.
const staffLoanReadAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin', 'Accountant', 'View Only')
];

const adjustmentsAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin')
];

// Employee Management holds HR/personal data (NIC, contact number, etc.),
// so it is locked down the same way as Adjustments - Admin/Super Admin only.
const employeeAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin')
];

module.exports = {
  rawMaterialAccess,
  fgProductionAccess,
  financeReadAccess,
  financeWriteAccess,
  staffLoanReadAccess,
  adjustmentsAccess,
  employeeAccess
};
