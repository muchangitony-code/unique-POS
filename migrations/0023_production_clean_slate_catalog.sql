BEGIN;

-- Production clean-slate catalogue cutover.
-- Runs after the legacy catalogue/import migrations so that any stale
-- test products restored by earlier migrations are removed before go-live.
-- Preserve users, branches, customers, settings, permissions and transaction
-- history. Never cascade into transactional tables.

DO $$
DECLARE
  ref RECORD;
  ref_count BIGINT;
BEGIN
  FOR ref IN
    SELECT child.relname AS table_name,
           child_col.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute child_col
      ON child_col.attrelid = child.oid
     AND child_col.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND parent.relname = 'products'
      AND child.relnamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I child JOIN public.products p ON p.id = child.%I',
      ref.table_name, ref.column_name
    ) INTO ref_count;

    IF ref_count > 0
       AND ref.table_name NOT IN ('product_stock', 'stock', 'stock_adjustments', 'stock_movements', 'barcode_labels') THEN
      RAISE EXCEPTION
        'CATALOG_CLEAN_SLATE_BLOCKED: products are referenced by protected table %.%. No data was deleted.',
        ref.table_name, ref.column_name;
    END IF;
  END LOOP;
END $$;

DELETE FROM public.product_stock;
DELETE FROM public.stock;
DELETE FROM public.stock_adjustments;
DELETE FROM public.stock_movements;
DELETE FROM public.barcode_labels;
DELETE FROM public.products;

ALTER SEQUENCE IF EXISTS public.product_stock_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.products_id_seq RESTART WITH 1;

DO $$
DECLARE
  product_count BIGINT;
  stock_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO product_count FROM public.products;
  SELECT COUNT(*) INTO stock_count FROM public.product_stock;

  IF product_count <> 0 OR stock_count <> 0 THEN
    RAISE EXCEPTION 'CATALOG_CLEAN_SLATE_FAILED: products=% product_stock=%', product_count, stock_count;
  END IF;
END $$;

COMMIT;
