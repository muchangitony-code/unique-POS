BEGIN;
-- Explicit destructive cutover: legacy inventory is not retained as fallback or archive.
DROP TABLE IF EXISTS public.inventory_movements_v2 CASCADE;
DROP TABLE IF EXISTS public.inventory_stock_v2 CASCADE;
DROP TABLE IF EXISTS public.inventory_products_v2 CASCADE;
DROP TABLE IF EXISTS public.product_stock CASCADE;
DROP TABLE IF EXISTS public.inventory_canonical CASCADE;
DROP TABLE IF EXISTS public.products_canonical CASCADE;
DROP TABLE IF EXISTS public.inventory_movements CASCADE;
DROP TABLE IF EXISTS public.inventory_stock CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;
COMMIT;
