---
name: UniquePOS standalone deployment build
description: How the self-contained cPanel/Node deploy is produced without disturbing the Replit app (compile-time overlay + signed local uploads).
---

# UniquePOS standalone deployment

A `deploy/` folder + zip that runs on ordinary Node hosting (cPanel/Truehost) with plain `npm install`, no pnpm workspaces, no Replit infra. Covers **api-server + unique-pos (web)** only. Built by `artifacts/api-server/build-standalone.mjs` (`node artifacts/api-server/build-standalone.mjs`).

## Core idea: compile-time overlay, not runtime env switch
The build swaps three modules to local-disk variants **only in the standalone bundle**, via an esbuild `onResolve` plugin — the running Replit app never loads them:
- `lib/objectStorage` → `objectStorage.local.ts` (local disk instead of Replit Object Storage)
- `lib/backup` → `backup.local.ts` (pg_dump/psql to local `BACKUP_DIR`)
- `routes/storage` → `storage.local.ts`

**Why:** a full Postgres→MySQL port was too risky (43 pgTables, `.returning()`, `::` casts, pg_dump tooling), so the user chose managed remote Postgres (Neon/Supabase) and we keep the codebase intact. Local-disk overlay only affects object storage + backups.

**How to apply:** `.local.ts` siblings must keep the exact public API of the module they replace, including the `/objects/uploads/<id>` path contract, so DB/frontend/serving behave identically. `storage.local.ts` imports directly from `objectStorage.local` (so it typechecks in the normal Replit build too).

## Signed local uploads (security-critical)
Replit uses presigned GCS URLs. The local replacement exposes a **public** `PUT /api/storage/upload/:id` (frontend PUTs the logo bytes with no auth header). To stop anyone overwriting branding assets (the ids are observable via the public serve URL), the upload URL carries a short-lived **HMAC token** keyed by `SESSION_SECRET`: `?exp=<ms>&sig=HMAC(objectId.exp)`. Only the authed `request-url` call can mint a valid token; the PUT handler rejects bad/expired tokens (403). Mirrors presigned-URL intent without server-side state.

**Gotcha:** the public-path allowlist match is prefix-based, so the upload entry MUST be `"/api/storage/upload/"` **with trailing slash** — otherwise it also matches `/api/storage/uploads/request-url` and makes the authed mint endpoint public (breaking logo upload).

## Frontend serving
Single combined app: Express serves the built React SPA when `SERVE_CLIENT_DIR` is set (guarded, so Replit dev is untouched). Static+SPA fallback is placed BEFORE auth so assets/index load tokenless; `/api*` falls through to auth. Frontend built with `PORT=<dummy> BASE_PATH=/ NODE_ENV=production` (vite.config throws without PORT/BASE_PATH).

## DB delivery
Ship `db/database.sql` from `pg_dump --clean --if-exists --no-owner --no-privileges` of the dev DB (schema + starter data incl. admin login). Host restores with `psql`. Avoids needing drizzle-kit/tsx on the host. (`runStartupMigrations` only creates audit_log/data_migrations + ALTERs business_settings — it does NOT create the core schema.)

## Passenger compatibility: MUST be CommonJS (not ESM)
cPanel/Truehost Passenger loads the startup file with `require()`, not `import`. An ESM `app.js` (`"type":"module"` + top-level `await import()`) throws **`ERR_REQUIRE_ASYNC_MODULE`** on boot. So the standalone build is fully CJS:
- esbuild `format:"cjs"`, `outExtension {".js":".cjs"}` → `server/index.cjs` (pino transports also `.cjs`). `target:"node22"`.
- `package.json` has **no** `"type":"module"`; `app.js` is CJS (`require`, `__dirname`, NO top-level await) and ends with `require("./server/index.cjs")`.
- Server entry (`src/index.ts`) already uses `.then/.catch` (no top-level await), so it bundles cleanly as CJS.

**Gotcha:** some bundled deps read `import.meta.url` at load (e.g. **node-cron** computes `daemonPath`). In CJS esbuild leaves it `undefined` → `fileURLToPath(undefined)` crashes at require time. Fix in esbuild: `define:{"import.meta.url":"__importMetaUrl"}` + `banner.js: const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;`.

## Packaging
- Runtime externals scanned from the bundle (esbuild leaves them as bare imports): **nodemailer, pdfkit, pino-pretty, thread-stream** (+ drizzle-orm harmlessly listed). `pg`, express, drizzle, bcryptjs are bundled. `pg-native` optional/skipped.
- `app.js` startup: parses `.env`, sets on-disk defaults (`SERVE_CLIENT_DIR=./public`, `BACKUP_DIR=./backups`, `LOCAL_STORAGE_DIR=./storage`), then `require("./server/index.cjs")`.
- Zip via `adm-zip` (devDep of api-server) — no `zip`/`python3` CLI in the Replit env.
- Env needed on host: `DATABASE_URL`, `SESSION_SECRET`, `PORT` (Passenger-provided), optional `APP_URL` (email links), `SMTP_PASSWORD`.

## Boot-testing locally
ESM `import` ignores `NODE_PATH`, so to boot `deploy/app.js` without a real `npm install`, symlink `deploy/node_modules -> artifacts/api-server/node_modules` (pnpm tree resolves the externals), then remove it after.
