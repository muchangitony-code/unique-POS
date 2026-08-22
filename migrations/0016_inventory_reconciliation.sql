BEGIN;

-- Production inventory reconciliation.
-- The authoritative stock value is branch-level product_stock.
-- Repair only inconsistent rows; never reduce a positive quantity.

INSERT INTO branches (name, code, is_active)
VALUES ('Main Branch', 'MAIN', TRUE)
ON CONFLICT (code) DO NOTHING;

WITH main_branch AS (
  SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id LIMIT 1
),
legacy_positive AS (
  SELECT p.id AS product_id, p.current_stock, COALESCE(p.min_stock, 0) AS min_stock
  FROM products p
  WHERE COALESCE(p.current_stock, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM product_stock ps
      WHERE ps.product_id = p.id
        AND COALESCE(ps.current_stock, 0) > 0
    )
)
INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock, created_at)
SELECT mb.id, lp.product_id, lp.current_stock, lp.min_stock, NOW()
FROM legacy_positive lp
CROSS JOIN main_branch mb
ON CONFLICT (branch_id, product_id)
DO UPDATE SET
  current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
  min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

-- If the MAIN row is zero but the legacy total is positive and there is no
-- positive stock anywhere else, repair the MAIN row. This avoids changing
-- legitimate multi-branch stock allocations.
WITH main_branch AS (
  SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id LIMIT 1
),
repairable AS (
  SELECT p.id AS product_id, p.current_stock, COALESCE(p.min_stock, 0) AS min_stock
  FROM products p
  JOIN product_stock ps ON ps.product_id = p.id
  CROSS JOIN main_branch mb
  WHERE ps.branch_id = mb.id
    AND COALESCE(ps.current_stock, 0) = 0
    AND COALESCE(p.current_stock, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM product_stock other
      WHERE other.product_id = p.id
        AND COALESCE(other.current_stock, 0) > 0
    )
)
UPDATE product_stock ps
SET current_stock = r.current_stock,
    min_stock = GREATEST(COALESCE(ps.min_stock, 0), r.min_stock)
FROM repairable r
JOIN main_branch mb ON TRUE
WHERE ps.product_id = r.product_id
  AND ps.branch_id = mb.id;

-- Every active product must have a MAIN branch row so Inventory and Counter
-- have the same branch catalogue even when its quantity is legitimately zero.
INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock, created_at)
SELECT mb.id, p.id, 0, COALESCE(p.min_stock, 0), NOW()
FROM products p
CROSS JOIN (SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id LIMIT 1) mb
WHERE COALESCE(p.status, 'active') = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM product_stock ps
    WHERE ps.branch_id = mb.id AND ps.product_id = p.id
  )
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- Recalculate the legacy aggregate from branch stock after reconciliation.
UPDATE products p
SET current_stock = COALESCE((
  SELECT SUM(ps.current_stock)
  FROM product_stock ps
  WHERE ps.product_id = p.id
), 0)
WHERE EXISTS (
  SELECT 1 FROM product_stock ps WHERE ps.product_id = p.id
);

-- Keep product_stock and products.current_stock synchronized for future writes.
CREATE OR REPLACE FUNCTION sync_product_legacy_stock(product_id_input INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE products p
  SET current_stock = COALESCE((
    SELECT SUM(ps.current_stock)
    FROM product_stock ps
    WHERE ps.product_id = p.id
  ), 0)
  WHERE p.id = product_id_input
    AND p.current_stock IS DISTINCT FROM COALESCE((
      SELECT SUM(ps.current_stock)
      FROM product_stock ps
      WHERE ps.product_id = p.id
    ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION product_stock_sync_legacy_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_product_id INTEGER;
BEGIN
  affected_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
  PERFORM sync_product_legacy_stock(affected_product_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_stock_sync_legacy_total_trigger ON product_stock;
CREATE TRIGGER product_stock_sync_legacy_total_trigger
AFTER INSERT OR UPDATE OF current_stock OR DELETE ON product_stock
FOR EACH ROW
EXECUTE FUNCTION product_stock_sync_legacy_total();

COMMIT;
