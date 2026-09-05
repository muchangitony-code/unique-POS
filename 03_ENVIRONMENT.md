# UniquePOS — Environment Variables Reference

The application reads configuration from environment variables. On cPanel you can
set these in **Setup Node.js App → Environment variables**, or place them in a
`.env` file in the application root (copy `.env.example` to `.env`). Variables set
in the cPanel UI take precedence over the `.env` file.

`app.js` parses `.env` on startup (a simple `KEY=VALUE` parser — no quotes
required, but quotes are stripped if present).

---

## Complete `.env` template

```dotenv
# ─────────────────────────────────────────────────────────────────────────────
# REQUIRED
# ─────────────────────────────────────────────────────────────────────────────

# PostgreSQL connection string for your managed database (Neon/Supabase/Railway).
# Include ?sslmode=require for managed providers.
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require

# Secret used to sign and verify login (JWT) tokens AND to sign upload URLs.
# Use a long, random string (>= 32 characters). If this changes, all existing
# login sessions are invalidated. Keep it secret; never commit it.
SESSION_SECRET=change-me-to-a-long-random-string-min-32-chars

# ─────────────────────────────────────────────────────────────────────────────
# STRONGLY RECOMMENDED
# ─────────────────────────────────────────────────────────────────────────────

# Node environment. Always "production" on a live server.
NODE_ENV=production

# Public URL of this app. Used to build links inside alert/backup emails so they
# point at your real domain. If unset, links fall back to localhost.
APP_URL=https://pos.yourdomain.com

# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL
# ─────────────────────────────────────────────────────────────────────────────

# Password for the outgoing SMTP account. The SMTP host, port, username and
# from-address are configured in-app under Settings; only the password lives
# here (so it is never stored in the database). Required only if you use email
# alerts (backup notifications, security alerts, password reset).
# SMTP_PASSWORD=your-smtp-password

# Logging verbosity: fatal | error | warn | info | debug | trace. Default: info.
# LOG_LEVEL=info

# ─────────────────────────────────────────────────────────────────────────────
# PORT — DO NOT SET UNDER PASSENGER
# ─────────────────────────────────────────────────────────────────────────────
# Passenger assigns the port automatically and the app reads it. Only set this
# for a manual "npm start" run outside cPanel (e.g. local testing).
# PORT=3000

# ─────────────────────────────────────────────────────────────────────────────
# ON-DISK PATHS — usually leave unset (app.js provides sensible defaults)
# ─────────────────────────────────────────────────────────────────────────────
# Directory containing the built frontend. Default: ./public (beside app.js).
# SERVE_CLIENT_DIR=./public
# Directory for database backups created by the in-app backup feature.
# Default: ./backups
# BACKUP_DIR=./backups
# Directory for uploaded branding images (logo/stamp/signature).
# Default: ./storage
# LOCAL_STORAGE_DIR=./storage
```

---

## Variable-by-variable explanation

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string. The app connects on boot and fails fast if it is missing or wrong. |
| `SESSION_SECRET` | **Yes** | — | Secret key for signing JWT auth tokens and HMAC-signed upload URLs. Must be long and random. Changing it logs everyone out. The server throws on startup if it is not set. |
| `NODE_ENV` | Recommended | `production` (set by `app.js`) | Standard Node environment flag; enables production behaviour and disables dev-only cache headers. |
| `APP_URL` | Recommended | falls back to localhost | Absolute base URL used inside outgoing emails (password reset, backup and security alerts) so links open your real site. |
| `SMTP_PASSWORD` | Optional | — | Password for the outgoing email account. Host/port/user/from are set under **Settings**; only the secret password is an env var. Needed for any email feature. |
| `LOG_LEVEL` | Optional | `info` | Controls log verbosity. Use `debug` while troubleshooting, then revert. |
| `PORT` | No (Passenger) | provided by Passenger | The TCP port the server listens on. Under cPanel/Passenger it is set automatically — **leave it unset**. Set it only for manual local runs. |
| `SERVE_CLIENT_DIR` | No | `./public` | Where the compiled frontend lives. `app.js` defaults it next to itself. |
| `BACKUP_DIR` | No | `./backups` | Where in-app database backups are written. Must be writable and included in your off-site backups. |
| `LOCAL_STORAGE_DIR` | No | `./storage` | Where uploaded branding images are stored on disk. Must be writable. |

---

## Security notes

- **Never commit `.env`** to source control. The package ships a `.gitignore`
  that already excludes it.
- Treat `SESSION_SECRET` and `SMTP_PASSWORD` as secrets. Rotate `SESSION_SECRET`
  if you suspect it leaked (this forces all users to log in again).
- Ensure `BACKUP_DIR` and `LOCAL_STORAGE_DIR` are **not** inside `public_html`
  or otherwise web-accessible without authentication.
