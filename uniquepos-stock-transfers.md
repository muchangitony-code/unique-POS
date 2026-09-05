---
name: UniquePOS cross-branch stock transfers
description: Hold/approve/reject model for branch-to-branch stock transfers and the atomic state-transition guard that prevents double application.
---

# Cross-branch stock transfers

Branch-to-branch transfers use a **hold model** backed by per-branch `product_stock`:
- **Create** → decrement source immediately (a "hold"), write a `transfer_out` movement, status `pending`.
- **Approve** → credit destination, write a `transfer_in` on the destination, status `approved`.
- **Reject** → credit the held stock back to the source, write a `transfer_in` on the source ("hold released"), status `rejected`.

`stock_transfers.status` is a plain **text** column (`pending|approved|rejected`), not a pgEnum — avoids a separate `CREATE TYPE` in the raw-SQL startup migration.

## Atomic state-transition guard (important)
The repo's accepted convention is that plain stock read-modify-write races are tolerated (matches POS). But a transfer approve/reject is a **discrete workflow transition**, not just a counter bump — applying it twice double-credits stock. So approve/reject must **flip the status FIRST** with a conditional update and only touch stock if that update wins:

```
UPDATE stock_transfers SET status='approved', ... WHERE id=? AND status='pending' RETURNING *
```
If no row returns → someone already processed it → 409. Only the winner applies the stock movement. Ordering matters: status-transition-first (stock-first would re-introduce the double credit). Verified with 5 concurrent approves → exactly one 200, four 409, destination credited once.

**Why:** without the conditional `status='pending'` guard, two concurrent approves (or approve+reject) both pass a plain `if (status==='pending')` read-check and both mutate stock. This is worse than the tolerated counter race because it duplicates a workflow action.

**Residual (accepted):** the multi-step flow is not wrapped in a DB transaction (consistent with receive/adjust), so a crash between the status flip and the stock write could leave approved-without-credit — same class as the accepted non-transactional stock convention.

## Branch selectors need GET /branches/options
`GET /branches` returns only the caller's own branch for non-super users, so it can't populate a transfer's destination picker. `GET /branches/options` returns a lightweight `id/name/code/is_active` list of ALL branches to any authenticated user (no bank/paybill fields), declared BEFORE `/branches/:id` so "options" isn't parsed as an id.

Permissions: non-super users are forced to transfer FROM their own branch (server-side, fail-closed if unassigned); super admins pass any `source_branch_id`. Approve/reject are gated to administrator+manager tiers via `requireRole`, plus `canActOnTransfer` (source OR dest in the actor's branch scope). List visibility = source-or-dest branch in scope.
