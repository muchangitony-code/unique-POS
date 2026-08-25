BEGIN;

-- Repair opening stock after catalogue recovery. The catalogue may have been
-- restored while branch stock rows were still zero. Use the retained import
-- ledger as the recovery source and never reduce stock that is already positive.
-- Accept both normalized importer fields and original raw headers.

DO $$
BEGIN
  IF to_regclass('public.product_import_rows') IS NOT NULL
     AND to_regclass('public.product_stock') IS NOT NULL THEN

    WITH ledger AS (
      SELECT
        r.id,
        r.product_id,
        lower(trim(COALESCE(
          r.normalized_data->>'product_code',
          r.raw_data->>'Product Code',
          r.raw_data->>'SKU',
          r.raw_data->>'product_code',
          r.raw_data->>'sku'
        ))) AS code_key,
        lower(trim(COALESCE(
          r.normalized_data->>'product_name',
          r.raw_data->>'Product Name',
          r.raw_data->>'product_name',
          r.raw_data->>'name'
        ))) AS name_key,
        j.options,
        GREATEST(COALESCE((
          SELECT CASE
            WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric
            ELSE NULL
          END
          FROM jsonb_each_text(
            COALESCE(r.normalized_data, '{}'::jsonb) || COALESCE(r.raw_data, '{}'::jsonb)
          ) e
          WHERE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') IN
            ('currentstock','openingstock','stock','qty','quantity')
          ORDER BY CASE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g')
            WHEN 'currentstock' THEN 1
            WHEN 'openingstock' THEN 2
            WHEN 'stock' THEN 3
            WHEN 'qty' THEN 4
            WHEN 'quantity' THEN 5
            ELSE 99 END
          LIMIT 1
        ), 0), 0) AS opening_stock
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.normalized_data IS NOT NULL OR r.raw_data IS NOT NULL
    ),
    matched AS (
      SELECT
        p.id AS product_id,
        l.opening_stock,
        l.options,
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY l.id DESC) AS rn
      FROM ledger l
      JOIN public.products p
        ON (l.product_id IS NOT NULL AND l.product_id = p.id)
        OR (l.product_id IS NULL AND l.code_key IS NOT NULL AND lower(p.product_code) = l.code_key)
        OR (l.product_id IS NULL AND l.code_key IS NULL AND l.name_key IS NOT NULL AND lower(p.product_name) = l.name_key)
      WHERE l.opening_stock > 0
    ),
    chosen AS (
      SELECT m.product_id, MAX(m.opening_stock) AS opening_stock,
        COALESCE(
          MAX(CASE WHEN (m.options->>'branch_id') ~ '^[0-9]+$' THEN (m.options->>'branch_id')::integer END),
          MAX(p.primary_branch_id),
          (SELECT b.id FROM public.branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)
        ) AS branch_id
      FROM matched m
      JOIN public.products p ON p.id = m.product_id
      GROUP BY m.product_id
    )
    INSERT INTO public.product_stock (product_id, branch_id, current_stock, min_stock, created_at)
    SELECT c.product_id, c.branch_id, c.opening_stock,
           COALESCE(p.min_stock, 0), NOW()
    FROM chosen c
    JOIN public.products p ON p.id = c.product_id
    WHERE c.branch_id IS NOT NULL
    ON CONFLICT (branch_id, product_id) DO UPDATE SET
      current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
      min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

    UPDATE public.products p
    SET current_stock = COALESCE((
      SELECT SUM(ps.current_stock)
      FROM public.product_stock ps
      WHERE ps.product_id = p.id
    ), 0)
    WHERE EXISTS (
      SELECT 1 FROM public.product_stock ps WHERE ps.product_id = p.id
    );
  END IF;
END $$;

-- Keep the newer V3 inventory model aligned when it exists. This is additive
-- only: an already-positive live quantity is never reduced.
DO $$
BEGIN
  IF to_regclass('public.inventory_products_v2') IS NOT NULL
     AND to_regclass('public.inventory_stock_v2') IS NOT NULL
     AND to_regclass('public.product_import_rows') IS NOT NULL THEN
    EXECUTE $sql$
      WITH ledger AS (
        SELECT
          lower(trim(COALESCE(r.normalized_data->>'product_code', r.raw_data->>'Product Code', r.raw_data->>'SKU', r.raw_data->>'product_code', r.raw_data->>'sku'))) AS code_key,
          GREATEST(COALESCE((
            SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric ELSE NULL END
            FROM jsonb_each_text(COALESCE(r.normalized_data, '{}'::jsonb) || COALESCE(r.raw_data, '{}'::jsonb)) e
            WHERE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') IN ('currentstock','openingstock','stock','qty','quantity')
            ORDER BY r.id DESC
            LIMIT 1
          ), 0), 0) AS opening_stock,
          r.id
        FROM public.product_import_rows r
        WHERE r.normalized_data IS NOT NULL OR r.raw_data IS NOT NULL
      ),
      latest AS (
        SELECT code_key, MAX(opening_stock) AS opening_stock
        FROM ledger
        WHERE code_key IS NOT NULL AND opening_stock > 0
        GROUP BY code_key
      ),
      target AS (
        SELECT p.id AS product_id, l.opening_stock,
               (SELECT b.id FROM public.branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1) AS branch_id
        FROM latest l
        JOIN public.inventory_products_v2 p ON lower(p.sku) = l.code_key
      )
      INSERT INTO public.inventory_stock_v2 (product_id, branch_id, quantity_on_hand)
      SELECT t.product_id, t.branch_id, t.opening_stock
      FROM target t
      WHERE t.branch_id IS NOT NULL
      ON CONFLICT (product_id, branch_id) DO UPDATE
        SET quantity_on_hand = GREATEST(inventory_stock_v2.quantity_on_hand, EXCLUDED.quantity_on_hand),
            updated_at = NOW()
    $sql$;
  END IF;
END $$;

COMMIT;
