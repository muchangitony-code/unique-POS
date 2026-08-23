BEGIN;

-- Clean Product / Inventory foundation.
-- This migration adds the authoritative branch inventory and immutable stock
-- movement ledger without deleting protected historical transaction data.

CREATE TABLE IF NOT EXISTS public.product_stock_ledger (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id),
  branch_id BIGINT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening_balance', 'purchase', 'sale', 'sale_reversal',
    'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'return'
  )),
  quantity_delta NUMERIC(18,3) NOT NULL CHECK (quantity_delta <> 0),
  reference_type TEXT,
  reference_id BIGINT,
  reason TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_stock_ledger_product_branch
  ON public.product_stock_ledger(product_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_stock_ledger_reference
  ON public.product_stock_ledger(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS public.product_branch_inventory (
  product_id BIGINT NOT NULL REFERENCES public.products(id),
  branch_id BIGINT NOT NULL,
  quantity_on_hand NUMERIC(18,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(18,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id),
  CHECK (reorder_level >= 0)
);

CREATE INDEX IF NOT EXISTS idx_product_branch_inventory_branch
  ON public.product_branch_inventory(branch_id, product_id);

-- Never seed products here. Production may legitimately start with zero rows.

COMMIT;
