BEGIN;

CREATE TABLE IF NOT EXISTS product_categorization_rules (
  id SERIAL PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_categorization_rules_enabled_idx
  ON product_categorization_rules (is_enabled, priority, id);

INSERT INTO product_categorization_rules (rule_name, keywords, category_name, priority, is_enabled)
VALUES
  ('Lighting Bulbs', '["bulb","led bulb","lamp","globe","candle bulb"]'::jsonb, 'Lighting > Bulbs', 10, TRUE),
  ('Flood Lights', '["flood light","floodlight"]'::jsonb, 'Lighting > Flood Lights', 11, TRUE),
  ('Solar Inverters', '["inverter","hybrid inverter","pure sine","mppt inverter"]'::jsonb, 'Solar > Inverters', 20, TRUE),
  ('Solar Panels', '["solar panel","pv module","mono panel","poly panel"]'::jsonb, 'Solar > Solar Panels', 21, TRUE),
  ('Solar Batteries', '["battery","agm","gel","lithium","lifepo4"]'::jsonb, 'Solar > Batteries', 22, TRUE),
  ('Charge Controllers', '["charge controller","mppt","pwm"]'::jsonb, 'Solar > Charge Controllers', 23, TRUE),
  ('Electrical Cables', '["cable","wire"]'::jsonb, 'Electrical > Cables', 30, TRUE),
  ('Electrical Sockets', '["socket","outlet"]'::jsonb, 'Electrical > Sockets', 31, TRUE),
  ('Electrical Switches', '["switch"]'::jsonb, 'Electrical > Switches', 32, TRUE),
  ('Circuit Breakers', '["breaker","mcb","mccb","rcbo","rccb"]'::jsonb, 'Protection > Circuit Breakers', 40, TRUE),
  ('Distribution Boards', '["distribution board","db box","consumer unit"]'::jsonb, 'Protection > Distribution Boards', 41, TRUE),
  ('Conduits', '["conduit","trunking"]'::jsonb, 'Installation > Conduits', 50, TRUE),
  ('Junction Boxes', '["junction box"]'::jsonb, 'Installation > Junction Boxes', 51, TRUE)
ON CONFLICT (rule_name) DO NOTHING;

COMMIT;
