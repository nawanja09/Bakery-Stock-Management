const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Make sure you have JWT_SECRET in your .env
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.warn('JWT Expired:', err.expiredAt);
      return res.status(401).json({ error: 'Token expired', expired: true });
    }
    console.error('JWT Error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authenticate;
