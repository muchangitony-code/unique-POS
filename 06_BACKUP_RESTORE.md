# UniquePOS — Backup & Disaster Recovery Guide

Your live data lives in **two** places. A complete backup must cover both:

1. **PostgreSQL database** — all business data (products, sales, invoices, users,
   settings, audit log, etc.).
2. **`storage/` folder** — uploaded branding images (logo, stamp, signature).

The `backups/` folder holds database dumps created by the in-app backup feature;
it is itself worth copying off-site.

---

## 1. What to back up, and how often

| Asset | Method | Frequency |
|---|---|---|
| Database | In-app backup **and/or** provider auto-backups | Daily (or more) |
| `storage/` | File copy / SFTP / cron `tar` | After branding changes; weekly |
| `.env` | Secure copy (contains secrets) | On change |
| Off-site copy of the above | Download from server to safe location | Weekly minimum |

> A backup you have never restored is not a backup. Test restores periodically
> (see §5).

---

## 2. Database backups

### A. In-app backups (easiest)
1. Log in as admin → **Settings → Backups** (or the Backups screen).
2. Click **Run backup**. A dump is written to the `backups/` folder on the
   server and appears in the list.
3. Use **Download** to pull a copy to your PC.
4. Configure **scheduled backups** and (optionally) **email notifications** so a
   copy/alert is produced automatically. Set `SMTP_PASSWORD` and SMTP settings
   for email to work.

> The in-app backup uses `pg_dump` on the server. This requires `pg_dump`/`psql`
> to be available on the server PATH. Many shared cPanel hosts do **not** include
> the PostgreSQL client tools — if in-app backups fail for that reason, rely on
> method B below.

### B. Managed provider backups (recommended baseline)
Neon, Supabase, and Railway all provide automated backups / point-in-time
recovery. Enable and verify them in your provider's dashboard. This is your
safety net regardless of whether server-side `pg_dump` is available.

### C. Manual dump from your PC (always works)
From any machine with `psql`/`pg_dump`:
```bash
pg_dump --format=plain --clean --if-exists --no-owner --no-privileges \
  "postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" \
  > uniquepos-$(date +%Y%m%d-%H%M).sql
```
Store the resulting `.sql` file off-site.

---

## 3. File (storage) backups

The `storage/` folder holds uploaded images. Back it up with SFTP, the cPanel
File Manager (compress → download), or a cron job:

```bash
# Example cron: nightly tar of storage into a dated archive
0 2 * * * cd /home/USERNAME/uniquepos && tar czf backups/storage-$(date +\%Y\%m\%d).tar.gz storage
```

Then download those archives off-site periodically.

---

## 4. Restore procedures

### Restore the database
**In-app:** Settings → Backups → choose a backup → **Restore**. This overwrites
current data with the backup (the app uses a fail-fast restore, i.e. it stops on
the first error). Only an admin can do this.

**Manual (psql):**
```bash
psql "postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" \
  -v ON_ERROR_STOP=on \
  -f uniquepos-YYYYMMDD-HHMM.sql
```
The dumps are created with `--clean --if-exists`, so they drop and recreate
objects cleanly before loading data.

### Restore the storage folder
Upload/extract your `storage/` archive back into the app root so the files sit at
`uniquepos/storage/...`. Ensure the folder is writable by the app user.

### After any restore
1. **Restart** the Node app in cPanel.
2. Log in and spot-check: recent sales, products, branding image on documents.

---

## 5. Disaster recovery — full rebuild from scratch

Use this if the server is lost entirely.

1. **Provision hosting:** new cPanel account (or rebuild), Node.js 22.
2. **Restore the database:**
   - If the managed Postgres survived, just point the new app at it.
   - Otherwise create a new Postgres and restore your latest `.sql` dump
     (method 4).
3. **Deploy the app:** upload and extract `uniquepos-standalone.zip`, create the
   Node.js app with startup file `app.js` (see `01_DEPLOYMENT_TRUEHOST.md`).
4. **Restore files:** put your latest `storage/` archive into the app root.
5. **Restore config:** recreate `.env` (or set env vars) — `DATABASE_URL`,
   `SESSION_SECRET` (use the **same** secret as before so existing tokens/links
   remain valid; a new secret simply forces re-login), `APP_URL`, `SMTP_PASSWORD`.
6. **Install & start:** Run NPM Install → Restart.
7. **Verify:** login, dashboard, a recent sale, branding on an invoice PDF.

### Recovery targets to decide in advance
- **RPO (how much data you can afford to lose):** drives backup frequency. Daily
  dumps = up to 24h loss; provider PITR can reduce this to minutes.
- **RTO (how fast you must be back):** with the zip + a recent dump, a full
  rebuild is typically under an hour.

---

## 6. Backup hygiene checklist

- [ ] Database backed up automatically (in-app schedule **or** provider PITR).
- [ ] `storage/` backed up on a schedule.
- [ ] Backups downloaded **off the server** (a backup on the same disk dies with
      the disk).
- [ ] `.env` / secrets stored securely and separately.
- [ ] A test restore performed at least once and documented.
- [ ] `SESSION_SECRET` recorded safely (needed for a clean recovery).
