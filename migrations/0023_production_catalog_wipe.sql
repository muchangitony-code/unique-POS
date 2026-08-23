BEGIN;

-- ONE-TIME PRODUCTION CLEAN SLATE.
-- Delete the currently registered product catalogue and disposable inventory
-- state so a verified, real stock list can be loaded from zero.
--
-- Deliberately preserve customers, branches, users, settings and transactional
-- history. If any product is referenced by a protected transactional table,
-- abort the entire migration instead of cascading into sales/invoices/purchases.

DO $$
DECLARE
  ref RECORD;
  ref_count BIGINT;
  blocking TEXT := '';
  child_tables TEXT[] := ARRAY[
    'product_stock',
    'stock',
    'stock_adjustments',
    'stock_movements',
    'stock_transfers',
    'barcode_labels'
  ];
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
    IF NOT (ref.table_name = ANY(child_tables)) THEN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I child JOIN public.products p ON p.id = child.%I',
        ref.table_name,
        ref.column_name
      ) INTO ref_count;

      IF ref_count > 0 THEN
        blocking := blocking || format(
          '%s.%s=%s; ', ref.table_name, ref.column_name, ref_count
        );
      END IF;
    END IF;
  END LOOP;

  IF blocking <> '' THEN
    RAISE EXCEPTION
      'PRODUCTION_CATALOG_WIPE_ABORTED: products are referenced by protected transactional/history records: % No data was deleted.',
      blocking;
  END IF;
END $$;

-- Remove disposable inventory relationships first.
DO $$
DECLARE
  tbl TEXT;
  exists_flag BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'product_stock',
    'stock',
    'stock_adjustments',
    'stock_movements',
    'stock_transfers',
    'barcode_labels'
  ]
  LOOP
    SELECT to_regclass('public.' || tbl) IS NOT NULL INTO exists_flag;
    IF exists_flag THEN
      EXECUTE format('DELETE FROM public.%I', tbl);
    END IF;
  END LOOP;
END $$;

DELETE FROM public.products;

ALTER SEQUENCE IF EXISTS public.products_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.product_stock_id_seq RESTART WITH 1;

-- Hard verification: the catalogue and disposable stock state must be empty.
DO $$
DECLARE
  product_count BIGINT;
  product_stock_count BIGINT := 0;
BEGIN
  SELECT COUNT(*) INTO product_count FROM public.products;

  IF to_regclass('public.product_stock') IS NOT NULL THEN
    SELECT COUNT(*) INTO product_stock_count FROM public.product_stock;
  END IF;

  IF product_count <> 0 OR product_stock_count <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION_CATALOG_WIPE_FAILED: products=% product_stock=%',
      product_count, product_stock_count;
  END IF;
END $$;

COMMIT;
