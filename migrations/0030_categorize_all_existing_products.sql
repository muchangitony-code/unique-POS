BEGIN;

-- Categorize every existing product using the current Products catalogue as
-- the source of truth. This does not create, delete, duplicate, or rename products.

INSERT INTO public.categories (name, description, created_at)
SELECT v.name, v.description, NOW()
FROM (VALUES
 ('Bulbs','LED, rechargeable and intelligent bulbs'),
 ('AC Lighting','LED tubes, fittings, wall lights, floodlights and AC lighting'),
 ('Solar Lighting','Solar lamps, floodlights, torches and solar lighting'),
 ('Lighting Accessories','Lamp holders, ceiling roses, photocells, chasers and lighting accessories'),
 ('Switches & Sockets','Switches, sockets, cooker outlets, plugs and switch accessories'),
 ('Protection','MCBs, breakers, guards, RCCBs, surge and electrical protection'),
 ('Cables','Electrical, solar and data cables and wires'),
 ('Conduits','Conduit, trunking, boxes and cable routing materials'),
 ('Solar Accessories','Solar controllers, connectors, mounting and PV accessories'),
 ('Phone Accessories','Chargers, USB cables and mobile accessories'),
 ('Tools','Hand tools, testers, pliers and screwdrivers'),
 ('Hardware','Locks, hinges, fasteners and general hardware'),
 ('Locks','Padlocks, door locks and locking hardware'),
 ('Plumbing Accessories','Shower, taps, fittings and plumbing accessories'),
 ('Electrical Appliances','Kettles, blenders, heaters and electrical appliances'),
 ('ICT','Routers, networking and computer products'),
 ('Electrical Accessories','Extensions, batteries and general electrical accessories'),
 ('General Products','Products not matched to a specialist category')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(trim(c.name))=lower(v.name));

WITH classified AS (
 SELECT p.id,
 CASE
  WHEN lower(p.product_name) ~ '(bulb|rechargeable bulb|intelligent bulb)' THEN 'Bulbs'
  WHEN lower(p.product_name) ~ '(solar.*(lamp|light|flood|torch)|solar torch)' THEN 'Solar Lighting'
  WHEN lower(p.product_name) ~ '(floodlight|led tube|dustproof|2ft fitting|4ft fitting|wallmount|snakelight|led panel)' THEN 'AC Lighting'
  WHEN lower(p.product_name) ~ '(holder|ceiling rose|photocell|chaser|casser|caser|lamp base)' THEN 'Lighting Accessories'
  WHEN lower(p.product_name) ~ '(socket|switch|top plug|dp switch|door bell|ding dong|plug)' THEN 'Switches & Sockets'
  WHEN lower(p.product_name) ~ '(mcb|breaker|rccb|rcbo|fridge guard|tv guard|surge|protection|fuse)' THEN 'Protection'
  WHEN lower(p.product_name) ~ '(cable|wire|flex|twin.*earth|solar cable|usb)' THEN 'Cables'
  WHEN lower(p.product_name) ~ '(conduit|trunking|pvc pipe|junction box|adaptable box)' THEN 'Conduits'
  WHEN lower(p.product_name) ~ '(solar|pv|panel|inverter|charge controller|mc4|combiner|mounting)' THEN 'Solar Accessories'
  WHEN lower(p.product_name) ~ '(charger|type c|iphone|phone|earphone|headset|power bank)' THEN 'Phone Accessories'
  WHEN lower(p.product_name) ~ '(pliers|screwdriver|tester|spanner|hammer|drill|cutter|tool)' THEN 'Tools'
  WHEN lower(p.product_name) ~ '(padlock|mortice|cylinder lock|door lock)' THEN 'Locks'
  WHEN lower(p.product_name) ~ '(hinge|bolt|nut|screw|nail|hasp|hardware)' THEN 'Hardware'
  WHEN lower(p.product_name) ~ '(showerhead|tap|valve|plumbing|pipe fitting)' THEN 'Plumbing Accessories'
  WHEN lower(p.product_name) ~ '(kettle|blender|heater|iron|cooker|appliance)' THEN 'Electrical Appliances'
  WHEN lower(p.product_name) ~ '(router|network|computer|laptop|ict)' THEN 'ICT'
  WHEN lower(p.product_name) ~ '(extension|battery|cell|adapter)' THEN 'Electrical Accessories'
  ELSE 'General Products'
 END AS category_name
 FROM public.products p
)
UPDATE public.products p
SET category_id = c.id
FROM classified x
JOIN public.categories c ON lower(trim(c.name))=lower(x.category_name)
WHERE p.id=x.id;

COMMIT;
