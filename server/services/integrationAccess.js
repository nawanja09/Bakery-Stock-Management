// server/services/integrationAccess.js
//
// What a BSMS user may see of the RAVON POS (Cafe) and RAVON Restaurant data,
// decided by THAT user's own privileges in those systems
// (integrationAuthService.getUserAccess -> /api/login, /api/me `abilities`):
//
//   ability                          BSMS feature
//   collection.shifts                Collection - Shift collections
//   collection.credit_payments       Collection - Credit payments
//   collection.employee_deductions   Collection - Employee deductions
//   items.view   (POS only)          FG Production - FG item list (and choosing an FG item)
//
// It is applied ON TOP of the BSMS role rules (config/rolePermissions.js): a
// page needs both the BSMS module and the ability. Being signed in grants
// nothing by itself. POS rows are additionally limited to the user's POS
// branches when their POS account is branch-restricted (branch_ids).
//
// Everything here is server side; the browser only receives the resulting
// booleans / lists (getAccessSummary) to hide what it may not use.
const integrationAuth = require('./integrationAuthService');
const { SYSTEMS, SOURCES } = require('./collectionMapper');

const { ABILITIES } = integrationAuth;
const SOURCE_ABILITY = Object.freeze({
  [SOURCES.SHIFT]: ABILITIES.SHIFTS,
  [SOURCES.CREDIT_PAYMENT]: ABILITIES.CREDIT_PAYMENTS,
  [SOURCES.EMPLOYEE_DEDUCTION]: ABILITIES.EMPLOYEE_DEDUCTIONS
});
const PROVIDER_OF = Object.freeze({ [SYSTEMS.POS]: 'pos', [SYSTEMS.RESTAURANT]: 'restaurant' });

const DENIED_CODE = 'INTEGRATION_ACCESS_DENIED';

class IntegrationAccessError extends Error {
  constructor(message, access = null) {
    super(message);
    this.name = 'IntegrationAccessError';
    this.status = 403;
    this.code = DENIED_CODE;
    this.access = access;
  }
}

/**
 * The user's access, validated against both systems:
 *   { systems: { pos, restaurant },              getUserAccess() of each
 *     collection: { POS: { sources, branchIds }, RESTAURANT: { sources, branchIds } },
 *     canCollection, canFgItems }
 * Never throws (fails closed: no session / no abilities = nothing).
 */
const getAccess = async (userId) => {
  const [pos, restaurant] = await Promise.all([
    integrationAuth.getUserAccess('pos', { userId }),
    integrationAuth.getUserAccess('restaurant', { userId })
  ]);
  const systems = { pos, restaurant };
  const collection = {};
  for (const system of Object.values(SYSTEMS)) {
    const access = systems[PROVIDER_OF[system]];
    collection[system] = {
      sources: Object.values(SOURCES).filter((source) => access.abilities.includes(SOURCE_ABILITY[source])),
      branchIds: system === SYSTEMS.POS ? access.branchIds : null
    };
  }
  return {
    systems,
    collection,
    canCollection: Object.values(collection).some((c) => c.sources.length > 0),
    canFgItems: pos.abilities.includes(ABILITIES.ITEMS)
  };
};

/**
 * { POS: [sources], RESTAURANT: [sources] } for collectionSyncService - only
 * for systems where the user is connected. A system left out is still tried,
 * so its sync result reports WHY (not connected / session expired) instead of
 * silently skipping it; without a session of the user nothing is read there.
 */
const allowedSources = (access) => Object.fromEntries(
  Object.entries(access.collection)
    .filter(([system]) => access.systems[PROVIDER_OF[system]].state === 'connected')
    .map(([system, c]) => [system, [...c.sources]])
);

const allowsSource = (access, system, sourceType) =>
  Boolean(access.collection[system]?.sources.includes(sourceType));

/**
 * SQL condition (alias `c` = collections) matching only the rows the user may
 * see; '1 = 0' when none. Branch-restricted POS users see POS rows of their
 * branches only - a deduction through the shift it is linked to.
 */
const collectionWhere = (access, alias = 'c') => {
  const parts = [];
  const params = [];
  for (const [system, { sources, branchIds }] of Object.entries(access.collection)) {
    if (!sources.length) continue;
    let clause = `(${alias}.source_system = ? AND ${alias}.source_type IN (?)`;
    params.push(system, sources);
    if (branchIds && branchIds.length) {
      const ids = branchIds.map(String);
      clause += ` AND (${alias}.pos_branch_id IN (?) OR (${alias}.source_type = '${SOURCES.EMPLOYEE_DEDUCTION}'`
        + ` AND ${alias}.linked_collection_id IN (SELECT lb.id FROM collections lb WHERE lb.pos_branch_id IN (?))))`;
      params.push(ids, ids);
    }
    parts.push(`${clause})`);
  }
  return parts.length ? { sql: `(${parts.join(' OR ')})`, params } : { sql: '1 = 0', params: [] };
};

const deniedMessage = (access, what) => {
  const reasons = Object.values(access.systems)
    .filter((s) => s.configured)
    .map((s) => (s.connected ? `${s.label}: your account has no permission for this` : `${s.label}: ${s.message}`));
  return `You do not have permission to access ${what}.${reasons.length ? ` ${reasons.join(' ')}` : ''}`;
};

/** Throws IntegrationAccessError (403) unless the user may see some collections. */
const assertCollectionAccess = (access) => {
  if (!access.canCollection) throw new IntegrationAccessError(deniedMessage(access, 'Collections'), access);
};

/** Throws IntegrationAccessError (403) unless the user may read the POS FG item list. */
const assertFgItemsAccess = (access) => {
  if (!access.canFgItems) throw new IntegrationAccessError(deniedMessage(access, 'the FG item list'), access);
};

/**
 * Safe summary for the browser (no tokens, no messages with secrets):
 * which pages / features to show and why something is unavailable.
 */
const getAccessSummary = (access) => ({
  collection: {
    allowed: access.canCollection,
    sources: Object.fromEntries(Object.entries(access.collection).map(([system, c]) => [system, c.sources]))
  },
  fgItems: { allowed: access.canFgItems },
  systems: Object.fromEntries(Object.entries(access.systems).map(([id, s]) => [id, {
    system: s.system,
    label: s.label,
    configured: s.configured,
    connected: s.connected,
    state: s.state,
    username: s.username || null,
    abilities: s.abilities,
    branchRestricted: Boolean(s.branchIds && s.branchIds.length),
    message: s.message || null,
    code: s.code || null
  }]))
});

module.exports = {
  SOURCE_ABILITY,
  DENIED_CODE,
  IntegrationAccessError,
  getAccess,
  allowedSources,
  allowsSource,
  collectionWhere,
  assertCollectionAccess,
  assertFgItemsAccess,
  getAccessSummary
};
