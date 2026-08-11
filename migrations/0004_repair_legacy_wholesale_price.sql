DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'wholesale_price'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN wholesale_price DROP NOT NULL;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = 'wholesale_price'
        AND column_default IS NULL
    ) THEN
      ALTER TABLE public.products
        ALTER COLUMN wholesale_price SET DEFAULT 0;
    END IF;
  END IF;
END
$$;
