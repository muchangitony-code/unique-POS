---
name: UniquePOS security alert rule engine
description: Architecture and integration points for the audit-log-based security alert system.
---

# Security Alert Rule Engine

## Rule storage
- Rules stored as JSONB in `business_settings.alert_rules`; `security_alert_enabled` boolean master switch
- Both columns added via `startup-migrations.ts` (idempotent ALTER TABLE IF NOT EXISTS)
- Drizzle schema updated in `lib/db/src/schema/settings.ts` (requires `lib/db` rebuild: `cd lib/db && npx tsc -p tsconfig.json`)

## In-app notifications table
- `admin_notifications` table created in startup-migrations and in Drizzle schema at `lib/db/src/schema/notifications.ts`
- Exported from `lib/db/src/schema/index.ts`

## Rule evaluation flow
- `logAudit` (in `audit.ts`) calls `evaluateAlertRules` via `setImmediate` after inserting the audit log row — never blocks HTTP response
- `evaluateAlertRules` is in `artifacts/api-server/src/lib/security-alerts.ts`
- For threshold rules: counts recent matching actions in the window, then checks `wasRecentlyAlerted` to throttle duplicate notifications within the same window

## Default rules (built-in, always present as base)
- `brute-force-login`: threshold 5 × `auth.login_failed` in 10 min → critical
- `bulk-product-delete`: threshold 3 × `product.deleted` in 5 min → warning
- `user-deleted`: action_match `user.deleted` → warning
- `role-change`: action_match `user.updated` → info
- `settings-changed`: action_match `settings.updated` → info (disabled by default)

## API routes
- `GET /notifications` — latest 50, returns `{ notifications, unread }` — admin-only
- `PATCH /notifications/read-all` — mark all read
- `PATCH /notifications/:id/read` — mark one read
- `DELETE /notifications` — clear all

## Frontend
- `NotificationBell` component in `artifacts/unique-pos/src/components/layout/NotificationBell.tsx` — replaces static Bell in TopNav
- Polls every 30s; marks all read when popover opens
- Settings → Security Alerts tab: `SecurityAlertsPanel` in `settings.tsx` — toggle master switch, per-rule enable/disable and channel (in-app, email) toggles

**Why:** Email alerts reuse existing SMTP settings + `sendSecurityAlertEmail` in `email.ts`; in-app works without SMTP.
