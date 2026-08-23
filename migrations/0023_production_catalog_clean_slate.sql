BEGIN;

-- PRODUCTION CATALOG CLEAN SLATE
-- Intentionally removes ALL product/catalog/stock data only.
-- Does NOT delete customers, branches, users, settings, or documents.
-- This migration is deliberately independent of the old 272-item test catalogue.

DO $$
BEGIN
  -- If transactional rows reference products without cascade, stop safely.
  IF EXISTS (SELECT 1 FROM public.sale_items LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.purchase_items LIMIT 1) THEN
    RAISE EXCEPTION 'CATALOG_CLEAN_SLATE_ABORTED: transactional product rows exist; refusing destructive delete. Run the supported production reset instead.';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Some installations use different document-line table names; the reset
    -- script remains the authoritative protected path for those installations.
    NULL;
END $$;

-- Delete disposable stock/inventory records first.
DO $$
BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.stock_movements RESTART IDENTITY CASCADE';
  END IF;
  IF to_regclass('public.inventory_transactions') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.inventory_transactions RESTART IDENTITY CASCADE';
  END IF;
  IF to_regclass('public.product_stock') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.product_stock RESTART IDENTITY CASCADE';
  END IF;
  IF to_regclass('public.inventory') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.inventory RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Remove the entire product catalogue, including old/test STK records.
TRUNCATE TABLE public.products RESTART IDENTITY CASCADE;

-- Product categories are catalogue metadata and will be recreated cleanly by
-- the new stock import flow. Do not touch branches/users/customers/settings.
DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.categories RESTART IDENTITY CASCADE';
  END IF;
END $$;

COMMIT;
