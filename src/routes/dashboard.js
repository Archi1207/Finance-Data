const express = require('express');
const { query } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// ── GET /api/dashboard/summary ── all roles ───────────────────────────────────
// Total income, total expenses, net balance, transaction count
router.get('/summary', authorize('viewer', 'analyst', 'admin'), (req, res) => {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE is_deleted = 0
  `).get();

  const net_balance = row.total_income - row.total_expenses;
  res.json({
    status: 'success',
    data: {
      total_income:      row.total_income,
      total_expenses:    row.total_expenses,
      net_balance,
      transaction_count: row.transaction_count,
    },
  });
});

// ── GET /api/dashboard/category-totals ── analyst, admin ─────────────────────
// Total amount grouped by category and type
router.get('/category-totals', authorize('analyst', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT category, type,
           SUM(amount)  AS total,
           COUNT(*)     AS count
    FROM transactions
    WHERE is_deleted = 0
    GROUP BY category, type
    ORDER BY total DESC
  `).all();

  res.json({ status: 'success', data: { categories: rows } });
});

// ── GET /api/dashboard/trends ── analyst, admin ───────────────────────────────
// Monthly income vs expense totals (with optional year filter)
router.get('/trends', authorize('analyst', 'admin'), [
  query('year')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('year must be a valid 4-digit year.'),
  query('period')
    .optional()
    .isIn(['monthly', 'weekly'])
    .withMessage('period must be monthly or weekly.'),
], validate, (req, res) => {
  const { year, period = 'monthly' } = req.query;

  let dateFormat, groupLabel;
  if (period === 'weekly') {
    dateFormat = `strftime('%Y-W%W', date)`;
    groupLabel = 'week';
  } else {
    dateFormat = `strftime('%Y-%m', date)`;
    groupLabel = 'month';
  }

  let where = 'WHERE is_deleted = 0';
  const params = [];
  if (year) {
    where += ` AND strftime('%Y', date) = ?`;
    params.push(String(year));
  }

  const rows = db.prepare(`
    SELECT
      ${dateFormat}                                                          AS period,
      COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0)  AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)  AS expenses,
      COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END),0) AS net
    FROM transactions
    ${where}
    GROUP BY ${dateFormat}
    ORDER BY period ASC
  `).all(...params);

  res.json({ status: 'success', data: { period: groupLabel, trends: rows } });
});

// ── GET /api/dashboard/recent ── all roles ────────────────────────────────────
// Most recent N transactions (default 10)
router.get('/recent', authorize('viewer', 'analyst', 'admin'), [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be 1–50.'),
], validate, (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 10);
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.type, t.category, t.date, t.notes, t.created_at,
           u.name AS creator_name
    FROM transactions t
    JOIN users u ON u.id = t.created_by
    WHERE t.is_deleted = 0
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ?
  `).all(limit);

  res.json({ status: 'success', data: { recent: rows } });
});

// ── GET /api/dashboard/top-categories ── analyst, admin ──────────────────────
// Top N spending categories
router.get('/top-categories', authorize('analyst', 'admin'), [
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('limit must be 1-20.'),
  query('type').optional().isIn(['income', 'expense']).withMessage('type must be income or expense.'),
], validate, (req, res) => {
  const limit = Math.min(20, Number(req.query.limit) || 5);
  const { type = 'expense' } = req.query;

  const rows = db.prepare(`
    SELECT category, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions
    WHERE is_deleted = 0 AND type = ?
    GROUP BY category
    ORDER BY total DESC
    LIMIT ?
  `).all(type, limit);

  res.json({ status: 'success', data: { type, top_categories: rows } });
});

module.exports = router;
