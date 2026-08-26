BEGIN;

-- Explicit product-channel availability for Counter/POS sales.
ALTER TABLE public.inventory_products_v2
  ADD COLUMN IF NOT EXISTS pos_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing catalogue products remain sellable through Counter/POS.
UPDATE public.inventory_products_v2
SET pos_enabled = TRUE
WHERE pos_enabled IS DISTINCT FROM TRUE;

COMMIT;
