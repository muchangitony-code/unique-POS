---
name: UniquePOS double /api prefix fix
description: Why requests hit /api/api/* in production and how it was fixed on the server.
---

# Double /api Prefix Issue

## The rule
The Express server (`app.ts`) has a URL-rewrite middleware that normalises `/api/api/*` → `/api/*` before routing. Do not remove it without also fixing the frontend's `setBaseUrl` call.

## Why
The OpenAPI spec defines `servers: url: /api`, so every generated client URL already starts with `/api` (e.g. `getLoginUrl()` returns `/api/auth/login`).  
`AuthContext.tsx` also calls `setBaseUrl('/api')`, which prepends another `/api` via `customFetch`.  
Result: every API call goes to `/api/api/…`. In development the Vite proxy forwards it on without stripping the extra segment, so the bug exists in both environments but was only noticed in production.

## How to apply
- The rewrite middleware in `app.ts` handles this transparently — no action needed for normal feature work.
- If `setBaseUrl` is ever corrected to `null` (the right long-term fix for web), remove the middleware at the same time or it becomes a no-op harmlessly.
- The boundary check is strict: only `/api/api`, `/api/api/…`, `/api/api?…` are rewritten — not `/api/apiary` or similar.
