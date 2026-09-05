---
name: UniquePOS API auth pattern
description: How authentication and authorization work across the full stack.
---

## Backend
- `artifacts/api-server/src/lib/auth.ts`: `requireAuth` middleware reads `Authorization: Bearer <token>`, verifies JWT, attaches `req.user`.
- `artifacts/api-server/src/app.ts`: `conditionalAuth` function applied globally BEFORE all routes. Skips PUBLIC_PATHS (`/api/auth/*`, `/api/health`). All other routes require a valid JWT.

## Frontend
- `artifacts/unique-pos/src/contexts/AuthContext.tsx`: calls `setAuthTokenGetter(() => token)` on login; `setAuthTokenGetter(null)` on logout. Also calls `setBaseUrl('/api')` at module init.
- Vite dev server has a proxy: `/api` → `http://localhost:8080` (in `vite.config.ts`).
- `ProtectedRoute` checks for token in context; redirects to `/login` if absent.

**Why:** Code review found auth middleware was absent on all protected routes and Bearer tokens were never sent. Both gaps were fixed simultaneously.

**How to apply:** Any new route file added to `src/routes/` is automatically protected by `conditionalAuth` in `app.ts` — no per-route `requireAuth` needed unless you want finer-grained role checks.
