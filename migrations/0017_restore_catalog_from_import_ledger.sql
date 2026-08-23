BEGIN;

-- Recover the production catalogue after the accidental clean-catalog reset.
-- Source of truth: the retained bulk-import ledger. This migration is strictly
-- conditional: it does nothing if products already exist.

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.products) = 0
     AND to_regclass('public.product_import_rows') IS NOT NULL THEN

    WITH source_rows AS (
      SELECT DISTINCT ON (
        COALESCE(r.product_id::text, NULLIF(lower(trim(r.normalized_data->>'product_code')), ''), 'row:' || r.id::text)
      )
        r.id, r.product_id, r.normalized_data, r.row_number
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.normalized_data IS NOT NULL
        AND COALESCE(r.status, 'pending') <> 'invalid'
        AND NULLIF(trim(r.normalized_data->>'product_name'), '') IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'selling_price'), '') IS NOT NULL
      ORDER BY
        COALESCE(r.product_id::text, NULLIF(lower(trim(r.normalized_data->>'product_code')), ''), 'row:' || r.id::text),
        r.id DESC
    ),
    prepared AS (
      SELECT
        s.*,
        COALESCE(NULLIF(trim(s.normalized_data->>'product_code'), ''), 'IMP-' || lpad(s.id::text, 6, '0')) AS recovered_code,
        NULLIF(trim(s.normalized_data->>'barcode'), '') AS recovered_barcode,
        trim(s.normalized_data->>'product_name') AS recovered_name,
        NULLIF(trim(s.normalized_data->>'description'), '') AS recovered_description,
        NULLIF(trim(s.normalized_data->>'unit'), '') AS recovered_unit,
        COALESCE(NULLIF(trim(s.normalized_data->>'cost_price'), '')::numeric, 0) AS recovered_cost,
        COALESCE(NULLIF(trim(s.normalized_data->>'selling_price'), '')::numeric, 0) AS recovered_selling,
        COALESCE(NULLIF(trim(s.normalized_data->>'vat_rate'), '')::numeric, 16) AS recovered_vat,
        GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer AS recovered_stock,
        GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'min_stock'), '')::numeric, 0), 0)::integer AS recovered_min,
        NULLIF(trim(s.normalized_data->>'image_url'), '') AS recovered_image
      FROM source_rows s
    )
    INSERT INTO public.products (
      id, product_code, barcode, product_name, description,
      category_id, brand_id, supplier_id, cost_price, selling_price,
      vat_rate, current_stock, min_stock, image_url, unit
    )
    SELECT
      p.product_id, p.recovered_code, p.recovered_barcode, p.recovered_name,
      p.recovered_description, NULL, NULL, NULL, p.recovered_cost,
      p.recovered_selling, p.recovered_vat, p.recovered_stock, p.recovered_min,
      p.recovered_image, p.recovered_unit
    FROM prepared p
    WHERE p.product_id IS NOT NULL
      AND p.product_id > 0
      AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = p.product_id)
      AND NOT EXISTS (SELECT 1 FROM public.products x WHERE lower(x.product_code) = lower(p.recovered_code));

    WITH source_rows AS (
      SELECT DISTINCT ON (lower(trim(r.normalized_data->>'product_code')))
        r.id, r.normalized_data
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.normalized_data IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'product_name'), '') IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'selling_price'), '') IS NOT NULL
        AND (r.product_id IS NULL OR r.product_id <= 0)
      ORDER BY lower(trim(r.normalized_data->>'product_code')), r.id DESC
    )
    INSERT INTO public.products (
      product_code, barcode, product_name, description,
      category_id, brand_id, supplier_id, cost_price, selling_price,
      vat_rate, current_stock, min_stock, image_url, unit
    )
    SELECT
      COALESCE(NULLIF(trim(s.normalized_data->>'product_code'), ''), 'IMP-' || lpad(s.id::text, 6, '0')),
      NULLIF(trim(s.normalized_data->>'barcode'), ''),
      trim(s.normalized_data->>'product_name'),
      NULLIF(trim(s.normalized_data->>'description'), ''),
      NULL, NULL, NULL,
      COALESCE(NULLIF(trim(s.normalized_data->>'cost_price'), '')::numeric, 0),
      COALESCE(NULLIF(trim(s.normalized_data->>'selling_price'), '')::numeric, 0),
      COALESCE(NULLIF(trim(s.normalized_data->>'vat_rate'), '')::numeric, 16),
      GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer,
      GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'min_stock'), '')::numeric, 0), 0)::integer,
      NULLIF(trim(s.normalized_data->>'image_url'), ''),
      NULLIF(trim(s.normalized_data->>'unit'), '')
    FROM source_rows s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE lower(p.product_code) = lower(COALESCE(NULLIF(trim(s.normalized_data->>'product_code'), ''), 'IMP-' || lpad(s.id::text, 6, '0')))
    );

    IF to_regclass('public.stock') IS NOT NULL THEN
      INSERT INTO public.product_stock (branch_id, product_id, current_stock, min_stock, created_at)
      SELECT st.branch_id, st.product_id,
             GREATEST(COALESCE(st.quantity, 0), 0),
             GREATEST(COALESCE(st.min_quantity, 0), 0), NOW()
      FROM public.stock st
      JOIN public.products p ON p.id = st.product_id
      WHERE st.branch_id IS NOT NULL
      ON CONFLICT (branch_id, product_id) DO UPDATE
        SET current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
            min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);
    END IF;

    WITH latest_import AS (
      SELECT DISTINCT ON (r.product_id)
        r.product_id,
        GREATEST(COALESCE(NULLIF(trim(r.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer AS opening_stock,
        j.options
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.product_id IS NOT NULL AND r.normalized_data IS NOT NULL
      ORDER BY r.product_id, r.id DESC
    ),
    resolved AS (
      SELECT li.product_id, li.opening_stock,
             COALESCE(
               CASE WHEN (li.options->>'branch_id') ~ '^\\d+$' THEN (li.options->>'branch_id')::integer END,
               p.primary_branch_id,
               (SELECT b.id FROM public.branches b WHERE b.is_active ORDER BY b.id LIMIT 1)
             ) AS branch_id
      FROM latest_import li
      JOIN public.products p ON p.id = li.product_id
      WHERE li.opening_stock > 0
    )
    INSERT INTO public.product_stock (product_id, branch_id, current_stock, min_stock, created_at)
    SELECT r.product_id, r.branch_id, r.opening_stock, COALESCE(p.min_stock, 0), NOW()
    FROM resolved r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.branch_id IS NOT NULL
    ON CONFLICT (branch_id, product_id) DO UPDATE
      SET current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
          min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

    UPDATE public.products p
    SET current_stock = COALESCE((
      SELECT SUM(ps.current_stock) FROM public.product_stock ps WHERE ps.product_id = p.id
    ), p.current_stock);

    PERFORM setval('public.products_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.products), 1), 1), TRUE);
  END IF;
END $$;

COMMIT;
