BEGIN;

-- Restore the opening quantities retained by the import ledger into the
-- canonical V3 stock table for Main Branch. Never reduce existing stock.
DO $$
DECLARE
  main_branch_id BIGINT;
  matched_count BIGINT;
BEGIN
  SELECT id INTO main_branch_id FROM public.branches WHERE code='MAIN' ORDER BY id LIMIT 1;
  IF main_branch_id IS NULL THEN RAISE EXCEPTION 'MAIN branch does not exist'; END IF;

  IF to_regclass('public.product_import_rows') IS NULL OR to_regclass('public.product_import_jobs') IS NULL THEN
    RAISE EXCEPTION 'Import ledger tables are unavailable; opening stock cannot be recovered automatically';
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (lower(trim(COALESCE(r.normalized_data->>'product_name',r.raw_data->>'Product Name',r.raw_data->>'product_name',r.raw_data->>'name')))),
      lower(trim(COALESCE(r.normalized_data->>'product_name',r.raw_data->>'Product Name',r.raw_data->>'product_name',r.raw_data->>'name'))) AS name_key,
      GREATEST(COALESCE((SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric ELSE NULL END FROM jsonb_each_text(COALESCE(r.normalized_data,'{}')||COALESCE(r.raw_data,'{}')) e WHERE regexp_replace(lower(e.key),'[^a-z0-9]','','g') IN ('openingstock','currentstock','stock','qty','quantity') ORDER BY CASE regexp_replace(lower(e.key),'[^a-z0-9]','','g') WHEN 'openingstock' THEN 1 WHEN 'currentstock' THEN 2 WHEN 'stock' THEN 3 WHEN 'qty' THEN 4 WHEN 'quantity' THEN 5 ELSE 99 END LIMIT 1),0),0) AS qty
    FROM public.product_import_rows r JOIN public.product_import_jobs j ON j.id=r.job_id
    WHERE r.normalized_data IS NOT NULL OR r.raw_data IS NOT NULL
    ORDER BY lower(trim(COALESCE(r.normalized_data->>'product_name',r.raw_data->>'Product Name',r.raw_data->>'product_name',r.raw_data->>'name'))),r.id DESC
  ), matched AS (
    SELECT p.id AS product_id, MAX(l.qty) AS qty
    FROM latest l JOIN public.inventory_products_v2 p ON lower(trim(p.name))=l.name_key AND p.is_active=TRUE
    WHERE l.qty>0 GROUP BY p.id
  )
  INSERT INTO public.inventory_stock_v2(product_id,branch_id,quantity_on_hand,updated_at)
  SELECT product_id,main_branch_id,qty,NOW() FROM matched
  ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),updated_at=NOW();

  SELECT COUNT(*) INTO matched_count FROM public.inventory_stock_v2 WHERE branch_id=main_branch_id AND quantity_on_hand>0;
  IF matched_count=0 THEN RAISE EXCEPTION 'Opening stock restoration matched no positive stock rows'; END IF;
END $$;

COMMIT;
