---
name: UniquePOS stock & balance integrity
description: Transactional patterns for stock deduction, returns, payments, and one-time document actions
---

- `applyStockDelta(branchId, productId, delta, {allowNegative?}, dbc?)` in api-server `lib/stock.ts` is the ONLY correct way to change stock: idempotent upsert + single guarded `UPDATE ... WHERE current_stock + delta >= 0`. Pass the drizzle `tx` as the last arg inside transactions. Throws nothing itself; returns `{ok,before,after}` — throw `InsufficientStockError` (same module) inside a tx to roll back and map to 409 outside.
- **Why:** read-modify-write stock updates raced and pre-deduct-then-insert left stock corrupted if a later insert failed (architect review finding).
- **How to apply:** every flow that commits stock + writes documents (POS sale, non-draft invoice create, quotation convert, sale returns, purchase receive) must run in ONE `db.transaction`. Never use the old `adjustBranchStock` callback-reducer for commits.
- One-time actions (purchase receive, quotation convert) claim state atomically first: `UPDATE ... SET status=X WHERE id=? AND status <> X RETURNING` inside the tx; zero rows → 409/400, no work done.
- Sale returns lock the sale row (`SELECT ... FOR UPDATE`) to serialize concurrent returns; customer-balance reduction is capped at `unpaidOnSale − priorRefundTotals` to avoid cross-document balance drift.
- Balances: customer balance += unpaid amount on credit POS sale / sent invoice / conversion; −= on /pay, payments endpoint, returns. Supplier balance += purchase total on receive; −= on supplier payments. `party_payments` table records both sides; ledgers are merged queries.
- movement_type enum includes 'opening' and 'return' (added via idempotent startup migration AND lib/db schema enum — keep both in sync, then `tsc --build` lib/db).
- Drizzle raw-array pitfall: `= ANY(${ids})` breaks with node-postgres; always use `inArray()` (bit us twice: pos.ts, purchases.ts formatPurchase).
- pos.sale.test.ts mocks `db.transaction` as `fn(dbMock)`; the `../lib/stock` mock must export both `applyStockDelta` and `InsufficientStockError`.
