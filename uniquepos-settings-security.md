---
name: UniquePOS System Settings — security & fonts
description: Durable decisions for the Settings module (2FA, lockout, restore, brand fonts, payment instructions).
---

## Failed-login lockout must be atomic
Increment the failed-attempt counter and decide the lock in ONE SQL statement
(`UPDATE ... SET failed_login_attempts = CASE ... locked_until = CASE ...`), never
read-modify-write from an in-memory value.
**Why:** concurrent bad logins lose updates (undercount) and weaken brute-force defense.
**How to apply:** any per-user counter that gates a security decision under concurrency.

## Backup restore must fail-fast
`psql` restore runs with `ON_ERROR_STOP=on` so any SQL error aborts with non-zero exit;
the route must treat non-zero as failure and never return success on partial restore.
This is only safe because dumps are written with `pg_dump --clean --if-exists` (the
leading DROPs don't error on a fresh/idempotent target).
**Why:** a destructive recovery path reporting false success is a data-loss trap.
**How to apply:** keep the `--clean --if-exists` dump flag and `ON_ERROR_STOP=on` in lockstep.

## Brand fonts
Body/heading fonts are a curated Google-Fonts list (`src/lib/fonts.ts`). Applied app-wide
by overriding the existing `--app-font-sans` CSS var (body) plus a runtime `<style>` rule
for `h1..h6` (heading); fonts loaded on demand via injected `<link>`. On printed docs,
printDoc `@import`s the chosen families and sets body/heading font-family from
`ResolvedBranding.bodyFontStack/headingFontStack`.

## New Settings endpoints use the customFetch escape hatch
Change-password, 2FA, `/settings/security`, `/security/login-history`, and backup restore
are called via `customFetch` from `@workspace/api-client-react` with snake_case bodies —
the 3300-line OpenAPI spec was NOT regenerated. Existing endpoints keep generated hooks.

## Tab layout
Settings has a per-user **Security** tab (change password + 2FA, visible to all; policy +
login history gated to admins) SEPARATE from the admin-only **Security Alerts** tab (alert
rules). `payment_instructions` is its own column, distinct from `other_payment_methods`.
