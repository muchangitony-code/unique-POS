BEGIN;

-- Inventory V3 is the authoritative product catalogue. Product identifiers are
-- generated here and never written to the legacy products table.
CREATE SEQUENCE IF NOT EXISTS public.inventory_product_identifier_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Treat blank imported barcodes as missing so they do not block the unique index.
UPDATE public.inventory_products_v2
   SET barcode = NULL
 WHERE barcode IS NOT NULL
   AND btrim(barcode) = '';

-- SKU is already UNIQUE. Add the same database-level guarantee to barcodes while
-- allowing NULL for products that predate this feature.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_v2_barcode_unique_idx
  ON public.inventory_products_v2 (barcode)
 WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

COMMIT;
