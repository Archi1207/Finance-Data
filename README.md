# Finance Data Processing and Access Control Backend

A RESTful backend for a finance dashboard system supporting user role management, financial record CRUD, and dashboard analytics — built with **Node.js + Express + SQLite**.

---

## Tech Stack

| Layer      | Choice                   | Reason |
|------------|--------------------------|--------|
| Runtime    | Node.js (v18+)           | Widely available, great ecosystem |
| Framework  | Express 4                | Minimal, well-understood, easy to audit |
| Database   | SQLite via better-sqlite3| Zero-configuration, file-based, synchronous API keeps code simple |
| Auth       | JWT (jsonwebtoken)       | Stateless, easy to test locally |
| Passwords  | bcryptjs                 | Industry-standard hashing |
| Validation | express-validator        | Declarative, chainable rules |
| Security   | helmet, cors, express-rate-limit | OWASP basics out of the box |

---

## Project Structure

```
backend zynn/
├── src/
│   ├── app.js                  # Express app + server entry point
│   ├── config/
│   │   ├── database.js         # SQLite connection + schema migration
│   │   └── seed.js             # Seed script (demo users + transactions)
│   ├── middleware/
│   │   ├── auth.js             # authenticate() + authorize() + signToken()
│   │   └── validate.js         # express-validator error handler
│   └── routes/
│       ├── auth.js             # /api/auth  — register, login, me
│       ├── users.js            # /api/users — CRUD + role/status management
│       ├── transactions.js     # /api/transactions — CRUD + filtering
│       └── dashboard.js        # /api/dashboard — summary analytics
├── data/                       # SQLite DB file (auto-created, git-ignored)
├── .env                        # Environment variables (git-ignored)
├── .env.example
├── package.json
└── README.md
```

---

## Quick Start

### 1. Prerequisites
- Node.js v18 or later
- npm v9 or later

### 2. Install dependencies
```bash
cd "backend zynn"
npm install
```

### 3. Configure environment
The `.env` file is already provided with safe defaults for local development.  
Change `JWT_SECRET` before any real deployment.

### 4. Seed the database (optional but recommended)
```bash
npm run seed
```
This creates three demo users and 10 sample transactions:

| Email                 | Password     | Role    |
|-----------------------|--------------|---------|
| admin@example.com     | Admin@123    | admin   |
| analyst@example.com   | Analyst@123  | analyst |
| viewer@example.com    | Viewer@123   | viewer  |

### 5. Start the server
```bash
npm start          # production
npm run dev        # auto-reload with nodemon
```

Server starts at **http://localhost:3000**

Health check: `GET /health`

---

## Role-Based Access Control

| Action                          | viewer | analyst | admin |
|---------------------------------|:------:|:-------:|:-----:|
| View transactions               | ✅     | ✅      | ✅    |
| View dashboard summary & recent | ✅     | ✅      | ✅    |
| View category totals & trends   | ❌     | ✅      | ✅    |
| Create / update / delete txns   | ❌     | ❌      | ✅    |
| Manage users (CRUD/role/status) | ❌     | ❌      | ✅    |

---

## API Reference

All endpoints live under `/api/`.  
Protected routes require an `Authorization: Bearer <token>` header.

---

### Auth

#### `POST /api/auth/register`
Create a new user account.

**Body**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Secret@1",
  "role": "viewer"
}
```
- `role` is optional, defaults to `viewer`.
- Password rules: min 6 chars, at least one uppercase letter, at least one digit.

**Response `201`**
```json
{
  "status": "success",
  "data": {
    "user": { "id": 4, "name": "Jane Doe", "email": "jane@example.com", "role": "viewer", "status": "active", "created_at": "..." },
    "token": "<jwt>"
  }
}
```

---

#### `POST /api/auth/login`
**Body**
```json
{ "email": "admin@example.com", "password": "Admin@123" }
```
**Response `200`** — same shape as register.

---

#### `GET /api/auth/me` 🔒
Returns the currently authenticated user profile.

---

### Users  *(admin only)*

#### `GET /api/users`
Query params: `status`, `role`, `page` (default 1), `limit` (default 20, max 100).

#### `GET /api/users/:id`

#### `PUT /api/users/:id`
Update `name` and/or `email`.

#### `PATCH /api/users/:id/role`
```json
{ "role": "analyst" }
```

#### `PATCH /api/users/:id/status`
```json
{ "status": "inactive" }
```

#### `DELETE /api/users/:id`
Hard delete. Blocked if the user has active transactions (use `PATCH /status` instead).

---

### Transactions

#### `GET /api/transactions` 🔒 *(viewer, analyst, admin)*
Filter params: `type`, `category`, `from` (ISO date), `to` (ISO date), `search`, `page`, `limit`.

**Example**
```
GET /api/transactions?type=expense&from=2026-01-01&to=2026-03-31&page=1&limit=10
```

#### `GET /api/transactions/:id` 🔒 *(viewer, analyst, admin)*

#### `POST /api/transactions` 🔒 *(admin only)*
```json
{
  "amount": 1500.00,
  "type": "income",
  "category": "Freelance",
  "date": "2026-04-01",
  "notes": "Website redesign project"
}
```

#### `PUT /api/transactions/:id` 🔒 *(admin only)*
All fields optional — only provided fields are updated.

#### `DELETE /api/transactions/:id` 🔒 *(admin only)*
Soft delete — record is marked `is_deleted = 1` and excluded from all queries.

---

### Dashboard

#### `GET /api/dashboard/summary` 🔒 *(all roles)*
Returns total income, total expenses, net balance, and transaction count.

**Response**
```json
{
  "status": "success",
  "data": {
    "total_income": 19500,
    "total_expenses": 2520,
    "net_balance": 16980,
    "transaction_count": 10
  }
}
```

#### `GET /api/dashboard/recent` 🔒 *(all roles)*
Query: `limit` (default 10, max 50). Returns the N most recent transactions.

#### `GET /api/dashboard/category-totals` 🔒 *(analyst, admin)*
Returns summed totals grouped by `(category, type)`.

#### `GET /api/dashboard/trends` 🔒 *(analyst, admin)*
Query: `year` (optional), `period` (`monthly` | `weekly`, default `monthly`).
Returns time-series of income, expenses, and net per period.

#### `GET /api/dashboard/top-categories` 🔒 *(analyst, admin)*
Query: `type` (`expense` | `income`, default `expense`), `limit` (default 5, max 20).
Returns top N categories by total amount.

---

## Error Responses

All errors follow:
```json
{ "status": "error", "message": "...", "errors": [...] }
```

| Status | Meaning |
|--------|---------|
| 400    | Bad request / business rule violation |
| 401    | Missing or invalid token |
| 403    | Authenticated but insufficient role |
| 404    | Resource not found |
| 409    | Conflict (duplicate email, etc.) |
| 422    | Validation failure (field-level errors included) |
| 429    | Rate limit exceeded |
| 500    | Internal server error |

---

## Assumptions & Design Notes

1. **Single admin bootstrapping** — The first admin is created via `npm run seed` or via `POST /api/auth/register` with `"role": "admin"`. In production you would restrict self-registration to `viewer` only.

2. **Soft deletes** — Transactions are never permanently removed; `is_deleted = 1` hides them from all endpoints. This preserves audit history.

3. **No user can delete themselves** — Safeguard to prevent accidental admin lockout.

4. **No user with active transactions can be hard-deleted** — Returns `409 Conflict`; deactivate instead.

5. **Password strength** — Minimum 6 chars, one uppercase, one digit. Configurable in `auth.js`.

6. **Rate limiting** — Auth endpoints: 20 req / 15 min. All other API routes: 200 req / 15 min.

7. **SQLite** — Chosen for zero-configuration local development. The database file lives in `/data/finance.db` and is git-ignored. Replacing `better-sqlite3` with `pg` (PostgreSQL) would require minimal changes to query syntax.

---

## Tradeoffs

- **Synchronous SQLite driver** — `better-sqlite3` is synchronous, which simplifies code dramatically and performs well for single-process servers. For high concurrency, switch to PostgreSQL with an async driver.
- **JWT without refresh tokens** — Keeps implementation simple. In production, add a refresh-token flow and a token blocklist.
- **No ORM** — Raw SQL keeps queries transparent and easy to audit; acceptable for a project of this size.
