BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS primary_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_photos JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);
CREATE INDEX IF NOT EXISTS products_primary_branch_id_idx ON products (primary_branch_id);

UPDATE products
SET product_photos = CASE
  WHEN COALESCE(image_url, '') <> '' THEN jsonb_build_array(image_url)
  ELSE '[]'::jsonb
END
WHERE product_photos IS NULL OR product_photos = '[]'::jsonb;

UPDATE products
SET primary_branch_id = (
  SELECT ps.branch_id
  FROM product_stock ps
  WHERE ps.product_id = products.id
  ORDER BY ps.current_stock DESC, ps.branch_id ASC
  LIMIT 1
)
WHERE primary_branch_id IS NULL;

ALTER TABLE products
  ALTER COLUMN product_photos SET DEFAULT '[]'::jsonb,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN tax_inclusive SET DEFAULT FALSE;

COMMIT;
