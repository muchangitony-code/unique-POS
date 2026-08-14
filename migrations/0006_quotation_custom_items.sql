BEGIN;

-- Quotations may contain items that are not part of inventory.
-- Existing inventory-linked quotation lines continue to use product_id.
ALTER TABLE public.quotation_items
  ALTER COLUMN product_id DROP NOT NULL;

-- Preserve non-stock quotation lines when an approved quotation is converted to an invoice.
ALTER TABLE public.invoice_items
  ALTER COLUMN product_id DROP NOT NULL;

COMMIT;
