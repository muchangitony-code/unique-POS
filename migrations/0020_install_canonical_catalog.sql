BEGIN;

-- Canonical catalogue installation for Unique POS.
-- Source: Stock_Inventory_POS_Import_Template_With_Buying_Price.xlsx
-- 272 products, with selling price, buying price and physical opening stock.
-- This deliberately does NOT depend on product_import_jobs/product_import_rows.
-- It is the new source-of-truth flow for the initial catalogue.

CREATE TABLE IF NOT EXISTS public.catalog_seed_metadata (
  id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_version TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.categories (name, description, created_at)
SELECT v.name, v.description, NOW()
FROM (VALUES
  ('Solar Panels', 'Solar PV panels and modules'),
  ('Inverters', 'Solar and power inverters'),
  ('Batteries', 'Energy storage batteries'),
  ('Accessories', 'Tools, consumables and general accessories'),
  ('Cables', 'Electrical cables, wires, conduit and trunking'),
  ('Electricals', 'Electrical, lighting, switching and protection products'),
  ('Others', 'Other products not mapped to the primary categories')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c
  WHERE lower(trim(c.name)) = lower(trim(v.name))
);

CREATE TEMP TABLE canonical_catalog (
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  cost_price NUMERIC(15,2) NOT NULL,
  selling_price NUMERIC(15,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL,
  opening_stock INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  unit TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO canonical_catalog
  (sku, product_name, cost_price, selling_price, vat_rate, opening_stock, category_name, unit)
VALUES
      ('STK-001', '5W LED Bulbs Hommei', 35.00, 50.00, 16.00, 23, 'Electricals', 'pcs'),
      ('STK-002', '7W LED Bulbs Hommei', 42.00, 60.00, 16.00, 30, 'Electricals', 'pcs'),
      ('STK-003', '9W LED Bulbs Hommei', 56.00, 80.00, 16.00, 30, 'Electricals', 'pcs'),
      ('STK-004', '12W LED Bulbs Hommei', 70.00, 100.00, 16.00, 22, 'Electricals', 'pcs'),
      ('STK-005', '5W LED Bulbs Tronic', 70.00, 100.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-006', '7W LED Bulbs Tronic', 84.00, 120.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-007', '9W LED Bulbs Tronic', 105.00, 150.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-008', '20W LED Bulbs', 105.00, 150.00, 16.00, 30, 'Electricals', 'pcs'),
      ('STK-009', '30W LED Bulbs', 210.00, 300.00, 16.00, 16, 'Electricals', 'pcs'),
      ('STK-010', '50W LED Bulbs YOMY', 315.00, 450.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-011', '50W LED Bulbs CAIRO LIGHT', 280.00, 400.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-012', '30W Recheargable Bulbs', 245.00, 350.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-013', '40W Recheargable Bulbs', 315.00, 450.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-014', '50W Recheargable Bulbs', 350.00, 500.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-015', '9W Intelligent Bulbs', 175.00, 250.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-016', '12W Intelligent Bulbs', 210.00, 300.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-017', '2ft Dustproof LED', 315.00, 450.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-018', '4ft Dustproof LED', 455.00, 650.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-019', '2ft LED Tube', 175.00, 250.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-020', '4ft LED Tube', 245.00, 350.00, 16.00, 9, 'Electricals', 'pcs'),
      ('STK-021', '2ft Fitting', 140.00, 200.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-022', '4ft Fitting', 245.00, 350.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-023', 'Single Socket Cacher', 140.00, 200.00, 16.00, 13, 'Electricals', 'pcs'),
      ('STK-024', 'Twin Socket Cacher', 175.00, 250.00, 16.00, 12, 'Electricals', 'pcs'),
      ('STK-025', '1 gang Switch Cacher', 70.00, 100.00, 16.00, 37, 'Electricals', 'pcs'),
      ('STK-026', '2 gang Switch Cacher', 140.00, 200.00, 16.00, 18, 'Electricals', 'pcs'),
      ('STK-027', 'Cooker Socket Cacher', 455.00, 650.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-028', 'Single Socket Tronic', 175.00, 250.00, 16.00, 7, 'Electricals', 'pcs'),
      ('STK-029', 'Twin Socket Tronic', 350.00, 500.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-030', '1 gang Switch Tronic', 140.00, 200.00, 16.00, 7, 'Electricals', 'pcs'),
      ('STK-031', '2 gang Switch Tronic', 175.00, 250.00, 16.00, 8, 'Electricals', 'pcs'),
      ('STK-032', 'Single Socket TEP', 175.00, 250.00, 16.00, 100, 'Electricals', 'pcs'),
      ('STK-033', 'Twin Socket TEP', 350.00, 500.00, 16.00, 99, 'Electricals', 'pcs'),
      ('STK-034', 'Cooker Socket TEP', 525.00, 750.00, 16.00, 50, 'Electricals', 'pcs'),
      ('STK-035', 'DP Switch 45A QLA', 350.00, 500.00, 16.00, 15, 'Electricals', 'pcs'),
      ('STK-036', 'Door Bell Switch QLA', 350.00, 500.00, 16.00, 9, 'Electricals', 'pcs'),
      ('STK-037', 'Ding Dong Bell', 315.00, 450.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-038', 'Straight Holder', 59.50, 85.00, 16.00, 39, 'Electricals', 'pcs'),
      ('STK-039', 'Angle Holder', 59.50, 85.00, 16.00, 9, 'Electricals', 'pcs'),
      ('STK-040', 'Fridge Guard', 350.00, 500.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-041', 'TV Guard', 350.00, 500.00, 16.00, 7, 'Electricals', 'pcs'),
      ('STK-042', 'Top Plug Original', 84.00, 120.00, 16.00, 26, 'Electricals', 'pcs'),
      ('STK-043', 'Top Plug Cheaper', 56.00, 80.00, 16.00, 39, 'Electricals', 'pcs'),
      ('STK-044', 'Black Extension', 140.00, 200.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-045', 'Powerking Extension 4Way', 210.00, 300.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-046', 'Powerking Extension 5Way', 280.00, 400.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-047', 'Powerking Extension 6Way', 350.00, 500.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-048', 'Marken Extension 4Way', 420.00, 600.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-049', 'Marken Extension 5Way', 490.00, 700.00, 16.00, 10, 'Accessories', 'pcs'),
      ('STK-050', 'Snakelight 5m', 385.00, 550.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-051', 'Snakelight 10m', 560.00, 800.00, 16.00, 0, 'Electricals', 'pcs'),
      ('STK-052', 'Snakelight Multicolored/m', 70.00, 100.00, 16.00, 100, 'Electricals', 'meter'),
      ('STK-053', 'Snakelight Warm/m', 70.00, 100.00, 16.00, 100, 'Electricals', 'meter'),
      ('STK-054', 'Snakelight Pink/m', 70.00, 100.00, 16.00, 100, 'Electricals', 'meter'),
      ('STK-055', '20T Wallmount', 385.00, 550.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-056', 'Chaser 2pin', 140.00, 200.00, 16.00, 8, 'Electricals', 'pcs'),
      ('STK-057', 'Caser 4pin', 210.00, 300.00, 16.00, 7, 'Electricals', 'pcs'),
      ('STK-058', 'Ceiling Rose', 105.00, 150.00, 16.00, 57, 'Electricals', 'pcs'),
      ('STK-059', 'Rotating Wallmount', 595.00, 850.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-060', 'Red Heater', 140.00, 200.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-061', 'Green Heater', 175.00, 250.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-062', 'Black Heater', 210.00, 300.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-063', 'Electric Kettle', 560.00, 800.00, 16.00, 4, 'Others', 'pcs'),
      ('STK-064', 'Blender', 1540.00, 2200.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-065', 'Horizon Showerhead', 770.00, 1100.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-066', 'Lorenzetti Showerhead', 770.00, 1100.00, 16.00, 1, 'Electricals', 'pcs'),
      ('STK-067', 'Fame Showerhead', 1295.00, 1850.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-068', 'Enershower Showerhead', 1750.00, 2500.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-069', 'Router Tenda', 1400.00, 2000.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-070', 'Photocell', 420.00, 600.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-071', 'Car Charger 38W', 175.00, 250.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-072', 'Complete Charger Normal', 175.00, 250.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-073', 'Complete Charger Type C', 210.00, 300.00, 16.00, 3, 'Accessories', 'pcs'),
      ('STK-074', 'Complete Charger C To C', 280.00, 400.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-075', 'Type C Cable Oraimo Cheaper', 49.00, 70.00, 16.00, 5, 'Cables', 'pcs'),
      ('STK-076', 'Type C Cable Oraimo', 84.00, 120.00, 16.00, 2, 'Cables', 'pcs'),
      ('STK-077', 'Type C Cable FPM', 84.00, 120.00, 16.00, 5, 'Cables', 'pcs'),
      ('STK-078', 'Type C Cable Super Energy', 84.00, 120.00, 16.00, 2, 'Cables', 'pcs'),
      ('STK-079', 'Type C Cable Hotriple', 84.00, 120.00, 16.00, 4, 'Cables', 'pcs'),
      ('STK-080', 'Solar Torch', 210.00, 300.00, 16.00, 6, 'Accessories', 'pcs'),
      ('STK-081', 'Toceball AA Pair', 14.00, 20.00, 16.00, 57, 'Accessories', 'pair'),
      ('STK-082', 'Toceball AAA Pair', 10.50, 15.00, 16.00, 46, 'Accessories', 'pair'),
      ('STK-083', 'Eveready AA Pair', 42.00, 60.00, 16.00, 18, 'Accessories', 'pair'),
      ('STK-084', 'Eveready AAA Pair', 28.00, 40.00, 16.00, 20, 'Accessories', 'pair'),
      ('STK-085', 'Pliers Big', 210.00, 300.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-086', 'Pliers Small', 280.00, 400.00, 16.00, 7, 'Accessories', 'pcs'),
      ('STK-087', 'Screwdriver Star', 140.00, 200.00, 16.00, 10, 'Accessories', 'pcs'),
      ('STK-088', 'Screwdriver Flat', 105.00, 150.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-089', 'Screwdriver Double Sided', 140.00, 200.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-090', 'Tester Small', 35.00, 50.00, 16.00, 27, 'Accessories', 'pcs'),
      ('STK-091', 'Tester Big', 70.00, 100.00, 16.00, 19, 'Accessories', 'pcs'),
      ('STK-092', 'Insulation Tape Globe small', 35.00, 50.00, 16.00, 22, 'Accessories', 'pcs'),
      ('STK-093', 'Insulation Tape Globe big', 70.00, 100.00, 16.00, 35, 'Accessories', 'pcs'),
      ('STK-094', 'Insulation Tape Tronic Black', 105.00, 150.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-095', 'Insulation Tape Tronic Red', 105.00, 150.00, 16.00, 8, 'Accessories', 'pcs'),
      ('STK-096', 'Packing Tape', 210.00, 300.00, 16.00, 3, 'Accessories', 'pcs'),
      ('STK-097', 'Cable Clips 9mm Pack', 70.00, 100.00, 16.00, 9, 'Accessories', 'pack'),
      ('STK-098', 'Cable Clips 9mm Piece', 3.50, 5.00, 16.00, 86, 'Accessories', 'pcs'),
      ('STK-099', 'Cable Clips 10mm Pack', 105.00, 150.00, 16.00, 7, 'Accessories', 'pack'),
      ('STK-100', 'Cable Clips 10mm Piece', 3.50, 5.00, 16.00, 90, 'Accessories', 'pcs'),
      ('STK-101', 'Cable Clips 12mm Pack', 140.00, 200.00, 16.00, 4, 'Accessories', 'pack'),
      ('STK-102', 'Cable Clips 12mm Piece', 3.50, 5.00, 16.00, 100, 'Accessories', 'pcs'),
      ('STK-103', 'Cable Ties 5 by 150 Pack', 140.00, 200.00, 16.00, 2, 'Accessories', 'pack'),
      ('STK-104', 'Cable Ties 5 by 150 Piece', 3.50, 5.00, 16.00, 0, 'Accessories', 'pcs'),
      ('STK-105', 'Cable Ties 5 by 250 Pack', 210.00, 300.00, 16.00, 5, 'Accessories', 'pack'),
      ('STK-106', 'Cable Ties 5 by 250 Piece', 3.50, 5.00, 16.00, 100, 'Accessories', 'pcs'),
      ('STK-107', 'Wall Plugs 6mm Pack', 140.00, 200.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-108', 'Wall Plugs 6mm Piece', 3.50, 5.00, 16.00, 50, 'Accessories', 'pcs'),
      ('STK-109', 'Wall Plugs 8mm Pack', 140.00, 200.00, 16.00, 3, 'Accessories', 'pack'),
      ('STK-110', 'Wall Plugs 8mm Piece', 3.50, 5.00, 16.00, 0, 'Accessories', 'pcs'),
      ('STK-111', 'Wall Plugs 10mm Pack', 140.00, 200.00, 16.00, 2, 'Accessories', 'pack'),
      ('STK-112', 'Wall Plugs 10mm Piece', 3.50, 5.00, 16.00, 44, 'Accessories', 'pcs'),
      ('STK-113', '0xygen Free Cable PH100 Red/m', 10.50, 15.00, 16.00, 55, 'Cables', 'meter'),
      ('STK-114', '0xygen Free Cable PH100 Green/m', 10.50, 15.00, 16.00, 60, 'Cables', 'meter'),
      ('STK-115', 'Gypsum Screw  Pack', 175.00, 250.00, 16.00, 3, 'Accessories', 'pack'),
      ('STK-116', 'Gypsum Screw Piece', 3.50, 5.00, 16.00, 71, 'Accessories', 'pcs'),
      ('STK-117', 'MDF Screw 1.5”Pack', 175.00, 250.00, 16.00, 2, 'Accessories', 'pack'),
      ('STK-118', 'MDF Screw 1.5” Piece', 3.50, 5.00, 16.00, 200, 'Accessories', 'pcs'),
      ('STK-119', 'MDF Screw 2” Pack', 175.00, 250.00, 16.00, 2, 'Accessories', 'pack'),
      ('STK-120', 'MDF Screw 2” Piece', 3.50, 5.00, 16.00, 200, 'Accessories', 'pcs'),
      ('STK-121', '2BA Screw Pack', 175.00, 250.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-122', '2BA Screw Piece', 3.50, 5.00, 16.00, 71, 'Accessories', 'pcs'),
      ('STK-123', '4BA Screw Pack', 175.00, 250.00, 16.00, 4, 'Accessories', 'pack'),
      ('STK-124', '4BA Screw Piece', 3.50, 5.00, 16.00, 100, 'Accessories', 'pcs'),
      ('STK-125', 'Steel Nails 1” Pack', 175.00, 250.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-126', 'Steel Nails 1” Piece', 3.50, 5.00, 16.00, 140, 'Accessories', 'pcs'),
      ('STK-127', 'Steel Nails 1.5” Pack', 175.00, 250.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-128', 'Steel Nails 1.5” Piece', 3.50, 5.00, 16.00, 0, 'Accessories', 'pcs'),
      ('STK-129', 'Steel Nails 2” Pack', 175.00, 250.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-130', 'Steel Nails 2” Piece', 3.50, 5.00, 16.00, 0, 'Accessories', 'pcs'),
      ('STK-131', 'Steel Nails 3” Pack', 175.00, 250.00, 16.00, 1, 'Accessories', 'pack'),
      ('STK-132', 'Steel Nails 3” Piece', 3.50, 5.00, 16.00, 0, 'Accessories', 'pcs'),
      ('STK-133', 'Steel Nails 4” Pack', 0.00, 250.00, 16.00, 0, 'Accessories', 'pack'),
      ('STK-134', 'Steel Nails 4” Piece', 3.50, 5.00, 16.00, 41, 'Accessories', 'pcs'),
      ('STK-135', 'Super Glue White', 14.00, 20.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-136', 'Super Glue Black', 14.00, 20.00, 16.00, 19, 'Accessories', 'pcs'),
      ('STK-137', 'Tangit Glue 50ml', 175.00, 250.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-138', 'Tangit Glue 100ml', 350.00, 500.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-139', 'Tangit Glue 250ml', 525.00, 750.00, 16.00, 5, 'Accessories', 'pcs'),
      ('STK-140', 'Conta 250ml', 350.00, 500.00, 16.00, 11, 'Accessories', 'pcs'),
      ('STK-141', 'MCB 6A', 105.00, 150.00, 16.00, 12, 'Electricals', 'pcs'),
      ('STK-142', 'MCB 10A', 140.00, 200.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-143', 'MCB 20A', 175.00, 250.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-144', 'MCB 32A', 210.00, 300.00, 16.00, 27, 'Electricals', 'pcs'),
      ('STK-145', 'Double Pole 63A Andeli', 350.00, 500.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-146', 'Double Pole 100A Andeli', 420.00, 600.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-147', 'Double Pole 100A Tronic', 560.00, 800.00, 16.00, 6, 'Electricals', 'pcs'),
      ('STK-148', 'HDMI cable', 280.00, 400.00, 16.00, 2, 'Cables', 'pcs'),
      ('STK-149', 'RCA Cables', 35.00, 50.00, 16.00, 39, 'Cables', 'pcs'),
      ('STK-150', 'Double Enclosure', 105.00, 150.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-151', 'Triple Enclosure', 140.00, 200.00, 16.00, 4, 'Electricals', 'pcs'),
      ('STK-152', 'Single Cutout', 315.00, 450.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-153', 'Hack Blade', 70.00, 100.00, 16.00, 8, 'Accessories', 'pcs'),
      ('STK-154', 'Connector 20A', 70.00, 100.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-155', 'Connector 32A', 70.00, 100.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-156', 'Shower Coil', 140.00, 200.00, 16.00, 9, 'Electricals', 'pcs'),
      ('STK-157', 'Evincable Single 1.5mm Red Roll', 3500.00, 5000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-158', 'Evincable Single 1.5mm Black Roll', 3500.00, 5000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-159', 'Evincable Single 1.5mm Green Roll', 3500.00, 5000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-160', 'Evincable Single 1.5mm Red/m', 28.00, 40.00, 16.00, 65, 'Cables', 'meter'),
      ('STK-161', 'Evincable Single 1.5mm Black/m', 28.00, 40.00, 16.00, 65, 'Cables', 'meter'),
      ('STK-162', 'Evincable Single 1.5mm Green/m', 28.00, 40.00, 16.00, 97, 'Cables', 'meter'),
      ('STK-163', 'Evincable Single 2.5mm Red Roll', 2310.00, 3300.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-164', 'Evincable Single 2.5mm Black Roll', 2310.00, 3300.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-165', 'Evincable Single 2.5mm Green Roll', 2310.00, 3300.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-166', 'Evincable Single 2.5mm Red/m', 28.00, 40.00, 16.00, 65, 'Cables', 'meter'),
      ('STK-167', 'Evincable Single 2.5mm Black/m', 28.00, 40.00, 16.00, 65, 'Cables', 'meter'),
      ('STK-168', 'Evincable Single 2.5mm Green/m', 28.00, 40.00, 16.00, 97, 'Cables', 'meter'),
      ('STK-169', 'Tronic Single 1.5mm Red Roll', 3850.00, 5500.00, 16.00, 2, 'Cables', 'roll'),
      ('STK-170', 'Tronic Single 1.5mm Black Roll', 3850.00, 5500.00, 16.00, 2, 'Cables', 'roll'),
      ('STK-171', 'Tronic Single 1.5mm Green Roll', 3850.00, 5500.00, 16.00, 2, 'Cables', 'roll'),
      ('STK-172', 'Tronic Single 2.5mm Red Roll', 5250.00, 7500.00, 16.00, 2, 'Cables', 'roll'),
      ('STK-173', 'Tronic Single 2.5mm Black Roll', 5250.00, 7500.00, 16.00, 1, 'Cables', 'roll'),
      ('STK-174', 'Tronic Single 2.5mm Green Roll', 5250.00, 7500.00, 16.00, 1, 'Cables', 'roll'),
      ('STK-175', 'ASL Single 4.0mm Red Roll', 8400.00, 12000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-176', 'ASL Single 4.0mm Black Roll', 8400.00, 12000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-177', 'ASL Single 4.0mm Green Roll', 8400.00, 12000.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-178', 'ASL Single 4.0mm Red/m', 105.00, 150.00, 16.00, 88, 'Cables', 'meter'),
      ('STK-179', 'ASL Single 4.0mm Black/m', 105.00, 150.00, 16.00, 89, 'Cables', 'meter'),
      ('STK-180', 'ASL Single 4.0mm Green/m', 105.00, 150.00, 16.00, 89, 'Cables', 'meter'),
      ('STK-181', 'Matstar Twin/Earth 1.5mm Roll', 1960.00, 2800.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-182', 'Matstar Twin/Earth 1.5mm/m', 35.00, 50.00, 16.00, 90, 'Cables', 'meter'),
      ('STK-183', 'Evincable Twin/Earth 1.5mm Roll', 5250.00, 7500.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-184', 'Evincable Twin/Earth 1.5mm/m', 63.00, 90.00, 16.00, 90, 'Cables', 'meter'),
      ('STK-185', 'Evincable Twin/Earth 2.5mm Roll', 7350.00, 10500.00, 16.00, 0, 'Cables', 'roll'),
      ('STK-186', 'Evincable Twin/Earth 2.5mm/m', 91.00, 130.00, 16.00, 74, 'Cables', 'meter'),
      ('STK-187', 'Flex Cable/m', 35.00, 50.00, 16.00, 90, 'Cables', 'meter'),
      ('STK-188', 'Single Switch Box', 14.00, 20.00, 16.00, 97, 'Electricals', 'pcs'),
      ('STK-189', 'Twin Switch Box', 28.00, 40.00, 16.00, 47, 'Electricals', 'pcs'),
      ('STK-190', 'Single Patrice', 14.00, 20.00, 16.00, 67, 'Electricals', 'pcs'),
      ('STK-191', 'Twin Patrice', 28.00, 40.00, 16.00, 18, 'Electricals', 'pcs'),
      ('STK-192', 'Circular box 4 way', 14.00, 20.00, 16.00, 50, 'Electricals', 'pcs'),
      ('STK-193', 'Circular box 3 way', 14.00, 20.00, 16.00, 49, 'Electricals', 'pcs'),
      ('STK-194', 'Saddle clips 20mm', 10.50, 15.00, 16.00, 478, 'Accessories', 'pcs'),
      ('STK-195', 'Conduit pipe 20mm Belma', 70.00, 100.00, 16.00, 23, 'Cables', 'pcs'),
      ('STK-196', 'Conduit pipe 25mm Belma', 140.00, 200.00, 16.00, 10, 'Cables', 'pcs'),
      ('STK-197', 'Conduit pipe 20mm Metro', 126.00, 180.00, 16.00, 20, 'Cables', 'pcs'),
      ('STK-198', 'Conduit pipe 25mm Metro', 182.00, 260.00, 16.00, 10, 'Cables', 'pcs'),
      ('STK-199', 'Mini trunking', 70.00, 100.00, 16.00, 34, 'Cables', 'pcs'),
      ('STK-200', '2by1 trunking', 140.00, 200.00, 16.00, 0, 'Cables', 'pcs'),
      ('STK-201', 'Bends 20mm', 14.00, 20.00, 16.00, 80, 'Cables', 'pcs'),
      ('STK-202', 'Bends 25mm', 21.00, 30.00, 16.00, 100, 'Cables', 'pcs'),
      ('STK-203', 'Bends 32mm', 28.00, 40.00, 16.00, 100, 'Cables', 'pcs'),
      ('STK-204', 'Couplers 20mm', 7.00, 10.00, 16.00, 175, 'Cables', 'pcs'),
      ('STK-205', 'Couplers 25mm', 10.50, 15.00, 16.00, 100, 'Cables', 'pcs'),
      ('STK-206', 'Couplers 32mm', 21.00, 30.00, 16.00, 100, 'Cables', 'pcs'),
      ('STK-207', 'Din Rail', 105.00, 150.00, 16.00, 9, 'Cables', 'pcs'),
      ('STK-208', 'Earth Rod Small', 91.00, 130.00, 16.00, 5, 'Cables', 'pcs'),
      ('STK-209', 'Earth Rod Medium', 182.00, 260.00, 16.00, 3, 'Cables', 'pcs'),
      ('STK-210', 'Earth Rod Big', 273.00, 390.00, 16.00, 4, 'Cables', 'pcs'),
      ('STK-211', 'Electric Wire Box 4way', 1050.00, 1500.00, 16.00, 9, 'Electricals', 'pcs'),
      ('STK-212', 'Electric Wire Box 5way', 1400.00, 2000.00, 16.00, 40, 'Electricals', 'pcs'),
      ('STK-213', 'Electric Wire Box 6way', 1750.00, 2500.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-214', 'Electric Wire Box 8way', 2170.00, 3100.00, 16.00, 70, 'Electricals', 'pcs'),
      ('STK-215', 'Electric Wire Box 12way', 2450.00, 3500.00, 16.00, 17, 'Electricals', 'pcs'),
      ('STK-216', 'Mindy 40mm', 385.00, 550.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-217', 'Mindy 50mm', 490.00, 700.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-218', 'Mindy 60mm', 595.00, 850.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-219', 'Stellar 60mm', 350.00, 500.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-220', 'Stellar 70mm', 385.00, 550.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-221', 'Stellar 80mm', 420.00, 600.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-222', 'Tricycle 262', 154.00, 220.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-223', 'Tricycle 263', 210.00, 300.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-224', 'Tricycle 264', 280.00, 400.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-225', 'Tricycle 265', 455.00, 650.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-226', 'Tricycle 266', 735.00, 1050.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-227', 'Tricycle No: 2  262', 49.00, 70.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-228', 'Tricycle No: 2   263', 70.00, 100.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-229', 'Tricycle No: 2   264', 84.00, 120.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-230', 'Tricycle No: 2    265', 105.00, 150.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-231', 'Tricycle No: 2    266', 140.00, 200.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-232', 'Yongli Padlock 362', 56.00, 80.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-233', 'Yongli Padlock 363', 70.00, 100.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-234', 'Yongli Padlock 364', 84.00, 120.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-235', 'Yongli Padlock 365', 105.00, 150.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-236', 'Yongli Padlock 366', 140.00, 200.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-237', '7W DownLigther Warm White', 182.00, 260.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-238', '7W DownLigther Wh + Pink', 210.00, 300.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-239', '7W DownLigther Wh + Green', 210.00, 300.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-240', '7W DownLighter Wh + Red', 210.00, 300.00, 16.00, 10, 'Electricals', 'pcs'),
      ('STK-241', '3W R.Recess Panel', 140.00, 200.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-242', '3 + 3W R.Recess Panel Wh + Blu', 245.00, 350.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-243', '6 + 3 Recess  Wh + Blue/Green', 385.00, 550.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-244', '6W R.Recess Panel (Wh)', 210.00, 300.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-245', '6w R.Surface Panel (Wh)', 245.00, 350.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-246', '12W R.Recess Panel (Wh)', 245.00, 350.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-247', '12W R.Surface Panel(Wh)', 280.00, 400.00, 16.00, 5, 'Electricals', 'pcs'),
      ('STK-248', 'Meter Box Metallic Small', 210.00, 300.00, 16.00, 2, 'Electricals', 'pcs'),
      ('STK-249', 'Meter Box Metallic Big', 280.00, 400.00, 16.00, 3, 'Electricals', 'pcs'),
      ('STK-250', 'Meter Box Metallic Small', 1050.00, 1500.00, 16.00, 1, 'Electricals', 'pcs'),
      ('STK-251', 'Meter Box Coated Medium', 1260.00, 1800.00, 16.00, 1, 'Electricals', 'pcs'),
      ('STK-252', 'Hammers', 350.00, 500.00, 16.00, 4, 'Accessories', 'pcs'),
      ('STK-253', 'Mindy 50mm', 490.00, 700.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-254', 'Mindy 60mm', 595.00, 850.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-255', 'Stellar 60mm', 350.00, 500.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-256', 'Stellar 70mm', 385.00, 550.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-257', 'Stellar 80mm', 420.00, 600.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-258', 'Tricycle 262', 154.00, 220.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-259', 'Tricycle 263', 210.00, 300.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-260', 'Tricycle 264', 280.00, 400.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-261', 'Tricycle 265', 455.00, 650.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-262', 'Tricycle 266', 735.00, 1050.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-263', 'Tricycle No: 2  262', 49.00, 70.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-264', 'Tricycle No: 2   263', 70.00, 100.00, 16.00, 1, 'Others', 'pcs'),
      ('STK-265', 'Tricycle No: 2   264', 84.00, 120.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-266', 'Tricycle No: 2    265', 105.00, 150.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-267', 'Tricycle No: 2    266', 140.00, 200.00, 16.00, 2, 'Others', 'pcs'),
      ('STK-268', 'Yongli Padlock 362', 56.00, 80.00, 16.00, 1, 'Accessories', 'pcs'),
      ('STK-269', 'Yongli Padlock 363', 70.00, 100.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-270', 'Yongli Padlock 364', 84.00, 120.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-271', 'Yongli Padlock 365', 105.00, 150.00, 16.00, 2, 'Accessories', 'pcs'),
      ('STK-272', 'Yongli Padlock 366', 140.00, 200.00, 16.00, 2, 'Accessories', 'pcs');

-- Update any partially-created canonical rows first.
UPDATE public.products p
SET product_name = s.product_name,
    cost_price = s.cost_price,
    selling_price = s.selling_price,
    vat_rate = s.vat_rate,
    current_stock = s.opening_stock,
    min_stock = 0,
    unit = s.unit,
    category_id = c.id,
    status = 'active',
    tax_inclusive = FALSE
FROM canonical_catalog s
JOIN public.categories c ON lower(trim(c.name)) = lower(trim(s.category_name))
WHERE lower(trim(p.product_code)) = lower(trim(s.sku));

-- Insert missing canonical rows.
INSERT INTO public.products (
  product_code, product_name, category_id, cost_price, selling_price,
  vat_rate, current_stock, min_stock, unit, status, tax_inclusive
)
SELECT s.sku, s.product_name, c.id, s.cost_price, s.selling_price,
       s.vat_rate, s.opening_stock, 0, s.unit, 'active', FALSE
FROM canonical_catalog s
JOIN public.categories c ON lower(trim(c.name)) = lower(trim(s.category_name))
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE lower(trim(p.product_code)) = lower(trim(s.sku))
);

-- Set the primary branch to Main Branch when present, otherwise the first active branch.
UPDATE public.products p
SET primary_branch_id = b.id
FROM canonical_catalog s
CROSS JOIN LATERAL (
  SELECT id FROM public.branches
  WHERE is_active = TRUE
  ORDER BY CASE WHEN lower(name) = 'main branch' THEN 0 ELSE 1 END, id
  LIMIT 1
) b
WHERE lower(trim(p.product_code)) = lower(trim(s.sku));

-- Seed branch opening stock from the canonical physical stock list.
INSERT INTO public.product_stock (branch_id, product_id, current_stock, min_stock, created_at)
SELECT b.id, p.id, s.opening_stock, 0, NOW()
FROM canonical_catalog s
JOIN public.products p ON lower(trim(p.product_code)) = lower(trim(s.sku))
CROSS JOIN LATERAL (
  SELECT id FROM public.branches
  WHERE is_active = TRUE
  ORDER BY CASE WHEN lower(name) = 'main branch' THEN 0 ELSE 1 END, id
  LIMIT 1
) b
ON CONFLICT (branch_id, product_id) DO UPDATE
SET current_stock = EXCLUDED.current_stock,
    min_stock = EXCLUDED.min_stock;

UPDATE public.products p
SET current_stock = COALESCE((
  SELECT SUM(ps.current_stock) FROM public.product_stock ps WHERE ps.product_id = p.id
), 0)
WHERE EXISTS (
  SELECT 1 FROM canonical_catalog s
  WHERE lower(trim(s.sku)) = lower(trim(p.product_code))
);

INSERT INTO public.catalog_seed_metadata (id, source_name, source_version, row_count)
VALUES (1, 'Stock_Inventory_POS_Import_Template_With_Buying_Price.xlsx', 'canonical-272-v1', 272)
ON CONFLICT (id) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  source_version = EXCLUDED.source_version,
  row_count = EXCLUDED.row_count,
  installed_at = NOW();

SELECT setval('public.products_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.products), 1), 1), TRUE);
SELECT setval('public.product_stock_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.product_stock), 1), 1), TRUE);

COMMIT;
