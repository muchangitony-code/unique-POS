# Inventory / Product Module — Clean Rebuild

## Objective
Replace the unstable legacy Product/Inventory presentation and compatibility behaviour with one deterministic module. The module must never restore stale catalogue data after an empty state, refresh, deploy, or restart.

## Non-negotiable rules
- One authoritative product catalogue.
- No frontend fetch interception for product APIs.
- No automatic catalogue restoration or seeding after startup.
- Empty catalogue is a valid production state.
- Product writes are explicit and transactional.
- Inventory is branch-scoped.
- Stock changes are represented by auditable movements.
- Historical sales/invoice records are protected.
- Imports are previewed and validated before commit.
- Duplicate SKU/barcode handling is deterministic.
- Cache invalidation occurs only after a successful write transaction.

## Product record
SKU/product code, barcode, name, category, brand, unit, cost price, selling price, VAT rate, reorder level, supplier, description, active status, timestamps.

## Inventory record
Product ID, branch ID, quantity on hand, reorder level, last updated timestamp.

## Stock movement
Product ID, branch ID, movement type, quantity delta, reference type, reference ID, reason, user ID, timestamp.

Movement types include opening balance, purchase, sale, sale reversal, adjustment increase, adjustment decrease, transfer out, transfer in, and return.

## UI
- Product list with search, filters, pagination and stock status.
- Add/edit product.
- Product details.
- Branch stock view.
- Stock adjustment.
- Stock movement history.
- Import wizard with file validation, mapping, preview and commit.
- Export.
- Empty-state screen that does not trigger any automatic recovery.

## API ownership
The new module must own its product/inventory API calls and state. It must not monkey-patch `window.fetch`, global click handlers, MutationObserver, or unrelated POS modules.

## Cutover
The existing production clean-slate migration remains responsible for removing stale catalogue data. The rebuild must not add test products. Once the new module is deployed, the expected initial catalogue is zero products until the approved stock master is imported.

## Acceptance tests
1. Empty catalogue remains empty after hard refresh.
2. Empty catalogue remains empty after logout/login.
3. Empty catalogue remains empty after application restart/deploy.
4. Adding one product persists exactly one product.
5. Refresh does not duplicate products.
6. Editing a product does not create a second product.
7. Deactivating a product does not resurrect it.
8. Stock adjustment changes branch stock and creates exactly one movement.
9. Sale deduction changes stock and creates the correct movement.
10. Sale reversal restores stock exactly once.
11. Import preview never writes data.
12. Failed import writes nothing.
13. Duplicate SKU/barcode behaviour is deterministic and reported to the user.
14. Historical transaction records remain readable.
15. Other POS modules continue to work without product-module compatibility patches.
