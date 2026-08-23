BEGIN;

CREATE TABLE IF NOT EXISTS public.products_canonical (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_canonical (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL UNIQUE REFERENCES public.products_canonical(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reserved_quantity NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  reorder_threshold NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_canonical_product ON public.inventory_canonical(product_id);

CREATE OR REPLACE FUNCTION public.create_canonical_product_with_inventory(
  p_name TEXT, p_sku TEXT, p_price NUMERIC, p_category TEXT, p_initial_quantity NUMERIC
) RETURNS public.products_canonical
LANGUAGE plpgsql AS $$
DECLARE v_product public.products_canonical;
BEGIN
  INSERT INTO public.products_canonical(name,sku,price,category)
  VALUES (TRIM(p_name),TRIM(p_sku),COALESCE(p_price,0),NULLIF(TRIM(p_category),''))
  RETURNING * INTO v_product;
  INSERT INTO public.inventory_canonical(product_id,quantity_on_hand)
  VALUES (v_product.id, GREATEST(COALESCE(p_initial_quantity,0),0));
  RETURN v_product;
END;
$$;

-- New catalogue intentionally starts empty. No legacy rows are copied.
COMMIT;
