-- One-time production clean-start reset.
-- This migration is intentionally separate from 0013 so an already-applied
-- migration history cannot prevent the clean catalog from being executed.
-- It removes all product records and their branch inventory records only.
-- Users, customers, branches, settings, permissions and POS code are untouched.

DELETE FROM public.product_stock;
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
    RAISE EXCEPTION 'Clean catalog reset failed: products=% product_stock=%', product_count, stock_count;
  END IF;
END;
$$;
