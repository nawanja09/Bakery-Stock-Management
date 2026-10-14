//server/controllers/authController.js

const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getRoleModules } = require('../config/rolePermissions');
const integrationAuth = require('../services/integrationAuthService');
const { getJwtSecret, JWT_SIGN_OPTIONS } = require('../config/secrets');
const { forget: forgetSessionUser } = require('../services/sessionUser');

const BCRYPT_COST = 12;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes

// Compared against when the username does not exist, so an unknown username
// takes as long as a wrong password (no username discovery by timing).
let dummyHash = null;
const getDummyHash = async () => {
  if (!dummyHash) dummyHash = await bcrypt.hash('not-a-real-password', 10);
  return dummyHash;
};

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];
    const match = await bcrypt.compare(password, user ? user.password : await getDummyHash());

    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Checked only after the password, so the response never reveals whether
    // an account exists or is inactive to someone who does not know its password.
    if (Number(user.status) !== 1) {
      return res.status(403).json({ error: 'This account is inactive' });
    }

    const permissions = ['dashboard', ...getRoleModules(user.role)];
    // tv = users.token_version: middleware/authenticate.js refuses the token
    // once it changes (password change / forced sign-out).
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, permissions, tv: Number(user.token_version) || 0 },
      getJwtSecret(),
      JWT_SIGN_OPTIONS
    );

    // ONLY when RAVON_LOGIN_RELAY=on (off by default - production uses the
    // server key, see integrationAuthService.loginRelayEnabled):
    // RAVON POS + RAVON Restaurant: the SAME typed username / password are
    // also tried on both systems' /api/login - in parallel, once each, with
    // the timeout / rate-limit / cool-down protection of
    // integrationAuthService - for the roles with a page that reads them
    // (Collection / FG Production). When a system accepts them, only its
    // token and the user's privileges there are kept (encrypted, server
    // side), for THIS user's own requests only; the password is used for
    // these calls only and then discarded. The outcomes
    // are independent of each other and never affect this BSMS login: it is
    // already decided above and the response is not delayed (a Collection
    // sync waits for these logins to finish). A refused system can be
    // connected later from the Collection page.
    if (integrationAuth.loginRelayEnabled() && integrationAuth.isIntegrationRole(user.role)) {
      integrationAuth.loginAll({ userId: user.id, role: user.role, username, password });
    }

    res.json({
      message: 'Login successful!',
      token,
      permissions,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `The new password must be at least ${PASSWORD_MIN} characters` });
  }
  if (Buffer.byteLength(newPassword, 'utf8') > PASSWORD_MAX_BYTES) {
    return res.status(400).json({ error: `The new password is too long (at most ${PASSWORD_MAX_BYTES} bytes)` });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'The new password must be different from the current password' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      // 400, not 401: a 401 makes the client sign the user out (client/src/api.js).
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (newPassword.trim().toLowerCase() === String(user.username || '').trim().toLowerCase()) {
      return res.status(400).json({ error: 'The new password must not be your username' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);
    // Bumping token_version signs out every other session of this user (e.g. a
    // stolen token). This session continues with the new token returned below.
    await pool.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hashedPassword, userId]
    );
    forgetSessionUser(userId);
    const [[fresh]] = await pool.query('SELECT token_version FROM users WHERE id = ?', [userId]);
    const permissions = ['dashboard', ...getRoleModules(user.role)];
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, permissions, tv: Number(fresh?.token_version) || 0 },
      getJwtSecret(),
      JWT_SIGN_OPTIONS
    );

    res.json({ message: 'Password changed successfully', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { loginUser, changePassword };
