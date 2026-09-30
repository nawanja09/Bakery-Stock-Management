// server/middleware/authorizeApi.js
//
// Central role-permission gate for the API. Must run after `authenticate`
// (it reads req.user.role from the decoded JWT). All rules live in
// config/rolePermissions.js - do not hard-code role names in routes.
//
//  * unknown role / no module access  -> 403 "You do not have permission..."
//  * view-only role (QB) mutating     -> 403 with the standard view-only message
//  * no rule defined for the path     -> 403 (default deny; a warning is logged
//                                        so the missing rule can be added)

const {
  evaluateApiAccess,
  canWrite,
  VIEW_ONLY_MESSAGE,
  NO_ACCESS_MESSAGE
} = require('../config/rolePermissions');

const authorizeApi = (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const result = evaluateApiAccess(req.user && req.user.role, req.method, req.originalUrl);
  if (result.allowed) return next();

  if (result.reason === 'view-only') {
    return res.status(403).json({ error: VIEW_ONLY_MESSAGE });
  }
  if (result.reason === 'no-rule') {
    console.warn(`[authorizeApi] No access rule for ${req.method} ${req.originalUrl} - denied. Add it to config/rolePermissions.js.`);
  }
  return res.status(403).json({ error: NO_ACCESS_MESSAGE });
};

// For endpoints that are write-only forms/lookups: view-only roles are refused
// even on GET (keeps the behaviour of the old financeWriteAccess guard).
const requireWriteCapability = (req, res, next) => {
  if (canWrite(req.user && req.user.role)) return next();
  return res.status(403).json({ error: VIEW_ONLY_MESSAGE });
};

module.exports = authorizeApi;
module.exports.requireWriteCapability = requireWriteCapability;
