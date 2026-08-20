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
- Health check endpoint: `/api/healthz`

Startup order:

1. Load `.env` (if present).
2. Apply runtime defaults (storage paths, `PORT` fallback).
3. Validate required startup environment variables.
4. Run DB bootstrap (`scripts/bootstrap-db.cjs`).
5. Start API/server (`index.cjs`).

## Railway deployment

1. Push repo to GitHub.
2. In Railway, create a project from the repo.
3. Add PostgreSQL in the same Railway project (or use external PostgreSQL).
4. Set required environment variables.
5. Deploy.

Railway config is already provided in `railway.json`.

## Environment variables

### Required

- `DATABASE_URL` — PostgreSQL connection string.
- `SESSION_SECRET` — deployment-specific random secret of at least 16 characters.

### Recommended

- `APP_URL` — public app URL.
- `NODE_ENV=production`.

### Bootstrap controls

- `UNIQUEPOS_BOOTSTRAP_ADMIN` — default `1`; set `0` to disable bootstrap account management.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_USERNAME` — production admin username.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL` — production admin email.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD` — **required in production** and must be a unique strong password.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_ROTATE_PASSWORD` — default `0`; set `1` only when deliberately rotating the bootstrap password.

The repository no longer documents a usable default production administrator password. Set the real credentials only in the deployment environment.

### Optional runtime settings

- `SMTP_PASSWORD`
- `SERVE_CLIENT_DIR` (default `./public` if folder exists)
- `BACKUP_DIR` (default `./backups`)
- `LOCAL_STORAGE_DIR` (default `./storage`)

## Database initialization

- Migrations are tracked in `schema_migrations` and guarded by a PostgreSQL advisory lock.
- Fresh databases are initialized from `migrations/*.sql`.
- Existing databases only run unapplied migrations.
- Startup verifies the required schema before accepting traffic.

Useful commands:

```bash
npm run db:migrate
npm run db:verify
npm run db:audit
npm run startup:validate
npm run build
```

## Clean-start document reset

The production reset utility is deliberately guarded because it is destructive.

### Remove only clearly identifiable test/demo quotations and invoices

```bash
RESET_SCOPE=test RESET_CONFIRM=DELETE_TEST_DOCUMENTS npm run db:reset-documents
```

### Remove all quotations and invoices for a deliberate clean start

This is destructive and should only be used when the database contains no real customer documents:

```bash
NODE_ENV=production ALLOW_PRODUCTION_RESET=YES RESET_SCOPE=all RESET_CONFIRM=DELETE_ALL_DOCUMENTS npm run db:reset-documents
```

The reset preserves master data such as products, customers, branches and users. PostgreSQL `CASCADE` removes dependent document rows such as invoice/quotation line items and payment records. Document sequences for invoices/quotations are reset so the first real documents can start cleanly.

**Always run `npm run db:audit` after the reset and before opening the POS for real sales.**

## Regression testing

Destructive regression tests create temporary records. Do not point them at a production database.

## PDF/document QA

```bash
npm run pdf:qa
```

## Health check

```bash
curl "$APP_URL/api/healthz"
```

## Files relevant to deployment

- `app.js` - runtime entrypoint and pre-start bootstrap
- `index.cjs` - bundled API/server
- `scripts/bootstrap-db.cjs` - automated PostgreSQL initialization and admin bootstrap
- `scripts/run-migrations.cjs` - tracked SQL migration runner with advisory locking
- `scripts/production-audit.cjs` - production database readiness audit
- `scripts/production-reset.cjs` - guarded clean-start document reset
- `database.sql` - legacy schema export retained for compatibility/reference
- `.env.example` - environment variable template
- `railway.json` - Railway deployment configuration
