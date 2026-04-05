/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Financial records CRUD and filtering
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// All transaction routes require authentication
router.use(authenticate);

// ── Shared validation rules ───────────────────────────────────────────────────
const txBodyRules = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be a positive number.'),
  body('type')
    .isIn(['income', 'expense'])
    .withMessage('Type must be income or expense.'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required.'),
  body('date')
    .isISO8601()
    .toDate()
    .withMessage('Date must be a valid ISO 8601 date (YYYY-MM-DD).'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters.'),
];

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: List transactions (with optional filtering and pagination)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [income, expense] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, example: '2026-01-01' }
 *       - in: query
 *         name: to
 *         schema: { type: string, example: '2026-12-31' }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of transactions
 *       401:
 *         description: Not authenticated
 */
// ── GET /api/transactions ── viewer, analyst, admin ───────────────────────────
router.get('/', authorize('viewer', 'analyst', 'admin'), [
  query('type').optional().isIn(['income', 'expense']).withMessage('type must be income or expense.'),
  query('category').optional().trim().notEmpty(),
  query('from').optional().isISO8601().withMessage('from must be a valid date.'),
  query('to').optional().isISO8601().withMessage('to must be a valid date.'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.'),
  query('search').optional().trim(),
], validate, (req, res) => {
  const { type, category, from, to, search, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const pageLimit = Math.min(100, Number(limit));

  let where = 'WHERE t.is_deleted = 0';
  const params = [];

  if (type)     { where += ' AND t.type = ?';              params.push(type);     }
  if (category) { where += ' AND t.category LIKE ?';       params.push(`%${category}%`); }
  if (from)     { where += ' AND t.date >= ?';             params.push(from);     }
  if (to)       { where += ' AND t.date <= ?';             params.push(to);       }
  if (search)   { where += ' AND (t.notes LIKE ? OR t.category LIKE ?)';
                  params.push(`%${search}%`, `%${search}%`); }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM transactions t ${where}`).get(...params).cnt;
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.type, t.category, t.date, t.notes,
           t.created_at, t.updated_at,
           u.id AS creator_id, u.name AS creator_name
    FROM transactions t
    JOIN users u ON u.id = t.created_by
    ${where}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageLimit, offset);

  res.json({
    status: 'success',
    data: {
      transactions: rows,
      pagination: { total, page: Number(page), limit: pageLimit, pages: Math.ceil(total / pageLimit) },
    },
  });
});

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get a single transaction by ID
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Transaction found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       404:
 *         description: Transaction not found
 */
// ── GET /api/transactions/:id ── viewer, analyst, admin ───────────────────────
router.get('/:id', authorize('viewer', 'analyst', 'admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid transaction ID.'),
], validate, (req, res) => {
  const tx = db.prepare(`
    SELECT t.id, t.amount, t.type, t.category, t.date, t.notes,
           t.created_at, t.updated_at,
           u.id AS creator_id, u.name AS creator_name
    FROM transactions t
    JOIN users u ON u.id = t.created_by
    WHERE t.id = ? AND t.is_deleted = 0
  `).get(req.params.id);

  if (!tx) return res.status(404).json({ status: 'error', message: 'Transaction not found.' });
  res.json({ status: 'success', data: { transaction: tx } });
});

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create a new transaction (admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, type, category, date]
 *             properties:
 *               amount:   { type: number,  example: 500.00 }
 *               type:     { type: string,  enum: [income, expense] }
 *               category: { type: string,  example: Salary }
 *               date:     { type: string,  example: '2026-04-01' }
 *               notes:    { type: string,  example: Monthly salary }
 *     responses:
 *       201:
 *         description: Transaction created
 *       403:
 *         description: Forbidden — admin only
 */
// ── POST /api/transactions ── admin only ──────────────────────────────────────
router.post('/', authorize('admin'), txBodyRules, validate, (req, res) => {
  const { amount, type, category, date, notes = null } = req.body;
  const isoDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];

  const result = db.prepare(`
    INSERT INTO transactions (amount, type, category, date, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(amount, type, category.trim(), isoDate, notes, req.user.id);

  const tx = db.prepare(`
    SELECT t.id, t.amount, t.type, t.category, t.date, t.notes, t.created_at,
           u.id AS creator_id, u.name AS creator_name
    FROM transactions t JOIN users u ON u.id = t.created_by
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ status: 'success', data: { transaction: tx } });
});

/**
 * @swagger
 * /api/transactions/{id}:
 *   put:
 *     summary: Update a transaction (admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:   { type: number }
 *               type:     { type: string, enum: [income, expense] }
 *               category: { type: string }
 *               date:     { type: string }
 *               notes:    { type: string }
 *     responses:
 *       200:
 *         description: Transaction updated
 *       404:
 *         description: Transaction not found
 */
// ── PUT /api/transactions/:id ── admin only ───────────────────────────────────
const updateRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid transaction ID.'),
  body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('type').optional().isIn(['income', 'expense']).withMessage('Type must be income or expense.'),
  body('category').optional().trim().notEmpty().withMessage('Category cannot be blank.'),
  body('date').optional().isISO8601().toDate().withMessage('Date must be valid ISO 8601.'),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }),
];

router.put('/:id', authorize('admin'), updateRules, validate, (req, res) => {
  const { id } = req.params;
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND is_deleted = 0').get(id);
  if (!tx) return res.status(404).json({ status: 'error', message: 'Transaction not found.' });

  const allowed = ['amount', 'type', 'category', 'date', 'notes'];
  const setClauses = [];
  const params = [];

  for (const field of allowed) {
    if (!(field in req.body)) continue;
    if (field === 'date') {
      const d = req.body.date;
      setClauses.push('date = ?');
      params.push(typeof d === 'string' ? d : d.toISOString().split('T')[0]);
    } else if (field === 'category') {
      setClauses.push('category = ?');
      params.push(req.body.category.trim());
    } else {
      setClauses.push(`${field} = ?`);
      params.push(req.body[field] ?? null);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ status: 'error', message: 'No fields provided to update.' });
  }

  setClauses.push(`updated_at = datetime('now')`);
  params.push(id);

  db.prepare(`UPDATE transactions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT t.id, t.amount, t.type, t.category, t.date, t.notes,
           t.created_at, t.updated_at, u.id AS creator_id, u.name AS creator_name
    FROM transactions t JOIN users u ON u.id = t.created_by
    WHERE t.id = ?
  `).get(id);

  res.json({ status: 'success', data: { transaction: updated } });
});

/**
 * @swagger
 * /api/transactions/{id}:
 *   delete:
 *     summary: Soft-delete a transaction (admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Transaction deleted (soft)
 *       404:
 *         description: Transaction not found
 */
// ── DELETE /api/transactions/:id ── admin only (soft delete) ──────────────────
router.delete('/:id', authorize('admin'), [
  param('id').isInt({ min: 1 }).withMessage('Invalid transaction ID.'),
], validate, (req, res) => {
  const tx = db.prepare('SELECT id FROM transactions WHERE id = ? AND is_deleted = 0').get(req.params.id);
  if (!tx) return res.status(404).json({ status: 'error', message: 'Transaction not found.' });

  db.prepare(`
    UPDATE transactions SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?
  `).run(req.params.id);

  res.json({ status: 'success', message: 'Transaction deleted (soft).' });
});

module.exports = router;
