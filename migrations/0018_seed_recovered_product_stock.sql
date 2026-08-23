BEGIN;

-- Ensure every recovered product has branch-level opening stock, including
-- import rows whose old product_id was not retained.

DO $$
BEGIN
  IF to_regclass('public.product_import_rows') IS NOT NULL THEN
    WITH latest AS (
      SELECT DISTINCT ON (lower(trim(r.normalized_data->>'product_code')))
        lower(trim(r.normalized_data->>'product_code')) AS code_key,
        GREATEST(COALESCE(NULLIF(trim(r.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer AS opening_stock,
        GREATEST(COALESCE(NULLIF(trim(r.normalized_data->>'min_stock'), '')::numeric, 0), 0)::integer AS min_stock,
        j.options
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.normalized_data IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'product_code'), '') IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'product_name'), '') IS NOT NULL
      ORDER BY lower(trim(r.normalized_data->>'product_code')), r.id DESC
    ),
    resolved AS (
      SELECT p.id AS product_id,
             COALESCE(
               CASE WHEN (l.options->>'branch_id') ~ '^\\d+$' THEN (l.options->>'branch_id')::integer END,
               p.primary_branch_id,
               (SELECT b.id FROM public.branches b WHERE b.is_active ORDER BY b.id LIMIT 1)
             ) AS branch_id,
             l.opening_stock,
             l.min_stock
      FROM latest l
      JOIN public.products p ON lower(p.product_code) = l.code_key
    )
    INSERT INTO public.product_stock (product_id, branch_id, current_stock, min_stock, created_at)
    SELECT product_id, branch_id, opening_stock, min_stock, NOW()
    FROM resolved
    WHERE branch_id IS NOT NULL
    ON CONFLICT (branch_id, product_id) DO UPDATE
      SET current_stock = GREATEST(product_stock.current_stock, EXCLUDED.current_stock),
          min_stock = GREATEST(product_stock.min_stock, EXCLUDED.min_stock);

    UPDATE public.products p
    SET current_stock = COALESCE((
      SELECT SUM(ps.current_stock) FROM public.product_stock ps WHERE ps.product_id = p.id
    ), p.current_stock);
  END IF;
END $$;

COMMIT;
