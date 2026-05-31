// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../model/UserSchema');

const authenticateUser = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  (async () => {
    try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Keep super admin token flow as-is.
    if (decoded?.id === 'super-admin') {
      req.user = decoded;
      return next();
    }

    // Rehydrate permissions/access from DB so token doesn't become stale after admin edits user.
    const dbUser = await User.findById(decoded.id).select(
      'role name username isActive permissions siteAccess warehouseAccess wholesellerAccess farmBlockAccess isFarmUser isSalesUser'
    );
    if (!dbUser) return res.status(401).json({ message: 'Invalid token' });
    if (dbUser.isActive === false) return res.status(403).json({ message: 'User account is disabled' });

    req.user = {
      ...decoded,
      id: String(dbUser._id),
      role: dbUser.role,
      name: dbUser.name,
      username: dbUser.username,
      permissions: dbUser.permissions || {},
      siteAccess: (dbUser.siteAccess || []).map((s) => String(s)),
      warehouseAccess: (dbUser.warehouseAccess || []).map((w) => String(w)),
      wholesellerAccess: (dbUser.wholesellerAccess || []).map((w) => String(w)),
      farmBlockAccess: (dbUser.farmBlockAccess || []).map((b) => String(b)),
      isFarmUser: !!dbUser.isFarmUser,
      isSalesUser: !!dbUser.isSalesUser,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
  })();
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
    if (pagePerms[action]) return next();

    // Backward compatibility for older farm permission key.
    const fallbackMap = {
      farmDashboard: 'farmLogs',
      farmTreeLogs: 'farmLogs',
      farmMaintenanceTasks: 'farmLogs',
      farmBlockDetails: 'farmBlocks',
      farmBlockLogs: 'farmBlocks',
    };
    const fallbackKey = fallbackMap[pageKey];
    if (fallbackKey && perms[fallbackKey]?.[action]) {
      return next();
    }

    if (!pagePerms[action]) {
      return res.status(403).json({ message: 'Access denied for this page/action' });
    }
    return next();
  };
};

const authorizeAnyPage = (pageKeys = [], action = 'view') => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const perms = req.user.permissions || {};
    const fallbackMap = {
      farmDashboard: 'farmLogs',
      farmTreeLogs: 'farmLogs',
      farmMaintenanceTasks: 'farmLogs',
      farmBlockDetails: 'farmBlocks',
      farmBlockLogs: 'farmBlocks',
    };
    const allowed = pageKeys.some((key) => {
      if (perms[key]?.[action]) return true;
      const fallbackKey = fallbackMap[key];
      return fallbackKey ? !!perms[fallbackKey]?.[action] : false;
    });
    if (!allowed) {
      return res.status(403).json({ message: 'Access denied for this page/action' });
    }
    return next();
  };
};

module.exports = { authenticateUser, authorizeAdmin, authorizePage, authorizeAnyPage };
