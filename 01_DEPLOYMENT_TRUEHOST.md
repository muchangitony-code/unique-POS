# UniquePOS — Production Deployment Guide (Truehost cPanel + Node.js)

This guide takes you from a fresh Truehost cPanel account to a running UniquePOS
instance, step by step. It assumes you have the deployment package
`uniquepos-standalone.zip` and a managed PostgreSQL database (see
`02_DATABASE_SETUP.md`).

The app is a **single Node.js process** that serves both the REST API (`/api/*`)
and the compiled web frontend (`/`). There is no separate frontend server.

---

## 0. Before you start — checklist

- [ ] A Truehost cPanel account with **"Setup Node.js App"** available
      (Passenger / CloudLinux Node Selector). Node.js **22** must be selectable.
- [ ] A PostgreSQL database and its connection string (`DATABASE_URL`).
      Truehost provides MySQL, **not** PostgreSQL — use a managed provider such as
      Neon (neon.tech), Supabase, or Railway. See `02_DATABASE_SETUP.md`.
- [ ] The deployment package `uniquepos-standalone.zip`.
- [ ] `psql` available on your local PC to load the database (or use the
      provider's SQL console).
- [ ] A domain or subdomain pointed at your cPanel account
      (e.g. `pos.yourdomain.com`).

---

## 1. Create the PostgreSQL database

Follow `02_DATABASE_SETUP.md` first. At the end you must have:

- A working `DATABASE_URL` (e.g. `postgres://user:pass@host:5432/dbname?sslmode=require`)
- The schema and starter data loaded (either from the bundled `db/database.sql`
  or the fresh-install script).

Do this **before** starting the Node app — the app connects on boot.

---

## 2. Upload the application files

You can upload with the cPanel File Manager (simplest) or SFTP.

### Option A — cPanel File Manager
1. Log in to cPanel.
2. Open **File Manager**.
3. Navigate to where you want the app to live. A good choice is a folder
   **outside** `public_html`, e.g. `/home/USERNAME/uniquepos`.
   > Do not place the Node app inside `public_html`. Passenger serves it; the
   > public web root only needs the auto-generated symlink (handled in step 3).
4. Click **Upload** and select `uniquepos-standalone.zip`.
5. Back in File Manager, right-click the uploaded zip → **Extract**.
6. You will get a folder `uniquepos/` containing `app.js`, `server/`, `public/`,
   `db/`, `README.md`, `.env.example`, etc.

### Option B — SFTP
Upload and unzip so the structure is:
```
/home/USERNAME/uniquepos/
├── app.js
├── package.json
├── server/
├── public/
├── db/
├── backups/
├── storage/
├── .env.example
└── README.md
```

---

## 3. Create the Node.js application in cPanel

1. In cPanel open **Setup Node.js App** (a.k.a. "Node.js Selector").
2. Click **Create Application**.
3. Fill in:
   - **Node.js version:** `22.x`
   - **Application mode:** `Production`
   - **Application root:** the folder you extracted to, e.g. `uniquepos`
     (relative to your home directory).
   - **Application URL:** the domain/subdomain, e.g. `pos.yourdomain.com`.
   - **Application startup file:** `app.js`
4. Click **Create**.

cPanel/Passenger will create a virtual environment and a symlink from your web
root to the app. It also shows a command to "enter the virtual environment" —
note it; you may need it in step 5.

> **Why `app.js`?** Passenger loads the startup file with `require()`. `app.js`
> is CommonJS with no top-level `await`, which is exactly what Passenger needs.
> An ES-module startup file would fail with `ERR_REQUIRE_ASYNC_MODULE`.

---

## 4. Set environment variables

In the **Setup Node.js App** screen for your app, find the
**"Environment variables"** section and add each variable. See
`03_ENVIRONMENT.md` for the full list and explanations. The minimum required:

| Variable         | Example / Notes                                             |
|------------------|------------------------------------------------------------|
| `DATABASE_URL`   | `postgres://user:pass@host:5432/db?sslmode=require`        |
| `SESSION_SECRET` | A long random string (≥ 32 chars). Keep it secret.         |
| `APP_URL`        | `https://pos.yourdomain.com` (used in alert/backup emails) |
| `NODE_ENV`       | `production`                                                |

Optional: `SMTP_PASSWORD` (for outgoing email), `LOG_LEVEL`.

> **Do not set `PORT`.** Passenger assigns it automatically and the app reads it.
>
> Alternatively you can create a `.env` file in the application root (copy
> `.env.example` to `.env` and fill it in). `app.js` reads `.env` on startup.
> Environment variables set in the cPanel UI take precedence.

---

## 5. Install dependencies

In the **Setup Node.js App** screen, click **Run NPM Install**. This runs
`npm install` inside the app's virtual environment and installs the runtime
dependencies listed in `package.json`.

If the button is not available or fails, do it from the terminal:
1. Open cPanel **Terminal** (or SSH in).
2. Enter the app's virtual environment using the command shown at the top of the
   Node.js App screen (looks like `source /home/USERNAME/nodevenv/uniquepos/22/bin/activate && cd /home/USERNAME/uniquepos`).
3. Run:
   ```bash
   npm install --omit=dev
   ```

Installation should complete in under a minute — the server code is already
bundled, so only a handful of native/optional packages are fetched.

---

## 6. Start the application

1. Back in **Setup Node.js App**, click **Restart** (or **Start**).
2. Passenger boots `app.js`, which loads the bundled server and starts listening.
3. Visit your Application URL (e.g. `https://pos.yourdomain.com`).
   You should see the UniquePOS login page.

---

## 7. First login and hardening

1. Log in with the default administrator (see `04_ADMIN_CREDENTIALS.md`):
   - **Email:** `admin@uniquepos.com`
   - **Password:** `Test1234!`
2. **Immediately** go to **Settings → Users** and change the admin password
   (or create a new admin and disable the default one).
3. Review **Settings → Company / Branding** and upload your logo.
4. Configure SMTP under **Settings** if you want email alerts (set
   `SMTP_PASSWORD` in step 4).

---

## 8. Verify the deployment

- [ ] Login page loads over HTTPS.
- [ ] You can log in and see the Dashboard.
- [ ] Create a test product; it saves and appears in the list.
- [ ] Make a test sale in POS; stock decrements.
- [ ] `https://pos.yourdomain.com/api/health/healthz` returns OK.
- [ ] Upload a logo under Settings → Branding (verifies local file storage).

---

## 9. Updating to a new version later

1. Build a new `uniquepos-standalone.zip`.
2. Upload and extract it over the app folder (back up `.env`, `storage/`, and
   `backups/` first — do **not** overwrite them).
3. Click **Run NPM Install** (in case dependencies changed).
4. Click **Restart**.

The database schema auto-upgrades on boot for additive changes (see
`02_DATABASE_SETUP.md` → "Migrations"). For a brand-new install you load the
full script once; for upgrades you normally do nothing to the DB.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `ERR_REQUIRE_ASYNC_MODULE` on start | You are not using the provided `app.js`, or an older ESM build. Re-deploy this package; the startup file must be CommonJS. |
| App restarts / 502 immediately | Check the Passenger log (see below). Usually a bad `DATABASE_URL` or missing `SESSION_SECRET`. |
| Login page loads but login fails | DB not reachable or schema/data not loaded. Verify `DATABASE_URL` and that `db/database.sql` was restored. |
| "PORT environment variable is required" | You set a `PORT` that is empty, or you are running outside Passenger without `PORT`. Under Passenger, leave `PORT` unset. For a manual run, `PORT=3000 npm start`. |
| Logo upload fails | The `storage/` folder is not writable. `chmod` it to be writable by the app user. |
| Emails not sending | `SMTP_PASSWORD` not set, or SMTP host/port/user not configured under Settings. |
| Blank page, assets 404 | The `public/` folder was not uploaded, or `SERVE_CLIENT_DIR` points to the wrong path. Default is `./public` beside `app.js`. |

### Reading logs
- Passenger writes to a log usually at `~/logs/` or shown in the Node.js App
  screen. The app itself logs to stdout (captured by Passenger).
- Increase detail temporarily with `LOG_LEVEL=debug` (env var), then Restart.

---

## Summary of the moving parts

- **`app.js`** — Passenger startup file (CommonJS). Loads `.env`, sets on-disk
  defaults, and starts the bundled server.
- **`server/index.cjs`** — the entire backend bundled into one CommonJS file.
- **`public/`** — the compiled React frontend, served by the same process.
- **PostgreSQL** — external managed database (`DATABASE_URL`).
- **`storage/`** — uploaded branding images (logo/stamp/signature) on local disk.
- **`backups/`** — database backups created by the in-app backup feature.
