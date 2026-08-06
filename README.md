# UniquePOS Deployment Guide (Railway + PostgreSQL)

This repository is a standalone Node.js POS backend+frontend bundle.

## Stack

- Runtime: Node.js 22+
- Server: Express (bundled in `index.cjs`)
- Database: PostgreSQL via `DATABASE_URL`
- ORM/query layer: Drizzle ORM (bundled)
- Frontend: static files from `public/`

## Startup process

- Entrypoint: `app.js`
- Start command: `npm start`
- Port binding: `process.env.PORT` (required by Railway)
- Health check endpoint: `/api/healthz`

Startup order:

1. Load `.env` (if present).
2. Apply runtime defaults (storage paths, `PORT` fallback).
3. Run DB bootstrap (`scripts/bootstrap-db.cjs`):
   - auto-initialize schema from `database.sql` if required tables are missing
   - ensure admin user exists
   - ensure `roles`, `permissions`, and `role_permissions` tables exist
4. Start API/server (`index.cjs`).

## Railway deployment (no manual SQL import required)

1. Push repo to GitHub.
2. In Railway, create a new project from the repo.
3. Add PostgreSQL in the same Railway project (or use external PostgreSQL).
4. Set required environment variables (below).
5. Deploy.

Railway config is already provided in `railway.json`.

## Environment variables

### Required

- `DATABASE_URL`
  - PostgreSQL connection string.
- `SESSION_SECRET`
  - Secret used to sign auth tokens.

### Recommended

- `APP_URL`
  - Public app URL (used in generated links and notification emails).
- `NODE_ENV`
  - `production` (Railway usually sets this automatically).

### Optional bootstrap controls

- `UNIQUEPOS_AUTO_DB_INIT`
  - Default: `1`
  - If `1`, app initializes database from `database.sql` when required tables are missing.
- `UNIQUEPOS_BOOTSTRAP_ADMIN`
  - Default: `1`
  - If `1`, ensures admin account exists and is active.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_USERNAME`
  - Default: `admin`
- `UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL`
  - Default: `admin@uniquepos.com`
- `UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD`
  - Default: `admin123`

### Optional runtime settings

- `SMTP_PASSWORD`
- `SERVE_CLIENT_DIR` (default `./public` if folder exists)
- `BACKUP_DIR` (default `./backups`)
- `LOCAL_STORAGE_DIR` (default `./storage`)

## Admin login

Default bootstrap credentials:

- Username: `admin`
- Email: `admin@uniquepos.com`
- Password: `admin123`

Login endpoint accepts username or email in the `email` field for compatibility.

## Database initialization behavior

- If core tables are already present, bootstrap is skipped.
- If core tables are missing, app restores schema from `database.sql` automatically.
- The following core tables are validated before server starts:
  - `users`, `products`, `customers`, `suppliers`, `sales`, `quotations`, `invoices`, `purchases`, `product_stock`, `expenses`, `business_settings`, `branches`, `login_history`, `audit_log`, `data_migrations`
- Additional access-control tables are ensured:
  - `roles`, `permissions`, `role_permissions`

## Local run

```bash
npm install
cp .env.example .env
npm start
```

Health check:

```bash
curl http://localhost:3000/api/healthz
```

## Files relevant to deployment

- `app.js` - runtime entrypoint and pre-start bootstrap
- `index.cjs` - bundled API/server
- `scripts/bootstrap-db.cjs` - automated PostgreSQL initialization and admin bootstrap
- `database.sql` - canonical schema/data restore source
- `.env.example` - environment variable template
- `railway.json` - Railway build/deploy settings
- `Procfile` - process declaration fallback
