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
3. Validate required startup environment variables.
4. Run DB bootstrap (`scripts/bootstrap-db.cjs`):
   - run tracked SQL migrations from `migrations/*.sql`
   - verify the required schema exists
   - seed the default business settings row if missing
   - seed the `MAIN` branch if missing
   - ensure the bootstrap admin user exists
5. Start API/server (`index.cjs`).

## Railway deployment (no manual SQL import required)

1. Push repo to GitHub.
2. In Railway, create a new project from the repo.
3. Add PostgreSQL in the same Railway project (or use external PostgreSQL).
4. Set required environment variables (below).
5. Deploy.

Railway config is already provided in `railway.json`. Railway only needs to run `npm run build` and `npm start`.

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

- `UNIQUEPOS_BOOTSTRAP_ADMIN`
  - Default: `1`
  - If `1`, ensures admin account exists and is active.
- `UNIQUEPOS_BOOTSTRAP_ADMIN_USERNAME`
  - Default: `admin`
- `UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL`
  - Default: `admin@uniquepos.com`
- `UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD`
  - Required in production
  - Default: `admin123` outside production only
- `UNIQUEPOS_BOOTSTRAP_ADMIN_ROTATE_PASSWORD`
  - Default: `0`
  - If `1`, startup also resets the existing bootstrap admin password.

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

- Migrations are tracked in `schema_migrations` and guarded by a PostgreSQL advisory lock.
- Fresh databases are initialized from `migrations/*.sql`.
- Existing databases only run unapplied migrations.
- Startup verifies the required schema before the server begins accepting traffic.
- Default records are seeded idempotently after migrations.

## Local run

```bash
npm install
cp .env.example .env
npm start
```

Run migrations only:

```bash
npm run db:migrate
```

Generate initial migration from the canonical SQL dump:

```bash
npm run db:generate-initial
```

Verify required POS tables exist in PostgreSQL:

```bash
npm run db:verify
```

Validate startup environment variables:

```bash
npm run startup:validate
```

Validate the committed runtime bundle:

```bash
npm run build
```

Health check:

```bash
curl "$APP_URL/api/healthz"
```

## Files relevant to deployment

- `app.js` - runtime entrypoint and pre-start bootstrap
- `index.cjs` - bundled API/server
- `scripts/bootstrap-db.cjs` - automated PostgreSQL initialization and admin bootstrap
- `scripts/run-migrations.cjs` - tracked SQL migration runner with advisory locking
- `database.sql` - legacy schema export retained for compatibility/reference
- `.env.example` - environment variable template
- `railway.json` - Railway build/deploy settings
- `Procfile` - process declaration fallback
