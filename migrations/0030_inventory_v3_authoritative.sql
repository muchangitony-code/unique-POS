BEGIN;

-- Inventory V3: isolated, authoritative stock subsystem.
CREATE TABLE IF NOT EXISTS inventory_products_v3 (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  vat_rate NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0),
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  supplier_id BIGINT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_products_v3_sku_uq UNIQUE (sku),
  CONSTRAINT inventory_products_v3_barcode_uq UNIQUE NULLS NOT DISTINCT (barcode)
);

CREATE TABLE IF NOT EXISTS inventory_stock_v3 (
  product_id BIGINT NOT NULL REFERENCES inventory_products_v3(id) ON DELETE RESTRICT,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, branch_id),
  CHECK (reserved_quantity <= quantity_on_hand)
);

CREATE TABLE IF NOT EXISTS inventory_movements_v3 (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES inventory_products_v3(id) ON DELETE RESTRICT,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'OPENING_BALANCE','PURCHASE_RECEIPT','SALE','SALE_REVERSAL',
    'ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_OUT','TRANSFER_IN',
    'CUSTOMER_RETURN','SUPPLIER_RETURN'
  )),
  quantity_before NUMERIC(14,3) NOT NULL,
  quantity_change NUMERIC(14,3) NOT NULL CHECK (quantity_change <> 0),
  quantity_after NUMERIC(14,3) NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_v3_after_ck CHECK (quantity_after = quantity_before + quantity_change)
);

CREATE INDEX IF NOT EXISTS inventory_stock_v3_branch_idx ON inventory_stock_v3(branch_id, product_id);
CREATE INDEX IF NOT EXISTS inventory_movements_v3_product_branch_created_idx ON inventory_movements_v3(product_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_v3_reference_idx ON inventory_movements_v3(reference_type, reference_id);

CREATE OR REPLACE FUNCTION inventory_v3_touch_product()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS inventory_products_v3_touch ON inventory_products_v3;
CREATE TRIGGER inventory_products_v3_touch BEFORE UPDATE ON inventory_products_v3
FOR EACH ROW EXECUTE FUNCTION inventory_v3_touch_product();

COMMIT;
