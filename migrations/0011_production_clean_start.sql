BEGIN;

-- One-time production cutover cleanup.
-- Preserve configuration/master data: users, branches, business_settings,
-- brands, categories and products. Remove test/operational transactions only.
TRUNCATE TABLE
  public.admin_notifications,
  public.audit_log,
  public.login_history,
  public.mpesa_transactions,
  public.invoice_payments,
  public.invoice_items,
  public.invoices,
  public.quotation_items,
  public.quotations,
  public.sale_items,
  public.sales,
  public.purchase_items,
  public.purchases,
  public.expenses,
  public.stock_movements,
  public.stock_transfers
RESTART IDENTITY CASCADE;

-- Remove any test document-number state so the first live documents start
-- from the normal sequence for the current year.
TRUNCATE TABLE public.document_sequences;

-- Keep the product catalogue but remove test opening stock quantities.
UPDATE public.product_stock
SET current_stock = 0;

COMMIT;
