---
name: Branding module-cache vs React memo staleness
description: Why the BrandingProvider feeds the module-level cache during render, not in a useEffect.
---

Plain (non-React) utilities like the print/PDF helpers read branding from a
module-level cache (`setBrandingCache`/`getBranding` in `lib/company.ts`), while
React components read the same data via a provider that memoizes `getBranding()`.

**Rule:** the provider must call `setBrandingCache(data)` **synchronously during
render**, before the `useMemo` that calls `getBranding()`, not inside a
`useEffect`.

**Why:** a module-level variable is not React state — writing it in an effect does
NOT trigger a re-render, and the `useMemo` (keyed on `[data]`) only recomputes when
`data` changes. So if the cache is set in an effect that runs *after* the memo, the
memo captures the stale fallback values and never updates, even though the effect
later populates the cache. Symptom seen: login/sidebar showed hard-coded fallback
company details instead of the fetched DB values.

**How to apply:** whenever a context bridges a non-React singleton cache with a
React hook result, populate the singleton during render (idempotent) so both the
cache consumers and the memoized React value see the same fresh data on the same
render. Keep genuinely side-effecting work (e.g. mutating `document` styles) in the
effect.
