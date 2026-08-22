BEGIN;

-- Production clean-start reset for the Inventory / Products catalogue.
--
-- This migration intentionally removes EVERY product and its branch stock,
-- while preserving the database schema, application logic, branches, users,
-- business settings, brands, categories, permissions and other POS modules.
-- It is therefore safe for a fresh product upload without rebuilding the POS.

-- Product stock must be removed before products because product_stock references products.
DELETE FROM public.product_stock;

-- Remove every product record, including archived products.
DELETE FROM public.products;

-- Reset the identity counters so the fresh catalogue starts cleanly.
ALTER SEQUENCE IF EXISTS public.product_stock_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.products_id_seq RESTART WITH 1;

-- Defensive verification: the migration must never report success while
-- catalogue records remain.
DO $$
DECLARE
  product_count BIGINT;
  stock_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO product_count FROM public.products;
  SELECT COUNT(*) INTO stock_count FROM public.product_stock;

  IF product_count <> 0 OR stock_count <> 0 THEN
    RAISE EXCEPTION
      'Production product reset failed: products=% product_stock=%',
      product_count, stock_count;
  END IF;
END;
$$;

COMMIT;
