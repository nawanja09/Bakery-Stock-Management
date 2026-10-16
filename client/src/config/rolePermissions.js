// client/src/config/rolePermissions.js
//
// SINGLE SOURCE OF TRUTH for role-based access in the React app: sidebar
// entries, direct-URL protection and view-only behaviour all read from here.
//
// ROLES / MODULES / ROLE_MODULES / VIEW_ONLY_ROLES mirror
// server/config/rolePermissions.js (the API enforces the same table).
// CRA cannot import files outside src/, so the table is duplicated;
// server/tests/rolePermissions.test.js fails if the two drift apart.

export const ROLES = Object.freeze({
  STORES: 'STORES',
  ACCOUNTANT: 'ACCOUNTANT',
  QB: 'QB',
  FINANCE_USER: 'FINANCE_USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN'
});

export const MODULES = Object.freeze({
  MANAGEMENT: 'management',
  RAW_MATERIAL: 'rawMaterial',
  EXPENSES: 'expenses',
  FINANCE: 'finance',
  CUTLERY: 'cutlery',
  FG_PRODUCTION: 'fgProduction',
  ADJUSTMENTS: 'adjustments',
  VAT: 'vat',
  ANALYST: 'analyst',
  SETTINGS: 'settings',
  // Inside Management, but HR data - Admin / Super Admin only.
  EMPLOYEES: 'employees',
  // Collection: Accountant, Admin, Super Admin and QB (view only). Approve = Accountant only.
  COLLECTION: 'collection',
  // Audit Trail page: Admin / Super Admin only.
  AUDIT: 'audit'
});

const M = MODULES;

const ADMIN_MODULES = [
  M.MANAGEMENT, M.RAW_MATERIAL, M.EXPENSES, M.FINANCE,
  M.CUTLERY, M.FG_PRODUCTION, M.ADJUSTMENTS, M.VAT, M.SETTINGS, M.EMPLOYEES, M.COLLECTION, M.AUDIT
];

// `settings` = the "Settings / Admin" group (only holds Change Password).
// It is granted only to roles that should see that navigation group.
export const ROLE_MODULES = Object.freeze({
  [ROLES.STORES]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FG_PRODUCTION, M.SETTINGS],
  [ROLES.ACCOUNTANT]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FINANCE, M.EXPENSES, M.FG_PRODUCTION, M.VAT, M.SETTINGS, M.COLLECTION],
  [ROLES.QB]: [M.MANAGEMENT, M.RAW_MATERIAL, M.FG_PRODUCTION, M.FINANCE, M.EXPENSES, M.VAT, M.SETTINGS, M.COLLECTION],
  // Finance pays expenses, so it must not also approve cash coming in (Collection).
  [ROLES.FINANCE_USER]: [M.MANAGEMENT, M.EXPENSES],
  [ROLES.ADMIN]: ADMIN_MODULES,
  [ROLES.SUPER_ADMIN]: [...ADMIN_MODULES, M.ANALYST]
});

export const VIEW_ONLY_ROLES = Object.freeze([ROLES.QB]);

export const VIEW_ONLY_MESSAGE =
  'You have view-only access. You do not have permission to edit or delete this information.';

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

// users.role value ('Store Keeper', 'View Only', ...) -> canonical role, or null
// for roles that have no navigation/privilege definition (Staff, Manager, User).
export const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ||
    (Object.values(ROLES).includes(role.trim().toUpperCase()) ? role.trim().toUpperCase() : null);
};

export const getRoleModules = (role) => ROLE_MODULES[normalizeRole(role)] || [];
export const hasModule = (role, moduleName) => getRoleModules(role).includes(moduleName);
export const isViewOnlyRole = (role) => VIEW_ONLY_ROLES.includes(normalizeRole(role));
export const canWrite = (role) => !!normalizeRole(role) && !isViewOnlyRole(role);
// Approving collections posts them to the ledgers: Accountant only (mirrors the
// /collections/approve writeRoles rule on the server). Reject / Restore = canWrite.
export const COLLECTION_APPROVER_ROLES = Object.freeze([ROLES.ACCOUNTANT]);
export const canApproveCollections = (role) => COLLECTION_APPROVER_ROLES.includes(normalizeRole(role));

// ---------------------------------------------------------------------------
// Reading the logged-in user's role from the existing auth data.
// The JWT issued at login is the authority (it is what the API checks); the
// stored `user` object is only a fallback. Both survive a page refresh.
// ---------------------------------------------------------------------------
const decodeJwtPayload = (token) => {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(window.atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
};

export const getRawAuthRole = () => {
  try {
    const token = localStorage.getItem('token');
    const fromToken = token ? decodeJwtPayload(token)?.role : null;
    if (fromToken) return fromToken;
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser).role || null : null;
  } catch (e) {
    return null;
  }
};

// Canonical role of the logged-in user (or null).
export const getAuthRole = () => normalizeRole(getRawAuthRole());

export const getAuthUsername = () => {
  try {
    const token = localStorage.getItem('token');
    const usernameFromToken = token ? decodeJwtPayload(token)?.username : null;
    if (usernameFromToken) return usernameFromToken;
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser).username || null : null;
  } catch (e) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Page (URL) rules. The longest matching prefix wins, matched on path-segment
// boundaries. A rule grants access when the role holds ALL of `all` and ANY
// of `any` ('*' = every signed-in user). `write: true` marks entry/edit/payment
// pages that view-only roles (QB) may not open.
// ---------------------------------------------------------------------------
const rule = (path, { all = [], any = [], write = false } = {}) => ({ path, all, any, write });

const RM = [M.RAW_MATERIAL];
const FIN_MASTER = [M.EXPENSES, M.FINANCE]; // finance-side master data

export const ROUTE_RULES = [
  rule('/dashboard', { any: ['*'] }),
  rule('/management', { all: [M.MANAGEMENT] }),
  rule('/admin/password', { any: [M.SETTINGS] }),
  rule('/admin/employees', { all: [M.MANAGEMENT, M.EMPLOYEES] }),

  // ---- Management (sidebar group; each page also needs the domain module) ----
  rule('/items', { all: [M.MANAGEMENT], any: RM }),
  rule('/item-types', { all: [M.MANAGEMENT], any: RM }),
  rule('/suppliers', { all: [M.MANAGEMENT], any: RM }),
  rule('/departments', { all: [M.MANAGEMENT], any: RM }),
  rule('/companies', { all: [M.MANAGEMENT], any: [M.RAW_MATERIAL, M.EXPENSES, M.FINANCE] }),
  rule('/adjustments/payment-methods', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/expenses/bank-details', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/expense-types-management', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/sub-expense-types-management', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/expense-payees-management', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/bank-charges-type-management', { all: [M.MANAGEMENT], any: FIN_MASTER }),
  rule('/finance/receive-types', { all: [M.MANAGEMENT], any: [M.FINANCE] }),
  rule('/other-ledgers-management', { all: [M.MANAGEMENT], any: [M.FINANCE] }),
  rule('/credit-card-rate-management', { all: [M.MANAGEMENT], any: [M.FINANCE] }),
  rule('/items/add', { all: [M.MANAGEMENT], any: RM, write: true }),
  rule('/items/edit', { all: [M.MANAGEMENT], any: RM, write: true }),

  // ---- Raw Materials ----
  rule('/purchase', { all: RM }),
  rule('/purchase/new', { all: RM, write: true }),
  rule('/purchase/edit', { all: RM, write: true }),
  rule('/purchase/advance-payment', { all: RM, write: true }),
  rule('/purchase/record-payment', { all: RM, write: true }),
  rule('/purchase-returns', { all: RM }),
  rule('/purchase-returns/add', { all: RM, write: true }),
  rule('/issuance', { all: RM }),
  rule('/issuance/issue', { all: RM, write: true }),
  rule('/issuance/edit', { all: RM, write: true }),
  rule('/wastage', { all: RM }),
  rule('/wastage/add', { all: RM, write: true }),
  rule('/wastage/edit', { all: RM, write: true }),
  rule('/returns', { all: RM }),
  rule('/returns/add', { all: RM, write: true }),
  rule('/opening', { all: RM }),
  rule('/opening/add', { all: RM, write: true }),
  rule('/reports/stock', { all: RM }),
  rule('/reports/department', { all: RM }),
  rule('/reports/department-usage', { all: RM }),
  rule('/reports/department-return-item-wise', { all: RM }),
  rule('/reports/purchasing', { all: RM }),
  rule('/reports/purchase-report', { all: RM }),
  rule('/reports/wastage', { all: RM }),
  rule('/analysis', { all: RM }),

  // ---- Expenses ----
  rule('/expenses', { all: [M.EXPENSES] }),

  // ---- Finance ----
  rule('/finance', { all: [M.FINANCE] }),
  rule('/finance/cash-receive', { all: [M.FINANCE], write: true }),
  rule('/finance/bank-receive', { all: [M.FINANCE], write: true }),
  rule('/finance/transfer', { all: [M.FINANCE], write: true }),
  rule('/finance/bank-transfer', { all: [M.FINANCE], write: true }),

  // ---- Collection (POS collections -> ledgers; Finance roles) ----
  rule('/collection', { all: [M.COLLECTION] }),

  // ---- Cutlery / FG Production / Adjustments / VAT / Analyst ----
  rule('/cutlery', { all: [M.CUTLERY] }),
  rule('/fg-production', { all: [M.FG_PRODUCTION] }),
  rule('/adjustments', { all: [M.ADJUSTMENTS] }),
  rule('/reports/vat', { all: [M.VAT] }),
  rule('/reports/purchase-vat', { all: [M.VAT] }),
  rule('/analyst', { all: [M.ANALYST] }),

  // ---- Audit Trail (Admin / Super Admin) ----
  rule('/audit-trail', { all: [M.AUDIT] })
];

const cleanPath = (pathname = '') => {
  let path = String(pathname).split('?')[0].split('#')[0];
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return path.startsWith('/') ? path : `/${path}`;
};

export const resolveRouteRule = (pathname) => {
  const path = cleanPath(pathname);
  let best = null;
  ROUTE_RULES.forEach((r) => {
    const hit = path === r.path || path.startsWith(`${r.path}/`);
    if (hit && (!best || r.path.length > best.path.length)) best = r;
  });
  return best;
};

// Can `role` open this page (sidebar link, direct URL, dashboard shortcut)?
export const canAccessPath = (role, pathname) => {
  const canonical = normalizeRole(role);
  if (!canonical) return false;
  const found = resolveRouteRule(pathname);
  if (!found) return false; // default deny

  const modules = ROLE_MODULES[canonical];
  const allOk = found.all.every((m) => modules.includes(m));
  const anyOk = found.any.length === 0 || found.any.includes('*') || found.any.some((m) => modules.includes(m));
  if (!allOk || !anyOk) return false;
  if (found.write && VIEW_ONLY_ROLES.includes(canonical)) return false;
  return true;
};

// Is at least one of these pages available? (used to hide empty dropdown groups)
export const canAccessAnyPath = (role, paths = []) => paths.some((p) => canAccessPath(role, p));

// First page in `candidates` the role may open (module landing page).
export const firstAccessiblePath = (role, candidates = []) =>
  candidates.find((p) => canAccessPath(role, p)) || null;

// Sidebar module key -> permission module + the page opened when it is clicked.
export const NAV_MODULES = Object.freeze({
  management: {
    module: M.MANAGEMENT,
    landing: [
      '/items', '/item-types', '/suppliers', '/departments', '/companies',
      '/adjustments/payment-methods', '/expenses/bank-details', '/expense-types-management',
      '/sub-expense-types-management', '/expense-payees-management',
      '/bank-charges-type-management', '/finance/receive-types', '/other-ledgers-management', '/credit-card-rate-management',
      '/admin/employees'
    ]
  },
  raw: {
    module: M.RAW_MATERIAL,
    landing: ['/purchase/new', '/purchase/orders', '/purchase/history', '/reports/stock']
  },
  expenses: { module: M.EXPENSES, landing: ['/expenses/petty-cash'] },
  finance: { module: M.FINANCE, landing: ['/finance/cash'] },
  cutlery: { module: M.CUTLERY, landing: ['/cutlery/locations'] },
  'fg-production': { module: M.FG_PRODUCTION, landing: ['/fg-production/recipes'] },
  adjustments: { module: M.ADJUSTMENTS, landing: ['/adjustments/stores-balance'] },
  vat: { module: M.VAT, landing: ['/reports/vat'] },
  analyst: { module: M.ANALYST, landing: ['/analyst/income'] },
  admin: { module: M.SETTINGS, landing: [] }
});

// Sidebar group visible = role holds the module AND at least one child page is open to it.
export const canSeeNavModule = (role, navKey) => {
  const nav = NAV_MODULES[navKey];
  if (!nav || !hasModule(role, nav.module)) return false;
  if (nav.landing.length === 0) return true;
  return canAccessAnyPath(role, nav.landing);
};

export const getModuleLanding = (role, navKey) =>
  firstAccessiblePath(role, (NAV_MODULES[navKey] || {}).landing || []);
