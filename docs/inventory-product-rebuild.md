# Inventory / Product Module — Complete Clean Rebuild

## Objective
Replace the unstable legacy Product/Inventory module with a completely new catalogue and inventory subsystem. The old inventory/product data is NOT part of the new module.

## Data policy
- The new module starts with ZERO products.
- The new module starts with ZERO stock.
- No old product records are migrated.
- No old stock records are migrated.
- No old stock movements are migrated.
- No old product import records are read.
- No legacy catalogue seed is read.
- No automatic restoration/reconciliation process may repopulate the new catalogue.
- Existing inventory/product tables are not the source of truth for the new module.
- Historical inventory data is intentionally excluded from the new module.

## New authoritative records
The rebuild owns its own product and inventory records. It must never query the legacy product catalogue as a fallback.

## Product record
SKU/product code, barcode, name, category, brand, unit, cost price, selling price, VAT rate, reorder level, supplier, description, active status, timestamps.

## Inventory record
Product ID, branch ID, quantity on hand, reorder level, last updated timestamp.

## Stock movement
Product ID, branch ID, movement type, quantity delta, reference type, reference ID, reason, user ID, timestamp.

Movement types: opening balance, purchase, sale, sale reversal, adjustment increase, adjustment decrease, transfer out, transfer in, return.

## UI
- Product list with search, filters, pagination and stock status.
- Add/edit product.
- Product details.
- Branch stock view.
- Stock adjustment.
- Stock movement history.
- Import wizard with file validation, mapping, preview and commit.
- Export.
- Explicit empty-state when there are zero products.

The empty-state MUST NOT call a recovery endpoint, seed data, import old products, or retry a legacy catalogue API.

## API ownership
The new module owns all product/inventory API calls and state. It must not monkey-patch `window.fetch`, global click handlers, MutationObserver, routing, or unrelated POS modules.

## Cutover
The old Inventory/Product module is retired. The new module is independent of the old catalogue. The first successful deployment must show an empty catalogue until the new approved stock master is deliberately imported.

## Acceptance tests
1. New database/catalogue contains zero products after cutover.
2. New database/catalogue contains zero stock after cutover.
3. Hard refresh does not repopulate products.
4. Logout/login does not repopulate products.
5. Application restart/deploy does not repopulate products.
6. Adding one product creates exactly one new product.
7. Refresh does not duplicate products.
8. Editing a product does not create a second product.
9. Deactivating a product does not resurrect it.
10. Stock adjustment changes only the selected branch and records one movement.
11. Sale deduction changes stock exactly once.
12. Sale reversal restores stock exactly once.
13. Import preview never writes data.
14. Failed import writes nothing.
15. Duplicate SKU/barcode handling is deterministic and reported.
16. No API in the new module falls back to the legacy product tables.
17. No startup migration seeds test products.
18. No frontend compatibility script can recreate deleted products.
