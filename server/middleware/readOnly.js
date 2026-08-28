const jwt = require('jsonwebtoken');

// View Only users may read data but cannot mutate API resources.
const readOnly = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const user = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (user.role === 'View Only') {
      return res.status(403).json({ error: 'You have view-only access. You do not have permission to edit or delete this information.' });
    }
  } catch (error) {
    // Authentication middleware remains responsible for invalid tokens.
  }

  next();
};

module.exports = readOnly;