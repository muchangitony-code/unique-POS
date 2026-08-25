BEGIN;

-- FRESH CATALOG START
--
-- The operator has explicitly chosen to abandon the legacy product catalogue
-- and start with a new catalogue. This migration removes catalogue/inventory
-- rows only. POS transactions, users, branches, settings, customers,
-- suppliers and financial records are intentionally left intact.
--
-- No backup/archive is created by this migration. No product data is fabricated.

CREATE TABLE IF NOT EXISTS public.inventory_products_v2 (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  unit TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  supplier TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_v2 (
  product_id BIGINT NOT NULL REFERENCES public.inventory_products_v2(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements_v2 (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.inventory_products_v2(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_delta NUMERIC(14,3) NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remove every legacy/current catalogue source so there is exactly one clean
-- starting point for the new catalogue import.
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
  IF to_regclass('public.inventory_canonical') IS NOT NULL THEN
    DELETE FROM public.inventory_canonical;
  END IF;
  IF to_regclass('public.products_canonical') IS NOT NULL THEN
    DELETE FROM public.products_canonical;
  END IF;
END $$;

DO $$
DECLARE
  remaining BIGINT := 0;
BEGIN
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.products), 0) +
    COALESCE((SELECT COUNT(*) FROM public.product_stock), 0) +
    COALESCE((SELECT COUNT(*) FROM public.inventory_products_v2), 0) +
    COALESCE((SELECT COUNT(*) FROM public.inventory_stock_v2), 0) +
    COALESCE((SELECT COUNT(*) FROM public.inventory_movements_v2), 0)
  INTO remaining;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Fresh catalogue reset failed: % inventory rows remain', remaining;
  END IF;
END $$;

SELECT setval(pg_get_serial_sequence('public.inventory_products_v2', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('public.inventory_movements_v2', 'id'), 1, false);

COMMIT;
