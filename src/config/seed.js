/**
 * Seed script — creates one user per role for local testing.
 * Run: node src/config/seed.js
 *
 * Default credentials
 *   admin@example.com   / Admin@123
 *   analyst@example.com / Analyst@123
 *   viewer@example.com  / Viewer@123
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

const SALT_ROUNDS = 10;

const seed = () => {
  const users = [
    { name: 'Alice Admin',   email: 'admin@example.com',   password: 'Admin@123',   role: 'admin'   },
    { name: 'Bob Analyst',   email: 'analyst@example.com', password: 'Analyst@123', role: 'analyst' },
    { name: 'Carol Viewer',  email: 'viewer@example.com',  password: 'Viewer@123',  role: 'viewer'  },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password, role)
    VALUES (@name, @email, @password, @role)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const hashed = bcrypt.hashSync(row.password, SALT_ROUNDS);
      insertUser.run({ ...row, password: hashed });
    }
  });

  insertMany(users);

  // Sample transactions
  const adminId = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com')?.id;
  if (!adminId) return;

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (amount, type, category, date, notes, created_by)
    VALUES (@amount, @type, @category, @date, @notes, @created_by)
  `);

  const sampleTx = db.transaction(() => {
    const records = [
      { amount: 5000,  type: 'income',  category: 'Salary',      date: '2026-01-15', notes: 'January salary',        created_by: adminId },
      { amount: 200,   type: 'expense', category: 'Utilities',   date: '2026-01-18', notes: 'Electricity bill',       created_by: adminId },
      { amount: 1500,  type: 'income',  category: 'Freelance',   date: '2026-02-05', notes: 'Website project',        created_by: adminId },
      { amount: 450,   type: 'expense', category: 'Food',        date: '2026-02-10', notes: 'Groceries',              created_by: adminId },
      { amount: 5000,  type: 'income',  category: 'Salary',      date: '2026-02-15', notes: 'February salary',        created_by: adminId },
      { amount: 800,   type: 'expense', category: 'Rent',        date: '2026-02-20', notes: 'Office rent',            created_by: adminId },
      { amount: 3000,  type: 'income',  category: 'Investment',  date: '2026-03-01', notes: 'Dividend payout',        created_by: adminId },
      { amount: 120,   type: 'expense', category: 'Transport',   date: '2026-03-05', notes: 'Fuel',                   created_by: adminId },
      { amount: 5000,  type: 'income',  category: 'Salary',      date: '2026-03-15', notes: 'March salary',           created_by: adminId },
      { amount: 950,   type: 'expense', category: 'Utilities',   date: '2026-03-22', notes: 'Internet + electricity', created_by: adminId },
    ];
    for (const r of records) insertTx.run(r);
  });

  sampleTx();

  console.log('✅  Seed completed.');
  console.log('   admin@example.com   / Admin@123');
  console.log('   analyst@example.com / Analyst@123');
  console.log('   viewer@example.com  / Viewer@123');
};

try {
  seed();
} catch (err) {
  console.error('Seed error:', err.message);
  process.exit(1);
}
