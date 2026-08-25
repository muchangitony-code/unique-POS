BEGIN;

-- CLEAN CATALOG INITIALIZATION
--
-- The historical recovery archive is empty in the target environment and the
-- operator has explicitly chosen to start the catalogue again from a clean
-- state. This migration only establishes the current V2 inventory schema.
--
-- It deliberately does not fabricate products and does not delete existing
-- catalogue or transactional data. The new catalogue is loaded through the
-- normal product/bulk-import flow after deployment.

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

COMMIT;
