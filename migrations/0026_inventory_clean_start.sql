BEGIN;

-- ONE-TIME INVENTORY CLEANUP.
-- Approved production cutover: archive first, then remove the stale/test
-- product + inventory catalog rows. Sales, customers, suppliers, users,
-- branches and financial documents are intentionally untouched.
--
-- The archive tables are permanent and provide a rollback/reference copy.

CREATE TABLE IF NOT EXISTS public.products_archived_20260824 AS
SELECT * FROM public.products WHERE FALSE;

CREATE TABLE IF NOT EXISTS public.product_stock_archived_20260824 AS
SELECT * FROM public.product_stock WHERE FALSE;

CREATE TABLE IF NOT EXISTS public.inventory_products_v2_archived_20260824 AS
SELECT * FROM public.inventory_products_v2 WHERE FALSE;

CREATE TABLE IF NOT EXISTS public.inventory_stock_v2_archived_20260824 AS
SELECT * FROM public.inventory_stock_v2 WHERE FALSE;

CREATE TABLE IF NOT EXISTS public.inventory_movements_v2_archived_20260824 AS
SELECT * FROM public.inventory_movements_v2 WHERE FALSE;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    INSERT INTO public.products_archived_20260824
    SELECT p.* FROM public.products p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products_archived_20260824 a WHERE a.id = p.id
    );
  END IF;

  IF to_regclass('public.product_stock') IS NOT NULL THEN
    INSERT INTO public.product_stock_archived_20260824
    SELECT s.* FROM public.product_stock s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_stock_archived_20260824 a WHERE a.id = s.id
    );
  END IF;

  IF to_regclass('public.inventory_products_v2') IS NOT NULL THEN
    INSERT INTO public.inventory_products_v2_archived_20260824
    SELECT p.* FROM public.inventory_products_v2 p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory_products_v2_archived_20260824 a WHERE a.id = p.id
    );
  END IF;

  IF to_regclass('public.inventory_stock_v2') IS NOT NULL THEN
    INSERT INTO public.inventory_stock_v2_archived_20260824
    SELECT s.* FROM public.inventory_stock_v2 s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory_stock_v2_archived_20260824 a
      WHERE a.product_id = s.product_id AND a.branch_id = s.branch_id
    );
  END IF;

  IF to_regclass('public.inventory_movements_v2') IS NOT NULL THEN
    INSERT INTO public.inventory_movements_v2_archived_20260824
    SELECT m.* FROM public.inventory_movements_v2 m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory_movements_v2_archived_20260824 a WHERE a.id = m.id
    );
  END IF;
END $$;

-- Remove child inventory records first so product deletion cannot leave
-- orphaned stock or movement records.
DO $$
BEGIN
  IF to_regclass('public.inventory_movements_v2') IS NOT NULL THEN
    DELETE FROM public.inventory_movements_v2;
  END IF;
  IF to_regclass('public.inventory_stock_v2') IS NOT NULL THEN
    DELETE FROM public.inventory_stock_v2;
  END IF;
  IF to_regclass('public.inventory_products_v2') IS NOT NULL THEN
    DELETE FROM public.inventory_products_v2;
  END IF;

  IF to_regclass('public.product_stock') IS NOT NULL THEN
    DELETE FROM public.product_stock;
  END IF;
  IF to_regclass('public.products') IS NOT NULL THEN
    DELETE FROM public.products;
  END IF;
END $$;

-- Canonical/rebuild tables from earlier experiments are also cleared so no
-- alternate inventory source can continue to feed the application.
DO $$
BEGIN
  IF to_regclass('public.inventory_canonical') IS NOT NULL THEN
    DELETE FROM public.inventory_canonical;
  END IF;
  IF to_regclass('public.products_canonical') IS NOT NULL THEN
    DELETE FROM public.products_canonical;
  END IF;
END $$;

DO $$
DECLARE
  n BIGINT;
BEGIN
  SELECT COALESCE((SELECT COUNT(*) FROM public.products), 0)
       + COALESCE((SELECT COUNT(*) FROM public.product_stock), 0)
       + COALESCE((SELECT COUNT(*) FROM public.inventory_products_v2), 0)
       + COALESCE((SELECT COUNT(*) FROM public.inventory_stock_v2), 0)
       + COALESCE((SELECT COUNT(*) FROM public.inventory_movements_v2), 0)
  INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Inventory clean start failed: % legacy inventory rows remain', n;
  END IF;
END $$;

COMMIT;
