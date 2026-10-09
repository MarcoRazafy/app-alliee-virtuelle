const { verifyToken } = require('../utils/jwt.util');
const { AUTH_COOKIE, parseCookieHeader } = require('../utils/cookies');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = parseCookieHeader(req.headers.cookie)[AUTH_COOKIE] || bearer;

  if (!token) {
    return res.status(401).json({ error: "Jeton d'authentification manquant" });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
