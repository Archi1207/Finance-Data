const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

/**
 * Verifies the Bearer token and attaches req.user = { id, name, email, role, status }.
 */
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'No token provided.' });
  }

  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token.' });
  }

  const user = db.prepare(
    'SELECT id, name, email, role, status FROM users WHERE id = ?'
  ).get(payload.id);

  if (!user) {
    return res.status(401).json({ status: 'error', message: 'User no longer exists.' });
  }
  if (user.status === 'inactive') {
    return res.status(403).json({ status: 'error', message: 'Account is inactive.' });
  }

  req.user = user;
  next();
};

/**
 * Factory: returns middleware that allows only the given roles.
 * Usage: authorize('admin') or authorize('admin', 'analyst')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      status: 'error',
      message: `Access denied. Required role(s): ${roles.join(', ')}.`,
    });
  }
  next();
};

/**
 * Issue a signed JWT containing the user id.
 */
const signToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

module.exports = { authenticate, authorize, signToken };
