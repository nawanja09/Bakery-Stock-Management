//server/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken')
const { loginUser,changePassword } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const { getJwtSecret, JWT_SIGN_OPTIONS, JWT_VERIFY_OPTIONS } = require('../config/secrets');

router.post('/login', loginUser);
router.post('/change-password', authenticate,changePassword);

router.post('/refresh-token', (req, res) => {
  const token = req.body.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, getJwtSecret(), JWT_VERIFY_OPTIONS);
    const newToken = jwt.sign(
      { userId: decoded.userId, username: decoded.username, role: decoded.role },
      getJwtSecret(),
      JWT_SIGN_OPTIONS
    );
    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
