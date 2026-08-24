# Inventory Architecture

## Stack

UniquePOS uses Node.js/Express with PostgreSQL via `pg`. The inventory rebuild uses the existing `inventory_products_v2`, `inventory_stock_v2`, and `inventory_movements_v2` tables.

## Clean cutover

Migration `0026_inventory_clean_start.sql` is the one-time production cleanup. It:

1. Copies the legacy product and inventory tables into dated `_archived_20260824` tables.
2. Deletes legacy product/stock/movement rows only after the archive step.
3. Clears earlier canonical/rebuild catalogue tables so there is no second source of inventory truth.
4. Verifies that the legacy inventory tables contain zero rows before committing.

The archive tables are intentionally retained. Do not delete them as part of normal application operation.

## Authoritative schema

- `inventory_products_v2` — one row per product; `sku` and `barcode` are unique.
- `inventory_stock_v2` — one row per `(product_id, branch_id)`, with a primary key on those two columns.
- `inventory_movements_v2` — immutable stock movement ledger.
- `inventory_stock_v2.product_id` and `inventory_movements_v2.product_id` have enforced foreign keys to `inventory_products_v2(id)` with `ON DELETE CASCADE`.

No dashboard or Product/Inventory page reads `products`, `product_stock`, or the archived tables.

## Product ↔ inventory synchronization

`POST /api/v3/inventory/products` uses one PostgreSQL transaction:

1. Insert the product.
2. Insert zero-balance stock rows for active branches.
3. Commit both operations together.

If either operation fails, the entire transaction rolls back. There is no best-effort second write.

`DELETE /api/v3/inventory/products/:id` also runs transactionally. The FK cascade removes associated stock and movement rows, preventing orphans.

Stock adjustments lock the `(product_id, branch_id)` row with `FOR UPDATE` before calculating the new balance.

## Dashboard freshness

`GET /api/v3/inventory/dashboard` performs a direct PostgreSQL aggregation with `Cache-Control: no-store`. The dashboard displays the inventory `last_updated` timestamp and overrides low/out-of-stock inventory KPIs from this live query.

There is deliberately no inventory cache. Inventory writes therefore do not require cache invalidation.

## Seed/test guard

Test/demo seed data must not write to production application tables. `scripts/seed-guard.cjs` rejects production seed operations unless an isolated schema is explicitly supplied through `SEED_SCHEMA`.

Production startup must not seed inventory data. The canonical inventory tables are application data, not demo fixtures.

## Acceptance tests

Run:

```bash
BASE_URL=http://localhost:8080 npm run test:inventory
```

The suite checks:

- create → immediate inventory visibility with zero stock;
- edit → immediate inventory update;
- no legacy product/stock rows after cleanup;
- FK enforcement;
- dashboard/direct-DB metric equivalence;
- concurrent create/edit/delete stress;
- no orphaned stock or movement records.
