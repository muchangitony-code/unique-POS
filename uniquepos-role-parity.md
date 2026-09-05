---
name: UI/API role parity
description: Backend write endpoints must enforce the same role tiers as the frontend route guard, not rely on the UI to hide them.
---

# UI/API role authorization parity

Several mutation endpoints (`POST/PATCH/DELETE /products`, `POST /inventory/receive`,
`POST /inventory/adjust`) originally had **no** `requireRole` guard, while the
corresponding frontend pages were restricted via `ProtectedRoute allowedTiers`.
A user in an excluded tier (e.g. `sales_cashier`) could not see the page but
could still call the API directly and mutate the catalog / stock.

**Rule:** every write endpoint must enforce the same functional tiers as the
page that drives it. The route guards in `artifacts/unique-pos/src/Router.tsx`
are the source of truth for who may reach a page; mirror that tier set with
`requireRole(...)` on the matching API routes.

- `/products` and `/inventory` pages → `administrator, manager, storekeeper`
- `/pos` page → `administrator, sales_cashier` (POS `/pos/sale` stays open to
  cashiers — do NOT add product-management guards to the sale route).
- Bulk barcode generation stays `administrator`-only (stricter than the page).

**How to apply:** when adding or auditing a write route, find the page that
calls it, read its `allowedTiers`, and apply the identical set. Don't assume a
hidden UI button is sufficient protection.

**Note:** the route test files mock `requireRole` to a no-op passthrough, so
guard additions don't break unit tests and aren't covered by them — guard/tier
parity has to be verified by reading Router.tsx, not by the test suite.
