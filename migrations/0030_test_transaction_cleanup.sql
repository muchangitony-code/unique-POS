-- TEST TRANSACTION CLEANUP
-- Explicitly marks transactions as test data. Production records remain protected
-- unless a Super Admin deliberately marks them as test data.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS sales_is_test_idx ON public.sales (is_test);
CREATE INDEX IF NOT EXISTS invoices_is_test_idx ON public.invoices (is_test);
CREATE INDEX IF NOT EXISTS quotations_is_test_idx ON public.quotations (is_test);
