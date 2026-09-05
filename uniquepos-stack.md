---
name: UniquePOS stack decisions
description: Core technology choices and critical constraints for the UniquePOS ERP project.
---

## Stack
- **Frontend**: React + Vite, Wouter routing, `next-themes` dark/light, Recharts, react-hook-form + zod, Sonner toasts. Preview path: `/` (root artifact).
- **Backend**: Express/Node in `artifacts/api-server`. Build via `node ./build.mjs` then `node dist/index.mjs`. Uses pino logging.
- **DB**: PostgreSQL via Drizzle ORM in `lib/db`. Schema in `lib/db/src/schema/`. Push: `pnpm --filter @workspace/db run push`.
- **API client**: `@workspace/api-client-react` with `customFetch`; `setAuthTokenGetter` and `setBaseUrl` exported from index.

## Auth
- JWT signed with `SESSION_SECRET` env var. Server **throws at startup** if `SESSION_SECRET` is not set — no fallback allowed.
- `bcryptjs` version 3.x is installed in `artifacts/api-server`; hash generation must be done with `cd artifacts/api-server && node -e "require('bcryptjs').hash(...)"`.

## Currency / locale
- KES (Kenyan Shillings), VAT 16% default, timezone Africa/Nairobi.

**Why:** User explicitly requested Kenya/Africa locale; using the existing Express api-server (not FastAPI — no artifact type exists for Python).

**How to apply:** When adding new routes, always import tables from `@workspace/db` (not from relative paths). Always run `pnpm run typecheck:libs` after schema changes before building api-server.
