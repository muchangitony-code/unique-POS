---
name: UniquePOS backup email alerts
description: How backup failure/success emails are wired and where SMTP config lives
---

# Backup Email Alert Architecture

## How it works
- `artifacts/api-server/src/lib/email.ts` — `sendBackupFailureEmail` / `sendBackupSuccessEmail` via nodemailer
- SMTP host/port/user/from stored in `business_settings` table (new columns added via startup migration)
- SMTP password is **not** in the DB — must be set as `SMTP_PASSWORD` env secret
- Alerts fire in `artifacts/api-server/src/routes/backups.ts` (manual run) and `artifacts/api-server/src/lib/scheduler.ts` (scheduled run)
- Both paths are non-blocking: email errors are logged as warnings and never crash the backup

## Settings columns added
`smtp_host`, `smtp_port` (default 587), `smtp_user`, `smtp_from`, `backup_alert_enabled` (default TRUE), `backup_success_notify` (default FALSE)

**Why:** Startup migration (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) keeps these idempotent across restarts without a full migration tool.

## UI
Settings → Database Backups tab → Email Notifications card. Alert preference toggles + full SMTP form. Badge in the backup header shows "Alerts on / No alerts" based on `smtp_host` + `backup_alert_enabled`.

## Recipient
Always `business_settings.business_email` — not a separate field.
