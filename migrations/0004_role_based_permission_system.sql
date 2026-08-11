BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0004  Role-Based Permission System
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Product archiving support
--    Products with sales history must never be permanently deleted;
--    they are archived (hidden from normal lists) instead.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_archived   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_is_archived_idx ON products (is_archived);

-- 2. Extend sale_status enum with 'draft' and 'returned'
--    The existing enum only has 'completed', 'refunded', 'void'.
--    We add 'draft' (in-progress / suspended POS basket) and
--    'returned' (return/refund transaction linked to the original sale).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'draft'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
  ) THEN
    ALTER TYPE sale_status ADD VALUE 'draft';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'returned'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
  ) THEN
    ALTER TYPE sale_status ADD VALUE 'returned';
  END IF;
END$$;

-- 3. Additional columns on sales
--    notes         – reason supplied when voiding / returning a sale
--    original_sale_id – links a return transaction back to the original sale
--    voided_at / voided_by – who voided and when
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS original_sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by        INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_original_sale_id_idx ON sales (original_sale_id);

-- 4. Protect audit_log – no row may ever be updated or deleted.
--    We use PostgreSQL rules to silently block UPDATE and DELETE attempts
--    (they succeed without error so application code doesn't break, but
--    the operation has no effect).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE tablename = 'audit_log' AND rulename = 'audit_log_no_update'
  ) THEN
    EXECUTE 'CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE tablename = 'audit_log' AND rulename = 'audit_log_no_delete'
  ) THEN
    EXECUTE 'CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING';
  END IF;
END$$;

-- 5. Capture originating device / user-agent in audit_log
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS device_info TEXT;

COMMIT;
