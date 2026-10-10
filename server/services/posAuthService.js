// server/services/posAuthService.js
//
// Backward-compatible POS-only facade over integrationAuthService.js (provider
// 'pos'). Existing callers - ravonPosService (FG items), the Collection
// controller, scripts and tests - keep importing this module unchanged:
//   posGet(pathOrUrl, params?, { userId }?)  -> integrationAuthService.posGet('pos', ...)
//   getToken / invalidateToken / getAuthStatus / getIntegrationScope / warmUp
//
// There are NO POS credentials (username, password or static API key) in the
// server environment or the code any more. A POS token exists only
// while a Finance user's own login was accepted by RAVON POS (BSMS login or the
// Collection page "Connect" action); see integrationAuthService.js. Without one
// every POS call fails with code POS_NOT_CONNECTED - there is no background /
// unattended POS access.
const integration = require('./integrationAuthService');

const posGet = (pathOrUrl, params = null, options = {}) => integration.posGet('pos', pathOrUrl, params, options);
const getToken = (options = {}) => integration.getToken('pos', options);
const invalidateToken = (rejectedToken) => integration.invalidateToken('pos', rejectedToken || null);
const getAuthStatus = (options = {}) => integration.getAuthStatus('pos', options);
const getIntegrationScope = (options = {}) => integration.getIntegrationScope('pos', options);

module.exports = {
  posGet,
  getIntegrationScope,
  warmUp: integration.warmUp,
  getToken,
  invalidateToken,
  getAuthStatus,
  extractToken: integration.extractToken,
  extractExpiry: integration.extractExpiry,
  resetAuthState: integration.resetAuthState,
  POS_NOT_CONFIGURED: integration.POS_NOT_CONFIGURED,
  POS_NOT_CONNECTED: integration.POS_NOT_CONNECTED,
  POS_CREDENTIALS_INVALID: integration.POS_CREDENTIALS_INVALID,
  POS_AUTH_UNAVAILABLE: integration.POS_AUTH_UNAVAILABLE,
  PosConfigError: integration.PosConfigError,
  PosAuthError: integration.PosAuthError,
  PosUnavailableError: integration.PosUnavailableError,
  PosResponseError: integration.PosResponseError
};
