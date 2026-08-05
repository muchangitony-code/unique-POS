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
psql "YOUR_DATABASE_URL" -f db/database.sql
```

Default login: `admin@uniquepos.com` / `Test1234!` — change this password
immediately after first sign-in (Settings → Users).

## 2. Configure environment

Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`.
On cPanel you can instead set these as environment variables in the
"Setup Node.js App" screen.

## 3. Install & start

```bash
npm install --omit=dev
npm start
```

On cPanel: upload this folder, set the Application Root to it and the
Application Startup File to `app.js`, add the environment variables, then click
"Run NPM Install" followed by "Restart".

## Layout

- `app.js` — startup file (loads .env, boots the server).
- `server/` — bundled API + app logic (single file, no build step needed).
- `public/` — built web frontend, served by the Node app.
- `db/database.sql` — database dump to restore.
- `backups/` — local database backups created by the in-app backup feature.
- `storage/` — uploaded branding images (logo/stamp/signature).

## Notes

- All API routes are served under `/api`; the frontend is served from `/`.
- File uploads and backups are stored on local disk (see folders above). Make
  sure those folders are writable and included in your own off-site backups.
