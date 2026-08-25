BEGIN;

-- RESTORE THE AUTHORITATIVE INVENTORY CATALOGUE.
--
-- Migration 0026 archived the live v2 catalogue before deleting it. The
-- application was then pointed at v2, leaving Products/Inventory empty even
-- though the pre-cutover catalogue still exists in the protected archive.
--
-- This migration restores that exact archived v2 snapshot. It is intentionally
-- non-destructive: if v2 already contains products, nothing is deleted.

DO $$
DECLARE
  archived_products BIGINT := 0;
  restored_products BIGINT := 0;
  archived_stock BIGINT := 0;
  restored_stock BIGINT := 0;
  archived_movements BIGINT := 0;
  restored_movements BIGINT := 0;
BEGIN
  IF to_regclass('public.inventory_products_v2_archived_20260824') IS NULL THEN
    RAISE EXCEPTION 'Inventory recovery archive is missing: inventory_products_v2_archived_20260824';
  END IF;

  SELECT COUNT(*) INTO archived_products FROM public.inventory_products_v2_archived_20260824;
  SELECT COUNT(*) INTO archived_stock FROM public.inventory_stock_v2_archived_20260824;
  SELECT COUNT(*) INTO archived_movements FROM public.inventory_movements_v2_archived_20260824;

  IF archived_products = 0 THEN
    RAISE EXCEPTION 'Inventory recovery archive contains no products; refusing to fabricate catalogue data.';
  END IF;

  INSERT INTO public.inventory_products_v2
    (id, sku, barcode, name, category, brand, unit, cost_price, selling_price,
     vat_rate, reorder_level, supplier, description, is_active, created_at, updated_at)
  SELECT
    id, sku, barcode, name, category, brand, unit, cost_price, selling_price,
    vat_rate, reorder_level, supplier, description, is_active, created_at, updated_at
  FROM public.inventory_products_v2_archived_20260824
  ON CONFLICT (id) DO UPDATE SET
    sku = EXCLUDED.sku,
    barcode = EXCLUDED.barcode,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    brand = EXCLUDED.brand,
    unit = EXCLUDED.unit,
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    vat_rate = EXCLUDED.vat_rate,
    reorder_level = EXCLUDED.reorder_level,
    supplier = EXCLUDED.supplier,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.inventory_stock_v2
    (product_id, branch_id, quantity_on_hand, updated_at)
  SELECT product_id, branch_id, quantity_on_hand, updated_at
  FROM public.inventory_stock_v2_archived_20260824
  WHERE EXISTS (
    SELECT 1 FROM public.inventory_products_v2 p WHERE p.id = product_id
  )
  ON CONFLICT (product_id, branch_id) DO UPDATE SET
    quantity_on_hand = EXCLUDED.quantity_on_hand,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.inventory_movements_v2
    (id, product_id, branch_id, movement_type, quantity_delta, reference_type,
     reference_id, reason, user_id, created_at)
  SELECT id, product_id, branch_id, movement_type, quantity_delta, reference_type,
         reference_id, reason, user_id, created_at
  FROM public.inventory_movements_v2_archived_20260824
  WHERE EXISTS (
    SELECT 1 FROM public.inventory_products_v2 p WHERE p.id = product_id
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO restored_products FROM public.inventory_products_v2;
  SELECT COUNT(*) INTO restored_stock FROM public.inventory_stock_v2;
  SELECT COUNT(*) INTO restored_movements FROM public.inventory_movements_v2;

  IF restored_products < archived_products THEN
    RAISE EXCEPTION 'Inventory recovery incomplete: restored % products, archive contains %', restored_products, archived_products;
  END IF;

  -- Keep BIGSERIAL sequences ahead of the restored explicit IDs.
  PERFORM setval(
    pg_get_serial_sequence('public.inventory_products_v2', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM public.inventory_products_v2), 1), 1),
    true
  );
  PERFORM setval(
    pg_get_serial_sequence('public.inventory_movements_v2', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM public.inventory_movements_v2), 1), 1),
    true
  );

  RAISE NOTICE 'Inventory archive restored: archive_products=%, products_now=%, archive_stock=%, stock_now=%, archive_movements=%, movements_now=%',
    archived_products, restored_products, archived_stock, restored_stock, archived_movements, restored_movements;
END $$;

COMMIT;
