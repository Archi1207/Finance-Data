/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management (admin only)
 */

const express = require('express');
const { body, param } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const SALT_ROUNDS = 10;

// All user management routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [viewer, analyst, admin] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of users
 *       403:
 *         description: Forbidden — admin only
 */
// ── GET /api/users ── Admin only ──────────────────────────────────────────────
router.get('/', authorize('admin'), (req, res) => {
  const { status, role, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
  const pageLimit = Math.min(100, Number(limit));

  let where = 'WHERE 1=1';
  const params = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (role)   { where += ' AND role = ?';   params.push(role);   }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM users ${where}`).get(...params).cnt;
  const users = db.prepare(
    `SELECT id, name, email, role, status, created_at, updated_at FROM users ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageLimit, offset);

  res.json({
    status: 'success',
    data: { users, pagination: { total, page: Number(page), limit: pageLimit } },
  });
});

// ── GET /api/users/:id ── Admin only ──────────────────────────────────────────
router.get('/:id', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
], validate, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = ?'
  ).get(req.params.id);

  if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
  res.json({ status: 'success', data: { user } });
});

// ── PUT /api/users/:id ── Admin only ─ Update name / email ───────────────────
router.put('/:id', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be blank.'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required.'),
], validate, (req, res) => {
  const { name, email } = req.body;
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

  if (email && email !== user.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
    if (conflict) return res.status(409).json({ status: 'error', message: 'Email already in use.' });
  }

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name || null, email || null, id);

  const updated = db.prepare(
    'SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);
  res.json({ status: 'success', data: { user: updated } });
});

// ── PATCH /api/users/:id/role ── Admin only ───────────────────────────────────
router.patch('/:id/role', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
  body('role').isIn(['viewer', 'analyst', 'admin']).withMessage('Role must be viewer, analyst, or admin.'),
], validate, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

  db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(role, id);
  const updated = db.prepare(
    'SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?'
  ).get(id);

  res.json({ status: 'success', data: { user: updated } });
});

// ── PATCH /api/users/:id/status ── Admin only ─────────────────────────────────
router.patch('/:id/status', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive.'),
], validate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Prevent admin from deactivating themselves
  if (Number(id) === req.user.id && status === 'inactive') {
    return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

  db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  const updated = db.prepare(
    'SELECT id, name, email, role, status, updated_at FROM users WHERE id = ?'
  ).get(id);

  res.json({ status: 'success', data: { user: updated } });
});

// ── DELETE /api/users/:id ── Admin only ──────────────────────────────────────
router.delete('/:id', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID.'),
], validate, (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.user.id) {
    return res.status(400).json({ status: 'error', message: 'You cannot delete your own account.' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

  // Check if user has transactions — prevent orphan records
  const txCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM transactions WHERE created_by = ? AND is_deleted = 0'
  ).get(id).cnt;
  if (txCount > 0) {
    return res.status(409).json({
      status: 'error',
      message: `Cannot delete user with ${txCount} active transaction(s). Deactivate instead.`,
    });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ status: 'success', message: 'User deleted.' });
});

module.exports = router;
