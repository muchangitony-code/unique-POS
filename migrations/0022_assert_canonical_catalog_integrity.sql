BEGIN;

-- Fail the deployment instead of silently leaving an empty/partial catalogue.
DO $$
DECLARE
  product_count INTEGER;
  stock_count INTEGER;
  category_count INTEGER;
  missing_sample INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count
  FROM public.products
  WHERE product_code LIKE 'STK-%';

  SELECT COUNT(*) INTO stock_count
  FROM public.product_stock ps
  JOIN public.products p ON p.id = ps.product_id
  WHERE p.product_code LIKE 'STK-%';

  SELECT COUNT(*) INTO category_count
  FROM public.categories
  WHERE lower(name) IN (
    'solar panels','inverters','batteries','accessories',
    'cables','electricals','others'
  );

  SELECT COUNT(*) INTO missing_sample
  FROM (VALUES
    ('STK-001', '5W LED Bulbs Hommei', 50.00::numeric, 23),
    ('STK-157', '5W Solar Bulb', 100.00::numeric, 12),
    ('STK-188', 'Evincable Single 1.5mm Green/m', 30.00::numeric, 78),
    ('STK-272', 'Hammers', 500.00::numeric, 4)
  ) AS expected(sku, product_name, selling_price, opening_stock)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE lower(p.product_code) = lower(expected.sku)
      AND p.product_name = expected.product_name
      AND p.selling_price = expected.selling_price
      AND p.current_stock = expected.opening_stock
  );

  IF product_count <> 272 THEN
    RAISE EXCEPTION 'CATALOG_INTEGRITY_FAILED: expected 272 canonical STK products, found %', product_count;
  END IF;

  IF stock_count <> 272 THEN
    RAISE EXCEPTION 'CATALOG_INTEGRITY_FAILED: expected 272 canonical branch-stock rows, found %', stock_count;
  END IF;

  IF category_count <> 7 THEN
    RAISE EXCEPTION 'CATALOG_INTEGRITY_FAILED: expected 7 POS categories, found %', category_count;
  END IF;

  IF missing_sample <> 0 THEN
    RAISE EXCEPTION 'CATALOG_INTEGRITY_FAILED: canonical sample records do not match source data';
  END IF;
END $$;

COMMIT;
