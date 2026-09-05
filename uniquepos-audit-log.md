---
name: UniquePOS Audit Log
description: How the audit log is implemented and what actions are covered
---

# UniquePOS Audit Log

## Rule
`logAudit(req, event)` in `artifacts/api-server/src/lib/audit.ts` is the single write point. Always import and call it after the DB mutation succeeds; never before (avoid false positives).

**Why:** Errors are caught internally so a failed audit write never breaks the main flow. Calling before the mutation would log events that were never actually committed.

**How to apply:** When adding new mutating routes, add one `await logAudit(req, {...})` call immediately after the successful DB insert/update/delete — including a lookup before delete to capture entity names.

## Action name convention
`<entityType>.<verb>` — e.g. `sale.created`, `product.deleted`, `stock.adjusted`, `auth.login_failed`.

## Table
`audit_log` — created via `CREATE TABLE IF NOT EXISTS` in `startup-migrations.ts` (runs at server boot). Schema mirrors `lib/db/src/schema/audit_log.ts`.

## Covered actions (as of Task #3)
auth.login, auth.login_failed, sale.created, product.created/updated/deleted, user.created/updated/deleted, expense.created/updated/deleted, stock.received/adjusted/transferred, purchase.created/received, invoice.created/invoice.payment, settings.updated

## Frontend
`artifacts/unique-pos/src/pages/audit-log.tsx` — admin-only, filters by actor/entity/date range, CSV export.

## API
`GET /audit-log` — admin-only (requireRole guard in routes/index.ts). Params: page, limit, actor, entity, from (ISO date), to (ISO date). Invalid dates → 400.
