// server/middleware/requireRoles.js
//
// Allows ONLY the listed roles to access a route (the inverse of
// restrictRoles.js, which blocks specific roles and leaves everyone else
// untouched). Use this when a module should be locked down to a short,
// explicit list rather than "everyone except X" - the Finance module is
// the first case of this: only Admin and Accountant should see it, and
// every other role (including ones added later) is denied by default.
//
// Must run after `authenticate`, since it reads req.user.role from the
// decoded JWT.
//
// Usage:
//   router.use(authenticate, requireRoles('Admin', 'Accountant'));

const normalizeRole = (role) => role === 'Stores' ? 'Store Keeper' : role;

const requireRoles = (...allowedRoles) => (req, res, next) => {
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
  if (!normalizedAllowedRoles.includes(normalizeRole(req.user?.role))) {
    return res.status(403).json({ error: 'You do not have permission to access this module' });
  }
  next();
};

module.exports = requireRoles;