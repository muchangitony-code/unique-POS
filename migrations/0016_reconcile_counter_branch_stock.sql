BEGIN;

-- Reconcile branch stock from the existing import ledger. Non-destructive:
-- only restore positive opening stock when branch stock is missing or lower.
WITH latest_import AS (
  SELECT DISTINCT ON (r.product_id)
    r.product_id,
    CASE
      WHEN trim(COALESCE(r.normalized_data->>'current_stock','')) ~ '^[0-9]+([.][0-9]+)?$'
        THEN (trim(r.normalized_data->>'current_stock'))::numeric
      ELSE 0
    END AS opening_stock,
    j.options
  FROM product_import_rows r
  JOIN product_import_jobs j ON j.id = r.job_id
  WHERE r.product_id IS NOT NULL
    AND r.normalized_data IS NOT NULL
    AND r.normalized_data ? 'current_stock'
  ORDER BY r.product_id, r.id DESC
), resolved AS (
  SELECT li.product_id, li.opening_stock,
    COALESCE(
      CASE WHEN trim(COALESCE(li.options->>'branch_id','')) ~ '^[0-9]+$'
        THEN (li.options->>'branch_id')::integer ELSE NULL END,
      p.primary_branch_id,
      (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)
    ) AS branch_id
  FROM latest_import li JOIN products p ON p.id = li.product_id
  WHERE li.opening_stock > 0
)
INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
SELECT r.product_id, r.branch_id, r.opening_stock, COALESCE(p.min_stock,0)
FROM resolved r JOIN products p ON p.id = r.product_id
WHERE r.branch_id IS NOT NULL
ON CONFLICT (branch_id, product_id) DO UPDATE SET
  current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
  min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

-- Restore positive legacy stock to the primary/first active branch when no
-- import row supplied a branch. Never reduce existing branch stock.
INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
SELECT p.id,
  COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)),
  GREATEST(COALESCE(p.current_stock,0),0), COALESCE(p.min_stock,0)
FROM products p
WHERE COALESCE(p.current_stock,0) > 0
  AND COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)) IS NOT NULL
ON CONFLICT (branch_id, product_id) DO UPDATE SET
  current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
  min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

-- Products.current_stock is an aggregate only; branch stock is the source of truth.
UPDATE products p SET current_stock = COALESCE((SELECT SUM(ps.current_stock) FROM product_stock ps WHERE ps.product_id = p.id),0);

-- Ensure every active product has a branch stock row so Counter and Inventory
-- cannot diverge because one product lacks a branch-level record.
INSERT INTO product_stock (product_id, branch_id, current_stock, min_stock)
SELECT p.id,
  COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)),
  0, COALESCE(p.min_stock,0)
FROM products p
WHERE COALESCE(p.status,'active') = 'active'
  AND COALESCE(p.primary_branch_id, (SELECT b.id FROM branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)) IS NOT NULL
ON CONFLICT (branch_id, product_id) DO NOTHING;

COMMIT;
