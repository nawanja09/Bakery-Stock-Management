// server/middleware/authenticate.js
//
// Verifies the BSMS login token AND re-checks the user in the database on
// every request (services/sessionUser.js, cached briefly):
//   * signature / algorithm / expiry       -> 401 'Invalid token' / 'Token expired'
//   * user deleted or deactivated          -> 401 'Session is no longer valid'
//   * token_version changed (password change / forced sign-out),
//     or a token issued before token_version existed (no `tv` claim) -> 401
// req.user.role always comes from the DATABASE, never from the token, so a
// demoted user loses access immediately and a token cannot carry a stale role.
// Database unavailable -> 503 (fails closed, never falls back to the token).
const jwt = require('jsonwebtoken');
const { getJwtSecret, JWT_VERIFY_OPTIONS } = require('../config/secrets');

const SESSION_INVALID = { error: 'Session is no longer valid. Please log in again.', expired: true };

const createAuthenticate = ({ loadUser }) => async (req, res, next) => {
  // Already verified for this request (server.js gate, then a router's own gate).
  if (req.authenticatedUser) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice('Bearer '.length), getJwtSecret(), JWT_VERIFY_OPTIONS);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', expired: true });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  let user;
  try {
    user = await loadUser(decoded.userId);
  } catch (error) {
    console.error('authenticate: user lookup failed:', error.message);
    return res.status(503).json({ error: 'Authentication is temporarily unavailable. Try again shortly.' });
  }
  if (!user || !Number.isInteger(decoded.tv) || decoded.tv !== Number(user.token_version)) {
    return res.status(401).json(SESSION_INVALID);
  }

  req.user = { ...decoded, userId: user.id, username: user.username, role: user.role };
  req.authenticatedUser = user;
  return next();
};

const authenticate = createAuthenticate({
  loadUser: (userId) => require('../services/sessionUser').loadActiveUser(userId)
});

module.exports = authenticate;
module.exports.createAuthenticate = createAuthenticate;
