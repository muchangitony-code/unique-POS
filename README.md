# UniquePOS — Standalone Deployment

A self-contained build of UniquePOS (ERP + POS) for ordinary Node.js hosting
such as cPanel/Truehost. The Node app serves both the API and the web frontend.

## Requirements

- Node.js 22 (set in the cPanel "Setup Node.js App" tool).
- A PostgreSQL database. Your host offers MySQL only, so use a free/managed
  PostgreSQL such as Neon (neon.tech), Supabase or Railway and point
  `DATABASE_URL` at it.
- `psql` command-line tool to load the database (from your PC is fine).
- For in-app backup/restore to work on the server, `pg_dump`/`psql` must be on
  the server PATH. If they are not available, use your managed provider's own
  backups instead — the rest of the app works without them.

## 1. Create the database

Create an empty PostgreSQL database with your managed provider and copy its
connection string.

Load the included dump (schema + starter data, including the admin login):

```bash
psql "YOUR_DATABASE_URL" -f database.sql
```

Default login: `admin@uniquepos.com` / `Test1234!` — change this password
immediately after first sign-in (Settings → Users).

## 2. Configure environment

Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`.
On cPanel you can instead set these as environment variables in the
"Setup Node.js App" screen.

**SSL note:** The app automatically enables SSL (`rejectUnauthorized: false`) for
any non-localhost database connection. If your provider's connection string already
includes `?sslmode=require` or similar, that takes precedence. Local connections
(`localhost` / `127.0.0.1`) do not use SSL.

## 3. Install & start

```bash
npm install --omit=dev
npm start
```

On cPanel: upload this folder, set the Application Root to it and the
Application Startup File to `app.js`, add the environment variables, then click
"Run NPM Install" followed by "Restart".

## Deploying on Railway

1. Push this repository to GitHub.
2. In Railway, create a new project → **Deploy from GitHub repo** → select this repo.
3. Add a **PostgreSQL** plugin (or use an external managed DB) and copy its `DATABASE_URL`.
4. Set the following environment variables in Railway → **Variables**:
   - `DATABASE_URL` — your PostgreSQL connection string (**required**)
   - `SESSION_SECRET` — a long random string (e.g. 32+ random characters) (**required**)
   - `NODE_ENV` — `production` (Railway sets this automatically; you can leave it unset)
5. Railway injects `PORT` automatically — do **not** set it manually.
6. Deploy. On startup, the app automatically attempts to restore `database.sql`
   if `business_settings` is missing and `psql` is available in PATH.
   You can disable this with `UNIQUEPOS_AUTO_DB_BOOTSTRAP=0`.
7. If you disable auto-bootstrap (or `psql` is unavailable), load schema manually:
   ```bash
   psql "$DATABASE_URL" -f database.sql
   ```
8. Railway will run `npm install --omit=dev` (via `railway.json`) and
   then `node app.js`.

> **Note on the web frontend:** If the `public/` directory is not present in the
> repository, the server starts in API-only mode — all `/api/*` routes work normally
> and the health check at `/api/healthz` passes. To serve the frontend, add your
> built `public/` folder to the repository root before deploying.

The app's health endpoint is `/api/healthz`.

## Layout

- `app.js` — startup file (loads .env, boots the server).
- `index.cjs` — bundled API + app logic (single file, no build step needed).
- `public/` — built web frontend, served by the Node app (optional; API works without it).
- `database.sql` — database dump to restore.
- `backups/` — local database backups created by the in-app backup feature.
- `storage/` — uploaded branding images (logo/stamp/signature).

## Notes

- All API routes are served under `/api`; the frontend is served from `/`.
- File uploads and backups are stored on local disk (see folders above). Make
  sure those folders are writable and included in your own off-site backups.
