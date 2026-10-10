// server/config/rolePermissions.js
//
// SINGLE SOURCE OF TRUTH for role-based access on the API.
//
// The client keeps a mirror of the role -> module table in
// client/src/config/rolePermissions.js (CRA cannot import files outside
// client/src). server/tests/rolePermissions.test.js fails if the two ever
// drift apart, so when you change a role here, change it there too.
//
// Concepts
// --------
//  * ROLE    - canonical role name. The `users.role` column stores 'Store Keeper'
//              for Stores and 'View Only' for the QB login; both are mapped to
//              canonical names by normalizeRole().
//  * MODULE  - a navigation module (Raw Materials, Finance, ...). A role is granted
//              a list of modules.
//  * VIEW_ONLY roles can call GET/HEAD/OPTIONS only - every data-changing request
//              (POST/PUT/PATCH/DELETE: add, edit, delete, approve, pay, release...)
//              is rejected with 403, whatever module it belongs to.
//  * API_RULES map an API path prefix to the modules allowed to use it.
//              `modules` = full access to that prefix; `read` = extra modules that
//              may only GET it (shared look-ups such as /companies).
//              The longest matching prefix wins, so a narrow rule can override a
//              broad one (e.g. /purchases/payments -> Adjustments only).

const ROLES = Object.freeze({
  STORES: 'STORES',
  ACCOUNTANT: 'ACCOUNTANT',
  QB: 'QB',
  FINANCE_USER: 'FINANCE_USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN'
});

const MODULES = Object.freeze({
  MANAGEMENT: 'management',
  RAW_MATERIAL: 'rawMaterial',
  FINISHED_GOODS: 'finishedGoods',
  EXPENSES: 'expenses',
  FINANCE: 'finance',
  CUTLERY: 'cutlery',
  FG_PRODUCTION: 'fgProduction',
  ADJUSTMENTS: 'adjustments',
  VAT: 'vat',
  ANALYST: 'analyst',
  SETTINGS: 'settings',
  // Not a sidebar module of its own: Employee Management sits inside
  // Management but holds HR data, so it is limited to Admin / Super Admin.
  EMPLOYEES: 'employees',
  // Collection (POS collections -> ledgers). Its own module so access is
  // exactly: Accountant, Admin, Super Admin (full) and QB (view only).
  COLLECTION: 'collection'
});

const M = MODULES;

// Everything except Analyst.
const ADMIN_MODULES = [
  M.MANAGEMENT, M.RAW_MATERIAL, M.FINISHED_GOODS, M.EXPENSES, M.FINANCE,
  M.CUTLERY, M.FG_PRODUCTION, M.ADJUSTMENTS, M.VAT, M.SETTINGS, M.EMPLOYEES, M.COLLECTION
];

// NOTE: `settings` is the "Settings / Admin" group, which only contains Change
// Password. It is granted to roles that should see the settings navigation.
const ROLE_MODULES = Object.freeze({
  [ROLES.STORES]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FG_PRODUCTION, M.SETTINGS],
  [ROLES.ACCOUNTANT]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FINANCE, M.EXPENSES, M.FG_PRODUCTION, M.VAT, M.SETTINGS, M.COLLECTION],
  [ROLES.QB]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FG_PRODUCTION, M.FINANCE, M.EXPENSES, M.VAT, M.SETTINGS, M.COLLECTION],
  [ROLES.FINANCE_USER]: [M.MANAGEMENT, M.EXPENSES],
  [ROLES.ADMIN]: ADMIN_MODULES,
  [ROLES.SUPER_ADMIN]: [...ADMIN_MODULES, M.ANALYST]
});

const VIEW_ONLY_ROLES = Object.freeze([ROLES.QB]);

const VIEW_ONLY_MESSAGE =
  'You have view-only access. You do not have permission to edit or delete this information.';
const NO_ACCESS_MESSAGE = 'You do not have permission to access this module';

// users.role values (and aliases) -> canonical role
const ROLE_ALIASES = Object.freeze({
  'super admin': ROLES.SUPER_ADMIN,
  'superadmin': ROLES.SUPER_ADMIN,
  'super_admin': ROLES.SUPER_ADMIN,
  'admin': ROLES.ADMIN,
  'accountant': ROLES.ACCOUNTANT,
  'finance': ROLES.FINANCE_USER,
  'store keeper': ROLES.STORES,
  'storekeeper': ROLES.STORES,
  'stores': ROLES.STORES,
  'qb': ROLES.QB,
  'view only': ROLES.QB,
  'viewonly': ROLES.QB,
  'view_only': ROLES.QB
});

// Roles that exist in the users.role enum but have no navigation/privilege
// definition (Staff, Manager, User) resolve to null and get NO module access.
const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ||
    (Object.values(ROLES).includes(role.trim().toUpperCase()) ? role.trim().toUpperCase() : null);
};

const getRoleModules = (role) => ROLE_MODULES[normalizeRole(role)] || [];
const hasModule = (role, moduleName) => getRoleModules(role).includes(moduleName);
const isViewOnlyRole = (role) => VIEW_ONLY_ROLES.includes(normalizeRole(role));
const canWrite = (role) => !!normalizeRole(role) && !isViewOnlyRole(role);

// ---------------------------------------------------------------------------
// API access rules. Paths are relative to /api.
// '*' = any authenticated user with a recognised role.
// ---------------------------------------------------------------------------
const ANY = '*';

const API_RULES = [
  // General dashboard data is available to signed-in users other than Finance.
  // Finance uses the separate, permission-scoped overview below.
  { prefix: '/dashboard', modules: [ANY], denyRoles: [ROLES.FINANCE_USER] },
  { prefix: '/dashboard/finance-overview', modules: [], read: [M.EXPENSES] },
  { prefix: '/stats', modules: [ANY], denyRoles: [ROLES.FINANCE_USER] },

  // ---- Raw Materials --------------------------------------------------------
  { prefix: '/purchases', modules: [M.RAW_MATERIAL] },
  { prefix: '/purchases/companies', modules: [M.RAW_MATERIAL], read: [ANY] },
  { prefix: '/purchases/suppliers', modules: [M.RAW_MATERIAL], read: [M.VAT] },
  { prefix: '/purchases/previous-prices', modules: [M.RAW_MATERIAL], read: [M.FG_PRODUCTION, M.FINISHED_GOODS] },
  // Purchasing payment adjustments belong to the Adjustments module
  { prefix: '/purchases/payments', modules: [M.ADJUSTMENTS] },
  { prefix: '/purchases/payment-adjustments', modules: [M.ADJUSTMENTS] },
  { prefix: '/suppliers', modules: [M.RAW_MATERIAL], read: [M.ADJUSTMENTS, M.VAT] },
  { prefix: '/items', modules: [M.RAW_MATERIAL], read: [M.FINISHED_GOODS, M.FG_PRODUCTION, M.ADJUSTMENTS, M.VAT] },
  { prefix: '/item-types', modules: [M.RAW_MATERIAL], read: [M.VAT, M.FINISHED_GOODS] },
  { prefix: '/departments', modules: [M.RAW_MATERIAL], read: [ANY] },
  { prefix: '/opening-balance', modules: [M.RAW_MATERIAL] },
  { prefix: '/issuances', modules: [M.RAW_MATERIAL] },
  { prefix: '/wastages', modules: [M.RAW_MATERIAL], read: [M.VAT] },
  { prefix: '/returns', modules: [M.RAW_MATERIAL] },
  { prefix: '/orders', modules: [M.RAW_MATERIAL] },
  { prefix: '/purchase-returns', modules: [M.RAW_MATERIAL] },
  { prefix: '/purchase-returns/reports', modules: [M.VAT] },
  { prefix: '/department-usage-report', modules: [M.RAW_MATERIAL] },
  { prefix: '/reports', modules: [M.RAW_MATERIAL], read: [M.VAT] },
  { prefix: '/reports/expenses-report', modules: [M.EXPENSES] },
  { prefix: '/reports/expense-summary', modules: [M.EXPENSES] },
  { prefix: '/reports/bakery-stock', modules: [M.FINISHED_GOODS] },

  // ---- Shared master data ---------------------------------------------------
  { prefix: '/companies', modules: [M.RAW_MATERIAL, M.EXPENSES, M.FINANCE], read: [ANY] },
  { prefix: '/payment-methods', modules: [M.EXPENSES, M.FINANCE], read: [ANY] },
  { prefix: '/employees', modules: [M.EMPLOYEES] },

  // ---- Expenses -------------------------------------------------------------
  { prefix: '/expenses', modules: [M.EXPENSES] },
  { prefix: '/expenses/banks', modules: [M.EXPENSES, M.FINANCE] },
  { prefix: '/new-expenses', modules: [M.EXPENSES], read: [M.ADJUSTMENTS] },
  { prefix: '/cash-expenses', modules: [M.EXPENSES] },
  { prefix: '/hidden-expenses', modules: [M.EXPENSES] },
  { prefix: '/payees', modules: [M.EXPENSES, M.FINANCE] },
  { prefix: '/expense-types', modules: [M.EXPENSES, M.FINANCE] },
  { prefix: '/sub-expense-types', modules: [M.EXPENSES, M.FINANCE] },
  { prefix: '/bank-charges-types', modules: [M.EXPENSES, M.FINANCE] },

  // ---- Finance --------------------------------------------------------------
  { prefix: '/finance', modules: [M.FINANCE] },
  // Raw-material payment forms show bank / cash balances
  { prefix: '/finance/bank/accounts', modules: [M.FINANCE], read: [M.RAW_MATERIAL, M.EXPENSES, M.ADJUSTMENTS] },
  { prefix: '/finance/cash/balance', modules: [M.FINANCE], read: [M.RAW_MATERIAL, M.EXPENSES, M.ADJUSTMENTS] },
  { prefix: '/staff-loans', modules: [M.FINANCE] },
  { prefix: '/receive-types', modules: [M.FINANCE] },
  { prefix: '/other-ledgers', modules: [M.FINANCE] },
  // Management -> Credit Card Rate (card commission per Branch / Department).
  { prefix: '/credit-card-rates', modules: [M.FINANCE] },
  // Collection: Accountant / Admin / Super Admin full, QB read-only (view-only rule
  // refuses every POST), every other role 403.
  { prefix: '/collections', modules: [M.COLLECTION] },
  // POS / Restaurant connection status + one-time Connect: also the Finance role
  // (its own RAVON accounts), which has no Collection module. The controller
  // narrows it to Finance / Accountant / Admin / Super Admin (+ QB read).
  { prefix: '/collections/integrations', modules: [ANY], denyRoles: [ROLES.STORES] },
  { prefix: '/incomes', modules: [M.FINANCE, M.ANALYST] },

  // ---- Finished Goods -------------------------------------------------------
  { prefix: '/finished-goods-items', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-opening-balance', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-transfers', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-wastages', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-reports', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-ingredients', modules: [M.FINISHED_GOODS] },
  { prefix: '/finished-goods-sales', modules: [M.FINISHED_GOODS] },
  { prefix: '/productions', modules: [M.FINISHED_GOODS] },
  { prefix: '/transfer-destinations', modules: [M.FINISHED_GOODS] },
  { prefix: '/cost-calculations', modules: [M.FINISHED_GOODS] },

  // ---- Cutlery --------------------------------------------------------------
  { prefix: '/cutlery-locations', modules: [M.CUTLERY] },
  { prefix: '/cutlery-assets', modules: [M.CUTLERY] },
  { prefix: '/cutlery-transfers', modules: [M.CUTLERY] },
  { prefix: '/cutlery-purchases', modules: [M.CUTLERY] },
  { prefix: '/cutlery-damages', modules: [M.CUTLERY] },
  { prefix: '/cutlery-reports', modules: [M.CUTLERY] },

  // ---- FG Production --------------------------------------------------------
  { prefix: '/fg-production', modules: [M.FG_PRODUCTION] },

  // ---- Adjustments ----------------------------------------------------------
  { prefix: '/adjustments', modules: [M.ADJUSTMENTS] },
  { prefix: '/inhand', modules: [M.ADJUSTMENTS] },

  // ---- Analyst (Super Admin only) ------------------------------------------
  { prefix: '/analyst', modules: [M.ANALYST] }
];

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// '/api/purchases/12?x=1' or '/purchases/12/' -> '/purchases/12'
const toApiPath = (url = '') => {
  let path = String(url).split('?')[0].split('#')[0];
  if (path === '/api' || path.startsWith('/api/')) path = path.slice(4);
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return path.startsWith('/') ? path : `/${path}`;
};

// Longest prefix, matched on path-segment boundaries ('/items' does not match '/items-x').
const resolveApiRule = (url) => {
  const path = toApiPath(url);
  let best = null;
  for (const rule of API_RULES) {
    const hit = path === rule.prefix || path.startsWith(`${rule.prefix}/`);
    if (hit && (!best || rule.prefix.length > best.prefix.length)) best = rule;
  }
  return best;
};

/**
 * Decide whether `role` may call `method` on `url`.
 * @returns {{allowed: boolean, reason?: 'unknown-role'|'no-rule'|'module'|'view-only'}}
 */
const evaluateApiAccess = (role, method, url) => {
  const canonical = normalizeRole(role);
  if (!canonical) return { allowed: false, reason: 'unknown-role' };

  const rule = resolveApiRule(url);
  if (!rule) return { allowed: false, reason: 'no-rule' };

  const isRead = READ_METHODS.includes(String(method || 'GET').toUpperCase());
  if ((rule.denyRoles || []).includes(canonical)) {
    return { allowed: false, reason: 'module' };
  }
  const granted = isRead ? [...rule.modules, ...(rule.read || [])] : rule.modules;
  const roleModules = ROLE_MODULES[canonical];

  const moduleOk = granted.includes(ANY) || granted.some((m) => roleModules.includes(m));
  if (!moduleOk) return { allowed: false, reason: 'module' };

  if (!isRead && VIEW_ONLY_ROLES.includes(canonical)) {
    return { allowed: false, reason: 'view-only' };
  }
  return { allowed: true };
};

module.exports = {
  ROLES,
  MODULES,
  ROLE_MODULES,
  VIEW_ONLY_ROLES,
  API_RULES,
  ANY,
  READ_METHODS,
  VIEW_ONLY_MESSAGE,
  NO_ACCESS_MESSAGE,
  normalizeRole,
  getRoleModules,
  hasModule,
  isViewOnlyRole,
  canWrite,
  toApiPath,
  resolveApiRule,
  evaluateApiAccess
};
