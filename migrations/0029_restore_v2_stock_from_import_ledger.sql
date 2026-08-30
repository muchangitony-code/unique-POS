BEGIN;

-- The clean V3 catalogue reset intentionally removed legacy stock rows, but the
-- approved product import ledger was retained. Restore positive opening/current
-- quantities into the new authoritative inventory tables without fabricating or
-- reducing stock.
DO $$
BEGIN
  IF to_regclass('public.product_import_rows') IS NULL
     OR to_regclass('public.product_import_jobs') IS NULL
     OR to_regclass('public.inventory_products_v2') IS NULL
     OR to_regclass('public.inventory_stock_v2') IS NULL THEN
    RETURN;
  END IF;

  WITH ledger AS (
    SELECT
      r.id,
      lower(trim(COALESCE(
        r.normalized_data->>'product_code',
        r.normalized_data->>'sku',
        r.raw_data->>'Product Code',
        r.raw_data->>'SKU',
        r.raw_data->>'product_code',
        r.raw_data->>'sku'
      ))) AS sku_key,
      lower(trim(COALESCE(
        r.normalized_data->>'product_name',
        r.raw_data->>'Product Name',
        r.raw_data->>'product_name',
        r.raw_data->>'name'
      ))) AS name_key,
      COALESCE(
        NULLIF(r.normalized_data->>'selling_price','')::numeric,
        NULLIF(r.raw_data->>'Selling Price','')::numeric,
        NULLIF(r.raw_data->>'selling_price','')::numeric
      ) AS selling_price,
      GREATEST(COALESCE((
        SELECT CASE
          WHEN trim(e.value) ~ '^[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric
          ELSE NULL
        END
        FROM jsonb_each_text(COALESCE(r.normalized_data, '{}'::jsonb) || COALESCE(r.raw_data, '{}'::jsonb)) e
        WHERE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') IN
          ('currentstock','openingstock','stock','qty','quantity','availableqty','availablequantity')
        ORDER BY CASE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g')
          WHEN 'currentstock' THEN 1
          WHEN 'openingstock' THEN 2
          WHEN 'stock' THEN 3
          WHEN 'availableqty' THEN 4
          WHEN 'availablequantity' THEN 5
          WHEN 'qty' THEN 6
          WHEN 'quantity' THEN 7
          ELSE 99 END
        LIMIT 1
      ), 0), 0) AS quantity,
      CASE
        WHEN (j.options->>'branch_id') ~ '^[0-9]+$' THEN (j.options->>'branch_id')::bigint
        ELSE NULL
      END AS branch_id
    FROM public.product_import_rows r
    JOIN public.product_import_jobs j ON j.id = r.job_id
    WHERE r.normalized_data IS NOT NULL OR r.raw_data IS NOT NULL
  ),
  main_branch AS (
    SELECT id FROM public.branches
    WHERE is_active = TRUE
    ORDER BY CASE WHEN code='MAIN' THEN 0 WHEN lower(trim(name))='main branch' THEN 1 ELSE 2 END, id
    LIMIT 1
  ),
  candidates AS (
    SELECT p.id AS product_id,
           COALESCE(l.branch_id, (SELECT id FROM main_branch)) AS branch_id,
           l.quantity,
           l.id AS ledger_id,
           ROW_NUMBER() OVER (PARTITION BY p.id, COALESCE(l.branch_id, (SELECT id FROM main_branch)) ORDER BY l.id DESC) AS rn
    FROM ledger l
    JOIN public.inventory_products_v2 p ON
      (l.sku_key IS NOT NULL AND lower(trim(p.sku)) = l.sku_key)
      OR (
        l.sku_key IS NULL AND l.name_key IS NOT NULL
        AND lower(trim(p.name)) = l.name_key
        AND (l.selling_price IS NULL OR p.selling_price = l.selling_price)
      )
    WHERE l.quantity > 0
  ),
  chosen AS (
    SELECT product_id, branch_id, quantity
    FROM candidates
    WHERE rn = 1 AND branch_id IS NOT NULL
  ),
  restored AS (
    INSERT INTO public.inventory_stock_v2(product_id, branch_id, quantity_on_hand, updated_at)
    SELECT product_id, branch_id, quantity, NOW()
    FROM chosen
    ON CONFLICT (product_id, branch_id) DO UPDATE
      SET quantity_on_hand = GREATEST(public.inventory_stock_v2.quantity_on_hand, EXCLUDED.quantity_on_hand),
          updated_at = NOW()
    RETURNING product_id, branch_id, quantity_on_hand
  )
  INSERT INTO public.inventory_movements_v2(product_id, branch_id, movement_type, quantity_delta, reason, created_at)
  SELECT r.product_id, r.branch_id, 'opening_balance', r.quantity_on_hand,
         'Recovered opening stock from approved import ledger', NOW()
  FROM restored r
  WHERE r.quantity_on_hand > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_movements_v2 m
      WHERE m.product_id = r.product_id
        AND m.branch_id = r.branch_id
        AND m.reason = 'Recovered opening stock from approved import ledger'
    );
END $$;

COMMIT;
