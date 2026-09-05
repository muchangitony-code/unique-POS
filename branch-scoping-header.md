---
name: UniquePOS branch scoping (x-branch-id)
description: How super-admin branch view scoping is wired frontend↔backend, and the initial-load hydration pitfall.
---

# Branch scoping via `x-branch-id`

Super admins (roles `super_admin` + `business_owner`) can view one branch or "All Branches".
The choice is sent to the API as the `x-branch-id` request header. Backend
(`branch-scope.ts`) ignores this header for non-super users (they are hard-locked
to their JWT `branchId`), so scoping is a super-admin-only concern.

## Mechanism
- The shared client (`lib/api-client-react`) exposes `setExtraHeadersGetter(getter)`;
  `customFetch` calls it per request and applies returned headers only if not already set.
- The web app's `BranchContext` registers one getter at module load that returns
  `{ 'x-branch-id': String(id) }` only when scoping is enabled (super admin) AND a
  specific branch is selected (null = All Branches → header omitted).
- The getter reads **module-level** mirror vars (`_scopingEnabled`, `_activeBranchId`),
  not React state, because it runs outside React.

## Pitfall: scope must be correct BEFORE the first queries fire
**Rule:** initialise `_activeBranchId` from localStorage at module load, and sync the
module mirrors **during render** (not in a `useEffect`). Also do a one-time
`invalidateQueries()` once scoping first becomes active with a persisted branch.

**Why:** if you only sync in `useEffect`, a super admin who reloads with a persisted
branch fires the initial React Query requests *without* the header (effect runs after
first render), caching unscoped "all branches" data with no refetch. Auth also
hydrates asynchronously, so queries can fire while `user` is still null (canSwitch
false) — the one-time invalidate after hydration cleans up anything cached in that window.

**How to apply:** any module-cache↔React bridge that gates request headers/params must
be readable synchronously before consumers render; see also `branding-cache-sync.md`.

## Consuming a workspace lib change (dist regeneration)
`lib/api-client-react` `package.json` exports `./src/index.ts`, but the app also
consumes it as a **TS project reference** — TypeScript resolves the reference's
`dist/*.d.ts`. After editing the lib's source, run `tsc --build lib/api-client-react`
to regenerate `dist`, or the app's typecheck won't see new exports. There is no
`build` script; use `tsc --build`.
