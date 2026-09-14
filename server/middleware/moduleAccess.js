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

const adjustmentsAccess = [
  authenticate,
  requireRoles('Admin', 'Super Admin')
];

module.exports = {
  rawMaterialAccess,
  fgProductionAccess,
  financeReadAccess,
  financeWriteAccess,
  adjustmentsAccess
};
