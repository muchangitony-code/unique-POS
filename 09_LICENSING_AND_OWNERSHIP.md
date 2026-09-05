# UniquePOS — Ownership & Replit Independence

## Ownership

The UniquePOS application code in this project is **yours**. It was built for you
in your workspace, and you own the source code and the resulting deployment
package. You can host it anywhere, modify it, and run it without any ongoing tie
to Replit.

> This document describes the technical facts about dependencies. It is not
> legal advice. For any third-party libraries the app uses, their respective
> open-source licenses (e.g. MIT/Apache/ISC) apply to those libraries only — a
> normal situation for any Node.js application.

---

## The standalone deployment has NO Replit dependencies

The deployment package (`uniquepos-standalone.zip`) was verified to be free of
Replit-specific runtime dependencies:

- **No Replit packages.** The generated `package.json` runtime dependencies are:
  `drizzle-orm`, `nodemailer`, `pdfkit`, `pino-pretty`, `thread-stream`
  (plus `pg`, `express`, and `bcryptjs`, which are bundled into `server/index.cjs`).
  There are **no `@replit/*` packages** and **no `@google-cloud/*` packages**.
- **No `workspace:` or `catalog:` dependencies.** All monorepo-internal and
  pnpm-catalog references are inlined at build time, so the package installs with
  a plain `npm install` — no pnpm, no workspaces required.
- **No Replit Object Storage.** File uploads (branding images) use **local
  disk** (`storage/`) via a build-time overlay, replacing Replit's object
  storage entirely.
- **No Replit database service.** The app uses your own external PostgreSQL
  (`DATABASE_URL`) — a managed provider of your choice (Neon/Supabase/Railway),
  not any Replit-hosted database.
- **No Replit Auth / SSO.** Authentication is self-contained: JWT signed with
  your `SESSION_SECRET`, with bcrypt password hashing.

### The one cosmetic reference (harmless)
The bundle contains a single fallback reference to the environment variable
`REPLIT_DEV_DOMAIN`, used **only** to build links inside outgoing emails when
`APP_URL` is not set. On your server that variable does not exist, and you should
set `APP_URL` to your real domain (see `03_ENVIRONMENT.md`). It is a fallback
string, not a dependency on any Replit service, and nothing calls Replit.

---

## What is NOT in the deployment package

The source repository also contains items that are **excluded** from the cPanel
deployment and therefore irrelevant to your self-hosted app:

- `artifacts/mobile-pos` — the Expo mobile app (separate product).
- `artifacts/mockup-sandbox` — a design/prototyping sandbox.
- The Replit development tooling, workflows, and the non-overlay object-storage
  and backup modules used only while developing on Replit.

The standalone build deliberately ships **only** the web app (API + frontend)
and its real runtime dependencies.

---

## How to verify this yourself

From the extracted package or the `deploy/` folder:

```bash
# 1. No Replit or cloud packages, no workspace/catalog specifiers:
grep -iE "replit|@google-cloud|workspace:|catalog:" package.json    # -> no matches

# 2. Installs with plain npm (no pnpm/workspaces):
npm install --omit=dev

# 3. The only 'replit' string in the bundle is the email-link fallback:
grep -aoiE ".{20}replit.{20}" server/index.cjs
#   -> shows only: ... process.env.REPLIT_DEV_DOMAIN ... (a fallback)
```

Everything the running app needs at runtime is: **Node.js 22**, the npm packages
in `package.json`, your **PostgreSQL** database, and local disk for
`storage/`/`backups/`. Nothing else.

---

## Summary

- You own the application code and the deployment package.
- The standalone build runs on any ordinary Node.js host with `npm install`.
- It depends on **no Replit services** at runtime — storage, database, auth, and
  email are all self-hosted or use providers you control.
- Standard open-source licenses apply to the third-party npm libraries it uses,
  as with any Node.js project.
