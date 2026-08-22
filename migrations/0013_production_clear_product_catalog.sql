BEGIN;

-- Production clean-start reset for the Inventory / Products catalogue.
-- Removes EVERY product and its branch stock while preserving the POS schema,
-- application logic, users, branches, settings, categories, brands, permissions
-- and all other modules. This prepares the catalogue for a fresh product upload.

DELETE FROM public.product_stock;
DELETE FROM public.products;

ALTER SEQUENCE IF EXISTS public.product_stock_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.products_id_seq RESTART WITH 1;

-- Never commit a partial reset silently.
DO $$
DECLARE
  product_count BIGINT;
  stock_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO product_count FROM public.products;
  SELECT COUNT(*) INTO stock_count FROM public.product_stock;

  IF product_count <> 0 OR stock_count <> 0 THEN
    RAISE EXCEPTION
      'Production product reset failed: products=% product_stock=%',
      product_count, stock_count;
  END IF;
END;
$$;

COMMIT;
