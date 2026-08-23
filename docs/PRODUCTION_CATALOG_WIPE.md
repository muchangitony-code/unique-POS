# Production catalogue wipe

This release intentionally performs a one-time clean slate of the product/inventory catalogue.

On migration, `0023_production_catalog_wipe.sql`:

- removes all registered products;
- removes disposable inventory rows and stock movement/adjustment/transfer/barcode state;
- resets product and product-stock sequences;
- preserves users, branches, settings, customers and transactional/history tables;
- aborts and rolls back if a product is referenced by a protected transactional/history table.

After deployment, the expected catalogue state is zero products and zero product stock. No new catalogue data is seeded by this release. The next step is to import the verified real stock master list.
