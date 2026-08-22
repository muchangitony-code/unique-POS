BEGIN;

-- Restore branch stock for products whose bulk-import opening stock was captured
-- in import history but was not propagated into product_stock.
-- Non-destructive: existing branch quantities are never reduced by this repair.

WITH latest_import AS (
  SELECT DISTINCT ON (r.product_id)
    r.product_id,
    NULLIF(TRIM(r.normalized_data->>'current_stock'), '')::numeric AS opening_stock,
    j.options
  FROM product_import_rows r
  JOIN product_import_jobs j ON j.id = r.job_id
  WHERE r.product_id IS NOT NULL
    AND r.normalized_data IS NOT NULL
    AND r.normalized_data ? 'current_stock'
  ORDER BY r.product_id, r.id DESC
),
resolved AS (
  SELECT
    p.id AS product_id,
    li.opening_stock,
    COALESCE(
      CASE
        WHEN (li.options->>'branch_id') ~ '^\\d+$'
          THEN (li.options->>'branch_id')::integer
        ELSE NULL
      END,
      p.primary_branch_id,
      (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)
    ) AS branch_id
  FROM products p
  JOIN latest_import li ON li.product_id = p.id
  WHERE COALESCE(li.opening_stock, 0) > 0
)
INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
SELECT r.product_id, r.branch_id, r.opening_stock, COALESCE(p.min_stock, 0)
FROM resolved r
JOIN products p ON p.id = r.product_id
WHERE r.branch_id IS NOT NULL
ON CONFLICT (branch_id, product_id)
DO UPDATE SET
  current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
  min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

-- Recalculate the legacy product total from the branch-level source of truth.
UPDATE products p
SET current_stock = COALESCE((
  SELECT SUM(ps.current_stock)
  FROM product_stock ps
  WHERE ps.product_id = p.id
), 0)
WHERE EXISTS (
  SELECT 1 FROM product_stock ps WHERE ps.product_id = p.id
);

-- Every active product gets a branch stock row, even when its quantity is zero,
-- so Inventory and Counter use the same branch-level catalogue.
INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
SELECT
  p.id,
  COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)),
  0,
  COALESCE(p.min_stock, 0)
FROM products p
WHERE COALESCE(p.status, 'active') = 'active'
  AND COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_stock ps
    WHERE ps.product_id = p.id
      AND ps.branch_id = COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1))
  )
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- Future bulk/product imports must not strand a positive products.current_stock
-- value outside the branch-level inventory table. Seed only when there is no
-- positive branch stock already, so legitimate multi-branch stock is preserved.
CREATE OR REPLACE FUNCTION seed_product_stock_from_legacy_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_branch_id INTEGER;
BEGIN
  IF COALESCE(NEW.current_stock, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM product_stock ps
    WHERE ps.product_id = NEW.id
      AND ps.current_stock > 0
  ) THEN
    RETURN NEW;
  END IF;

  target_branch_id := COALESCE(
    NEW.primary_branch_id,
    (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)
  );

  IF target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
  VALUES (NEW.id, target_branch_id, NEW.current_stock, COALESCE(NEW.min_stock, 0))
  ON CONFLICT (branch_id, product_id)
  DO UPDATE SET
    current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
    min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_product_stock_from_legacy_total_trigger ON products;
CREATE TRIGGER seed_product_stock_from_legacy_total_trigger
AFTER INSERT OR UPDATE OF current_stock ON products
FOR EACH ROW
EXECUTE FUNCTION seed_product_stock_from_legacy_total();

COMMIT;
