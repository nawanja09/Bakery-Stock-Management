//server/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken')
const { loginUser, logoutUser, changePassword } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const { getRoleModules } = require('../config/rolePermissions');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../config/secrets');

router.post('/login', loginUser);
router.post('/logout', authenticate, logoutUser);
router.post('/change-password', authenticate,changePassword);

// A new token only for a user who is STILL active, with the role they have NOW
// (authenticate re-reads both from the database and refuses revoked tokens).
// The token must be sent in the Authorization header; a token in the body is
// no longer accepted.
router.post('/refresh-token', authenticate, (req, res) => {
  const { userId, username, role, sid } = req.user;
  const permissions = ['dashboard', ...getRoleModules(role)];
  // sid: the same sign-in session continues (Audit Trail groups by it).
  const token = jwt.sign(
    { userId, username, role, permissions, tv: Number(req.authenticatedUser.token_version) || 0, ...(sid ? { sid } : {}) },
    getJwtSecret(),
    JWT_SIGN_OPTIONS
  );
  res.json({ token, permissions });
});

module.exports = router;
