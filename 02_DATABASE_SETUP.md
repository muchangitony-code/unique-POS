# UniquePOS — PostgreSQL Database Setup & Migration

UniquePOS uses **PostgreSQL**. Truehost cPanel provides MySQL only, so host the
database with a managed PostgreSQL provider and point `DATABASE_URL` at it.
Recommended free/managed options:

- **Neon** — https://neon.tech (serverless Postgres, generous free tier)
- **Supabase** — https://supabase.com
- **Railway** — https://railway.app

All of them give you a connection string like:
```
postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

---

## Two ways to initialise a fresh database

### Option A (recommended) — restore the bundled dump

The deployment package includes `db/database.sql`, a full `pg_dump` containing
**schema + starter data** (including the default administrator account). This is
the fastest path.

From your PC (or any machine with `psql`):
```bash
psql "postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" -f db/database.sql
```

Or paste the file contents into your provider's SQL editor (Neon/Supabase both
have one).

After this, the default login is `admin@uniquepos.com` / `Test1234!`
(change it immediately — see `04_ADMIN_CREDENTIALS.md`).

### Option B — start empty and let the app build the schema

The application runs **idempotent startup migrations** on every boot. On a
completely empty database the app will create the required tables automatically
the first time it starts, **except** it will not seed a default admin. If you go
this route you must create the first admin manually (see
`04_ADMIN_CREDENTIALS.md` → "Creating the first admin on an empty database").

> For a predictable, supported install, prefer **Option A**.

---

## Complete fresh-installation SQL script

Below is the canonical creation script. The authoritative, always-current
version is the bundled `db/database.sql` (generated from the live schema).
This listing documents the full object set so you can review or recreate it by
hand. Table names use `snake_case` in the `public` schema.

### Core tables (26)

| Table | Purpose |
|---|---|
| `users` | Staff accounts, roles, password hashes, 2FA, lockout state |
| `branches` | Physical branches/stores (multi-branch support) |
| `business_settings` | Company info, branding, SMTP, payment & security settings |
| `products` | Product catalogue (name, SKU, barcode, pricing, cost) |
| `product_stock` | Per-branch stock quantity for each product |
| `categories` | Product categories |
| `brands` | Product brands |
| `suppliers` | Supplier records |
| `customers` | Customer records |
| `sales` | POS sale headers (totals, payment, branch, cashier) |
| `sale_items` | Line items for each sale |
| `stock_movements` | Immutable ledger of every stock change |
| `stock_transfers` | Cross-branch transfer requests (hold/approve/reject) |
| `purchases` | Purchase order headers |
| `purchase_items` | Purchase order line items |
| `expenses` | Business expenses |
| `quotations` | Quotation headers (QTN-) |
| `quotation_items` | Quotation line items |
| `invoices` | Invoice headers (INV-) |
| `invoice_items` | Invoice line items |
| `invoice_payments` | Payments recorded against invoices |
| `document_sequences` | Per-year running numbers for QTN-/INV- etc. |
| `audit_log` | Full audit trail of mutations (actor, entity, before/after) |
| `login_history` | Login attempts and outcomes (security) |
| `admin_notifications` | In-app security/backup notifications (bell icon) |
| `data_migrations` | Tracks which one-time startup migrations have run |

> To produce a **schema-only** script (no data) from an existing database:
> ```bash
> pg_dump --schema-only --no-owner --no-privileges \
>   "postgres://USER:PASSWORD@HOST:5432/DBNAME" > schema-only.sql
> ```
> To produce a **fresh dump** (schema + data) equivalent to the bundled one:
> ```bash
> pg_dump --format=plain --clean --if-exists --no-owner --no-privileges \
>   "postgres://USER:PASSWORD@HOST:5432/DBNAME" > db/database.sql
> ```

---

## Migrations (how schema upgrades work)

UniquePOS does **not** require a separate migration CLI on the host. On every
boot the server runs `runStartupMigrations()`, which:

1. Ensures the bookkeeping table `data_migrations` exists.
2. Creates any missing infrastructure tables (`audit_log`, `login_history`,
   `admin_notifications`, `document_sequences`, `branches`, `product_stock`,
   `stock_transfers`, …) using `CREATE TABLE IF NOT EXISTS`.
3. Applies additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` changes to
   evolving tables (e.g. `business_settings`).
4. Records each one-time migration in `data_migrations` so it never re-runs.

Because every step is **idempotent**, restarting the app is always safe and
upgrading to a newer build usually needs **no manual database work**.

> **Note:** startup migrations create the *supporting* tables and additive
> columns. For a brand-new install, the recommended path is still Option A
> (restore `db/database.sql`), which guarantees the complete schema plus the
> seed admin in one command.

---

## SSL / connection notes

- Most managed providers require SSL. Append `?sslmode=require` to
  `DATABASE_URL` (Neon/Supabase do this by default).
- Use the **pooled** connection string if your provider offers one (Neon calls
  it the "pooler" endpoint) — cPanel/Passenger may spin the app up and down.
- Keep the database in a region close to your Truehost server to reduce latency.

---

## Verifying the database

After loading, connect and check:
```sql
\dt                       -- should list ~26 tables
SELECT email, role FROM users;   -- should show the admin (Option A)
SELECT COUNT(*) FROM business_settings;  -- 1 row expected
```

If tables are missing, re-run the script and check for errors in the psql
output (use `-v ON_ERROR_STOP=on` to stop on the first error).
