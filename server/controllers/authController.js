//server/controllers/authController.js

const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getRoleModules, normalizeRole, ROLES } = require('../config/rolePermissions');
const {
  warmUp: warmUpPos,
  authenticateUser: authenticatePosUser,
  startPosSession,
  PosAuthError,
  PosConfigError
} = require('../services/posAuthService');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not defined. Authentication will fail.');
}

// Every login is first checked against the Ravon POS (POST /api/login) with the
// typed username / password. Returns { ok: true, token, expiresAt } when the POS
// accepts it, otherwise { ok: false, status, error } (status 401 = the POS
// rejected the credentials). The password is never stored.
const checkWithPos = async (username, password) => {
  try {
    const { token, expiresAt } = await authenticatePosUser(username, password);
    return { ok: true, token, expiresAt };
  } catch (error) {
    if (error instanceof PosAuthError) return { ok: false, status: 401, error: 'Invalid credentials' };
    if (error instanceof PosConfigError) {
      console.error('Login: POS is not configured -', error.message);
      return { ok: false, status: 503, error: 'POS authentication is not configured on the server' };
    }
    console.error('Login: POS authentication failed -', error.message);
    if (error.status === 429) return { ok: false, status: 429, error: error.message };
    return { ok: false, status: 503, error: 'Could not reach the POS to verify your login. Please try again.' };
  }
};

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    if (Number(user.status) !== 1) {
      return res.status(403).json({ error: 'This account is inactive' });
    }

    // POS first. Finance users must be accepted by the POS (their POS account is
    // the all-branch one every POS call shares). Other users whose POS login is
    // refused or unavailable fall back to their Stock Management password and use
    // the shared POS session.
    const isFinance = normalizeRole(user.role) === ROLES.FINANCE_USER;
    const pos = await checkWithPos(username, password);
    if (isFinance && !pos.ok) return res.status(pos.status).json({ error: pos.error });
    const match = pos.ok || await bcrypt.compare(password, user.password);

    if (match) {
      if (pos.ok) {
        await startPosSession({ userId: user.id, posUsername: username, token: pos.token, expiresAt: pos.expiresAt, finance: isFinance });
      }
      const permissions = ['dashboard', ...getRoleModules(user.role)];
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role, permissions },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login successful!',
        token,
        permissions,
        user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions }
      });

      // Collection users: have the backend's fallback POS integration login ready
      // (one cached token for everyone - not a per-user POS session). Runs after
      // the response and never affects the Stock Management login.
      if (permissions.includes('collection')) warmUpPos();
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

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
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { loginUser, changePassword };
