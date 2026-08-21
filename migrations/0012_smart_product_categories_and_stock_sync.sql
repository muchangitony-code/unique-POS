BEGIN;

-- Smart category rules are data-driven so the rules can be extended without changing
-- the product importer. Explicitly supplied product categories always win.
CREATE TABLE IF NOT EXISTS product_category_rules (
  id SERIAL PRIMARY KEY,
  category_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  phrases TEXT[] NOT NULL DEFAULT '{}'::text[],
  keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_category_rules_active_priority_idx
  ON product_category_rules (is_active, priority, id);

INSERT INTO product_category_rules (category_name, priority, phrases, keywords)
SELECT * FROM (VALUES
  ('Inverters', 10, ARRAY['hybrid inverter','solar inverter','off grid inverter','grid tie inverter','grid-tie inverter','inverter charger'], ARRAY['inverter','ups']),
  ('Batteries', 20, ARRAY['lithium battery','lithium ion battery','lifepo4 battery','gel battery','agm battery','deep cycle battery'], ARRAY['battery','lifepo4','lithium']),
  ('Solar Panels', 30, ARRAY['solar panel','pv panel','solar module','photovoltaic panel'], ARRAY['photovoltaic','solar panel','pv panel']),
  ('Breakers', 40, ARRAY['circuit breaker','miniature circuit breaker','moulded case circuit breaker','residual current breaker'], ARRAY['mcb','mccb','rcbo','rccb','rcd','elcb','breaker']),
  ('Contactors', 50, ARRAY['magnetic contactor','ac contactor','motor contactor','overload relay'], ARRAY['contactor','overload relay']),
  ('Isolators', 60, ARRAY['dc isolator','ac isolator','switch disconnector','disconnect switch'], ARRAY['isolator','disconnector','disconnect']),
  ('Bulbs', 70, ARRAY['led bulb','led bulbs','rechargeable bulb','emergency bulb','smart bulb','globe bulb'], ARRAY['bulb','bulbs','lamp','lamps']),
  ('Lighting', 80, ARRAY['led tube','tube light','flood light','floodlight','panel light','street light','security light','high bay','downlight','ceiling light','wall light','spotlight','led batten'], ARRAY['floodlight','flood','lighting','luminaire','batten','downlight','spotlight','tube']),
  ('Switches & Sockets', 90, ARRAY['light switch','wall switch','socket outlet','switched socket','cooker switch','two gang switch','two gang socket','three gang switch','three gang socket','one gang switch','one gang socket'], ARRAY['switch','socket','sockets','dimmer']),
  ('Cables', 100, ARRAY['twin and earth','twin earth','solar cable','armoured cable','flexible cable','coaxial cable'], ARRAY['cable','cables','wire','wires']),
  ('Conduit', 110, ARRAY['pvc conduit','flexible conduit','electrical conduit','cable trunking','pvc trunking'], ARRAY['conduit','trunking']),
  ('Plugs & Adapters', 120, ARRAY['extension lead','extension socket','travel adaptor','travel adapter'], ARRAY['plug','plugs','adapter','adaptor','extension']),
  ('Fittings', 130, ARRAY['lamp holder','batten holder','ceiling rose','junction box'], ARRAY['fitting','fittings','holder','junction box','connector']),
  ('Networking', 140, ARRAY['rj45 connector','rj45 plug','network cable','ethernet cable'], ARRAY['rj45','ethernet','network'])
) AS seed(category_name, priority, phrases, keywords)
WHERE NOT EXISTS (
  SELECT 1 FROM product_category_rules r WHERE lower(r.category_name) = lower(seed.category_name)
);

INSERT INTO categories (name, created_at)
SELECT DISTINCT r.category_name, NOW()
FROM product_category_rules r
WHERE r.is_active
  AND NOT EXISTS (
    SELECT 1 FROM categories c WHERE lower(c.name) = lower(r.category_name)
  );

CREATE OR REPLACE FUNCTION infer_product_category_id(product_name_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_name TEXT := lower(regexp_replace(coalesce(product_name_input, ''), '[^a-z0-9]+', ' ', 'g'));
  compact_name TEXT := regexp_replace(normalized_name, '\\s+', ' ', 'g');
  selected_category_id INTEGER;
BEGIN
  IF btrim(compact_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT c.id
    INTO selected_category_id
  FROM product_category_rules r
  JOIN categories c ON lower(c.name) = lower(r.category_name)
  WHERE r.is_active
    AND (
      EXISTS (
        SELECT 1 FROM unnest(r.phrases) phrase
        WHERE btrim(phrase) <> ''
          AND position(lower(btrim(phrase)) IN compact_name) > 0
      )
      OR EXISTS (
        SELECT 1 FROM unnest(r.keywords) keyword
        WHERE btrim(keyword) <> ''
          AND position(' ' || lower(btrim(keyword)) || ' ' IN ' ' || compact_name || ' ') > 0
      )
    )
  ORDER BY r.priority ASC, r.id ASC
  LIMIT 1;

  RETURN selected_category_id;
END;
$$;

-- Backfill only products that do not already have a category. Explicit categories are untouched.
UPDATE products
SET category_id = infer_product_category_id(product_name)
WHERE category_id IS NULL
  AND infer_product_category_id(product_name) IS NOT NULL;

CREATE OR REPLACE FUNCTION products_auto_infer_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    NEW.category_id := infer_product_category_id(NEW.product_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_auto_infer_category_trigger ON products;
CREATE TRIGGER products_auto_infer_category_trigger
BEFORE INSERT OR UPDATE OF product_name, category_id ON products
FOR EACH ROW
EXECUTE FUNCTION products_auto_infer_category();

-- Keep the legacy products.current_stock aggregate consistent with the branch-level
-- product_stock table used by imports and inventory. This does not alter branch stock.
CREATE OR REPLACE FUNCTION sync_product_legacy_stock(product_id_input INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE products p
  SET current_stock = COALESCE((
    SELECT SUM(ps.current_stock)
    FROM product_stock ps
    WHERE ps.product_id = p.id
  ), 0)
  WHERE p.id = product_id_input;
END;
$$;

CREATE OR REPLACE FUNCTION product_stock_sync_legacy_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_product_id INTEGER;
BEGIN
  affected_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
  PERFORM sync_product_legacy_stock(affected_product_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_stock_sync_legacy_total_trigger ON product_stock;
CREATE TRIGGER product_stock_sync_legacy_total_trigger
AFTER INSERT OR UPDATE OF current_stock OR DELETE ON product_stock
FOR EACH ROW
EXECUTE FUNCTION product_stock_sync_legacy_total();

-- One-time consistency pass for existing imported stock. Branch quantities are preserved;
-- only the legacy product total is recalculated from product_stock.
UPDATE products p
SET current_stock = COALESCE((
  SELECT SUM(ps.current_stock)
  FROM product_stock ps
  WHERE ps.product_id = p.id
), 0);

COMMIT;
