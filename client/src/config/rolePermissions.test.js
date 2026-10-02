import {
  MODULES,
  ROLES,
  canAccessPath,
  canSeeNavModule,
  getRoleModules,
  normalizeRole
} from './rolePermissions';

describe('Finance role permissions', () => {
  test('canonical roles remain normalized when passed through permission helpers', () => {
    expect(normalizeRole('Finance')).toBe(ROLES.FINANCE_USER);
    expect(normalizeRole(ROLES.FINANCE_USER)).toBe(ROLES.FINANCE_USER);
    expect(getRoleModules(ROLES.FINANCE_USER)).toEqual([MODULES.MANAGEMENT, MODULES.EXPENSES]);
  });

  test('Finance sees only Dashboard, Management, and Expenses navigation', () => {
    expect(canAccessPath(ROLES.FINANCE_USER, '/dashboard')).toBe(true);
    expect(canAccessPath(ROLES.FINANCE_USER, '/management')).toBe(true);
    expect(canAccessPath(ROLES.FINANCE_USER, '/expenses/petty-cash')).toBe(true);

    expect(canSeeNavModule(ROLES.FINANCE_USER, 'management')).toBe(true);
    expect(canSeeNavModule(ROLES.FINANCE_USER, 'expenses')).toBe(true);
    [
      'raw', 'finished', 'finance', 'cutlery', 'fg-production',
      'adjustments', 'vat', 'analyst', 'admin'
    ].forEach((moduleName) => {
      expect(canSeeNavModule(ROLES.FINANCE_USER, moduleName)).toBe(false);
    });
  });
});
