BEGIN;

-- Retired legacy assertion.
-- The previous version incorrectly asserted an obsolete 272-item test catalogue.
-- Keep this migration valid for environments where 0022 has not yet run; the
-- actual production clean-slate operation is performed by 0023.

COMMIT;
