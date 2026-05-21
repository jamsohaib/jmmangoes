// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authenticateUser = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const authorizeAdmin = (req, res, next) => {
 // console.log('user data : ',req.user)
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

const authorizePage = (pageKey, action = 'view') => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const perms = req.user.permissions || {};
    const pagePerms = perms[pageKey] || {};
    if (!pagePerms[action]) {
      return res.status(403).json({ message: 'Access denied for this page/action' });
    }
    return next();
  };
};

module.exports = { authenticateUser, authorizeAdmin, authorizePage };
