const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { signToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// ── POST /api/auth/register ───────────────────────────────────────────────────
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('role')
    .optional()
    .isIn(['viewer', 'analyst', 'admin'])
    .withMessage('Role must be viewer, analyst, or admin.'),
];

router.post('/register', registerRules, validate, (req, res) => {
  const { name, email, password, role = 'viewer' } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ status: 'error', message: 'Email already in use.' });
  }

  const hashed = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, hashed, role);

  const user = db.prepare(
    'SELECT id, name, email, role, status, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  const token = signToken(user.id);
  return res.status(201).json({ status: 'success', data: { user, token } });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

router.post('/login', loginRules, validate, (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
  }
  if (user.status === 'inactive') {
    return res.status(403).json({ status: 'error', message: 'Account is inactive.' });
  }

  const token = signToken(user.id);
  // eslint-disable-next-line no-unused-vars
  const { password: _pwd, ...safeUser } = user;
  return res.json({ status: 'success', data: { user: safeUser, token } });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ status: 'success', data: { user: req.user } });
});

module.exports = router;
