//server/controllers/authController.js

const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getRoleModules } = require('../config/rolePermissions');
const { warmUp: warmUpPos } = require('../services/posAuthService');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not defined. Authentication will fail.');
}

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

    const match = await bcrypt.compare(password, user.password);

    if (match) {
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

      // Make sure the backend's shared RAVON POS Finance session is valid (logs
      // in automatically with RAVON_POS_USERNAME / RAVON_POS_PASSWORD when it is
      // missing or expired). One cached token for everyone - not a per-user POS
      // session. Runs after the response and never affects the BSMS login.
      warmUpPos();
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
