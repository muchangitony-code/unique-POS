BEGIN;
-- Marker migration. The obsolete 272-item assertion is intentionally not used by
-- the clean-slate path. The verified production reset must be run before import.
COMMIT;
