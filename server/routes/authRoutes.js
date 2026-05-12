//server/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken')
const { loginUser,changePassword, registerUser } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

router.post('/login', loginUser);
router.post('/change-password', authenticate,changePassword);
router.post('/register', registerUser);

router.post('/refresh-token', (req, res) => {
  const token = req.body.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;