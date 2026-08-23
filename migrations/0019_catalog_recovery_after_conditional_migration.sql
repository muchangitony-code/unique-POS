BEGIN;

-- Definitive catalog recovery.
--
-- 0017/0018 were conditional migrations. If the bulk-import ledger tables had
-- not yet been created when those migrations ran, they could legally complete
-- without restoring anything and were then recorded as applied. This migration
-- is intentionally self-contained and repeats the recovery at startup-safe
-- time. It is non-destructive: it only creates products when the master
-- products table is empty.

-- The bulk importer normally creates these tables lazily. Make the ledger
-- available to this recovery even on a database where the importer has never
-- been opened since deployment.
CREATE TABLE IF NOT EXISTS public.product_import_jobs (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  file_name TEXT,
  source_name TEXT,
  object_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  column_mapping JSONB,
  options JSONB,
  summary JSONB,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  undo_data JSONB,
  last_error TEXT,
  created_by_id INTEGER,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.product_import_rows (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES public.product_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  normalized_data JSONB,
  validation_errors JSONB,
  action TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  product_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_import_jobs_created_at_idx
  ON public.product_import_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS product_import_jobs_status_idx
  ON public.product_import_jobs (status);
CREATE INDEX IF NOT EXISTS product_import_rows_job_id_idx
  ON public.product_import_rows (job_id, row_number);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.products) = 0 THEN

    -- Recreate categories from the actual imported data first. Existing
    -- category records are preserved.
    INSERT INTO public.categories (name, created_at)
    SELECT DISTINCT trim(r.normalized_data->>'category'), NOW()
    FROM public.product_import_rows r
    WHERE r.normalized_data IS NOT NULL
      AND NULLIF(trim(r.normalized_data->>'category'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.categories c
        WHERE lower(trim(c.name)) = lower(trim(r.normalized_data->>'category'))
      );

    WITH source_rows AS (
      SELECT DISTINCT ON (
        COALESCE(
          NULLIF(lower(trim(r.normalized_data->>'product_code')), ''),
          'row:' || r.id::text
        )
      )
        r.id,
        r.product_id,
        r.normalized_data
      FROM public.product_import_rows r
      WHERE r.normalized_data IS NOT NULL
        AND COALESCE(r.status, 'pending') <> 'invalid'
        AND NULLIF(trim(r.normalized_data->>'product_name'), '') IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'selling_price'), '') IS NOT NULL
      ORDER BY
        COALESCE(NULLIF(lower(trim(r.normalized_data->>'product_code')), ''), 'row:' || r.id::text),
        r.id DESC
    )
    INSERT INTO public.products (
      id,
      product_code,
      barcode,
      product_name,
      description,
      category_id,
      brand_id,
      supplier_id,
      cost_price,
      selling_price,
      vat_rate,
      current_stock,
      min_stock,
      image_url,
      unit
    )
    SELECT
      CASE
        WHEN s.product_id IS NOT NULL AND s.product_id > 0 THEN s.product_id
        ELSE NULL
      END,
      COALESCE(
        NULLIF(trim(s.normalized_data->>'product_code'), ''),
        'IMP-' || lpad(s.id::text, 6, '0')
      ),
      NULLIF(trim(s.normalized_data->>'barcode'), ''),
      trim(s.normalized_data->>'product_name'),
      NULLIF(trim(s.normalized_data->>'description'), ''),
      c.id,
      NULL,
      NULL,
      COALESCE(NULLIF(trim(s.normalized_data->>'cost_price'), '')::numeric, 0),
      COALESCE(NULLIF(trim(s.normalized_data->>'selling_price'), '')::numeric, 0),
      COALESCE(NULLIF(trim(s.normalized_data->>'vat_rate'), '')::numeric, 16),
      GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer,
      GREATEST(COALESCE(NULLIF(trim(s.normalized_data->>'min_stock'), '')::numeric, 0), 0)::integer,
      NULLIF(trim(s.normalized_data->>'image_url'), ''),
      NULLIF(trim(s.normalized_data->>'unit'), '')
    FROM source_rows s
    LEFT JOIN public.categories c
      ON lower(trim(c.name)) = lower(trim(s.normalized_data->>'category'))
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE lower(p.product_code) = lower(
        COALESCE(
          NULLIF(trim(s.normalized_data->>'product_code'), ''),
          'IMP-' || lpad(s.id::text, 6, '0')
        )
      )
    );

    -- Recover branch stock from the import opening-stock field. This covers
    -- both rows whose original product_id survived and rows where it did not.
    WITH latest AS (
      SELECT DISTINCT ON (
        COALESCE(NULLIF(lower(trim(r.normalized_data->>'product_code')), ''), 'row:' || r.id::text)
      )
        r.id,
        r.product_id,
        r.normalized_data,
        j.options
      FROM public.product_import_rows r
      JOIN public.product_import_jobs j ON j.id = r.job_id
      WHERE r.normalized_data IS NOT NULL
        AND NULLIF(trim(r.normalized_data->>'product_name'), '') IS NOT NULL
      ORDER BY
        COALESCE(NULLIF(lower(trim(r.normalized_data->>'product_code')), ''), 'row:' || r.id::text),
        r.id DESC
    ),
    resolved AS (
      SELECT
        p.id AS product_id,
        GREATEST(COALESCE(NULLIF(trim(l.normalized_data->>'current_stock'), '')::numeric, 0), 0)::integer AS opening_stock,
        GREATEST(COALESCE(NULLIF(trim(l.normalized_data->>'min_stock'), '')::numeric, 0), 0)::integer AS min_stock,
        COALESCE(
          CASE
            WHEN (l.options->>'branch_id') ~ '^\\d+$'
              THEN (l.options->>'branch_id')::integer
          END,
          p.primary_branch_id,
          (SELECT b.id FROM public.branches b WHERE b.is_active = TRUE ORDER BY b.id LIMIT 1)
        ) AS branch_id
      FROM latest l
      JOIN public.products p
        ON lower(p.product_code) = lower(
          COALESCE(
            NULLIF(trim(l.normalized_data->>'product_code'), ''),
            'IMP-' || lpad(l.id::text, 6, '0')
          )
        )
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
      SELECT SUM(ps.current_stock)
      FROM public.product_stock ps
      WHERE ps.product_id = p.id
    ), p.current_stock);

    PERFORM setval(
      'public.products_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.products), 1), 1),
      TRUE
    );
    PERFORM setval(
      'public.product_stock_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.product_stock), 1), 1),
      TRUE
    );
  END IF;
END $$;

COMMIT;
