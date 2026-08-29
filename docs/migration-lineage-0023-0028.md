# Migration lineage: 0023 and 0028

## Finding

The repository contains three different SQL files using migration number `0023`:

- `0023_production_catalog_clean_slate.sql`
- `0023_production_catalog_wipe.sql`
- `0023_production_clean_slate_catalog.sql`

All three are destructive production-catalog cleanup operations. They are not interchangeable schema migrations and must not be allowed to execute automatically.

The current authoritative clean-inventory cutover is `0028_initialize_clean_inventory_catalog.sql`. It creates the v2 inventory tables (`inventory_products_v2`, `inventory_stock_v2`, and `inventory_movements_v2`) and performs the explicit fresh-catalog initialization. Its policy is therefore `fresh_start`.

## 0026 relationship

The deployment-safety documentation historically referenced `0026_inventory_clean_start.sql` as another retired cleanup migration. That file is **not present in the current `main` repository tree**. There is therefore no executable 0026 migration to apply or retire in the current auto-run set. The current executable clean-catalog lineage ends at the authoritative 0028 fresh-start migration.

## Resolution

The three duplicate 0023 files are retained only as historical migration records and are explicitly classified as `retired` in `migration-safety.json`. The migration safety gate refuses to deploy a pending retired migration, so none can silently execute.

`0028_initialize_clean_inventory_catalog.sql` remains the only current fresh-start migration and is explicitly classified as `fresh_start`.

No migration was executed or modified against production as part of this repository change. Production `schema_migrations` state must still be audited in the Railway environment before Phase 1 can be signed off.
