// server/middleware/restrictRoles.js
//
// Blocks a set of roles from a route. Must run after `authenticate`, since it
// reads req.user.role from the decoded JWT.
//
// This is intentionally narrow: it does not add allow-lists for every module,
// it only blocks the specific roles you pass in. That keeps existing access
// for every other role exactly as it was before this middleware existed.
//
// Usage:
//   router.use(authenticate, restrictRoles('Store Keeper'));

const normalizeRole = (role) => role === 'Stores' ? 'Store Keeper' : role;

const restrictRoles = (...blockedRoles) => (req, res, next) => {
  const normalizedBlockedRoles = blockedRoles.map(normalizeRole);
  if (normalizedBlockedRoles.includes(normalizeRole(req.user?.role))) {
    return res.status(403).json({ error: 'You do not have permission to access this module' });
  }
  next();
};

module.exports = restrictRoles;
