BEGIN;

-- Completely independent catalogue for the rebuilt Product/Inventory module.
-- No legacy product/inventory rows are copied or referenced.

CREATE TABLE IF NOT EXISTS public.inventory_products_v2 (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  cost_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  vat_rate NUMERIC(7,3) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0),
  reorder_level NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  supplier TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_stock_v2 (
  product_id BIGINT NOT NULL REFERENCES public.inventory_products_v2(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  quantity_on_hand NUMERIC(18,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements_v2 (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.inventory_products_v2(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening_balance','purchase','sale','sale_reversal',
    'adjustment_in','adjustment_out','transfer_in','transfer_out','return'
  )),
  quantity_delta NUMERIC(18,3) NOT NULL CHECK (quantity_delta <> 0),
  reference_type TEXT,
  reference_id BIGINT,
  reason TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_v2_branch
  ON public.inventory_stock_v2(branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_v2_product_branch
  ON public.inventory_movements_v2(product_id, branch_id, created_at DESC);

-- The new catalogue is deliberately empty. No INSERT/seed/recovery operation belongs here.

COMMIT;
