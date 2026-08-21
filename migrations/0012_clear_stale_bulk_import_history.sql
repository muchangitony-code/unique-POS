BEGIN;

-- Production cleanup: remove stale bulk-import job/error history only.
-- This does NOT touch the products table or product_stock, so every product
-- that was successfully imported remains intact.
--
-- The previous test/import cycle produced historical error rows that later
-- became successful product records. Keeping those old import rows makes the
-- Bulk Import screen continue reporting obsolete errors. Reset the import
-- history so the interface starts clean while preserving the live catalogue.

TRUNCATE TABLE
  public.product_import_rows,
  public.product_import_jobs
RESTART IDENTITY CASCADE;

COMMIT;
