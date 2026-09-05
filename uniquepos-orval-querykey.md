---
name: Orval generated hooks require queryKey in options
description: Why passing { query: { enabled } } to a generated useGet* hook fails typecheck in unique-pos
---

# Orval query hooks require an explicit queryKey

When calling a generated `useGet*` hook with query options in `artifacts/unique-pos`,
passing only `{ query: { enabled: x } }` fails typecheck: `Property 'queryKey' is missing`.

**Why:** this repo's orval config emits `UseQueryOptions` with `queryKey` **required**
(not optional). React Query's own type allows omitting it, but the generated wrapper does not.
(dashboard.tsx has a lingering instance of exactly this error.)

**How to apply:** also import the generated `getGet<Name>QueryKey(params)` helper and pass it:
`useGetX(params, { query: { enabled, queryKey: getGetXQueryKey(params) } })`.

Also: after adding a new route to `artifacts/api-server`, the dev workflow did not always
pick it up via hot-reload — a `WorkflowsRestart` of `artifacts/api-server: API Server` was
needed before the new endpoint stopped 404ing.
