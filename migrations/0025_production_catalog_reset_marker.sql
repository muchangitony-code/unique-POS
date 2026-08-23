BEGIN;

-- This migration intentionally contains no destructive SQL.
-- Production catalogue deletion is performed by the explicit db:reset-catalog
-- command after deployment, so a normal deploy can never erase live stock.

COMMIT;
