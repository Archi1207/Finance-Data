/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication — register, login, current user
 */

const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { signToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: Alice Admin }
 *               email:    { type: string, example: alice@example.com }
 *               password: { type: string, example: Secret123 }
 *               role:     { type: string, enum: [viewer, analyst, admin], example: viewer }
 *     responses:
 *       201:
 *         description: User created
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: admin@example.com }
 *               password: { type: string, example: Admin123 }
 *     responses:
 *       200:
 *         description: Login successful, returns user and token
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: No token provided
 */
// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ status: 'success', data: { user: req.user } });
});

module.exports = router;
