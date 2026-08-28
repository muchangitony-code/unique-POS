'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

let pool;
function db() {
  if (!pool) {
    const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-v3-branch-routes');
    pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 10 });
  }
  return pool;
}

function branchId(req) {
  const id = Number(req.query.branchId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
  const aliases = {
    'solar panel': 'solar panels', 'solar panels': 'solar panels', 'pv panel': 'solar panels', 'pv panels': 'solar panels',
    inverter: 'inverters', inverters: 'inverters', battery: 'batteries', batteries: 'batteries',
    accessory: 'accessories', accessories: 'accessories', cable: 'cables', cables: 'cables',
    electrical: 'electricals', electricals: 'electricals', other: 'others', others: 'others'
  };
  return aliases[key] || key;
}

function mountInventoryV3BranchRoutes(app) {
  if (app.__inventoryV3BranchRoutesMounted) return;
  app.__inventoryV3BranchRoutesMounted = true;

  app.get('/api/v3/inventory/products', async (req, res) => {
    const id = branchId(req);
    if (!id) return res.status(400).json({ error: 'A valid branchId is required.' });
    try {
      const q = String(req.query.q || '').trim();
      const category = normalizeCategory(req.query.category || req.query.category_name || req.query.categoryName);
      const params = [id];
      const clauses = ['p.is_active = TRUE', 'p.pos_enabled = TRUE'];
      if (q) {
        params.push(`%${q}%`);
        clauses.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`);
      }
      if (category && category !== 'all' && category !== 'all products') {
        params.push(category);
        const n = params.length;
        clauses.push(`CASE
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('solar panel','solar panels','pv panel','pv panels') THEN 'solar panels'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('inverter','inverters') THEN 'inverters'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('battery','batteries') THEN 'batteries'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('accessory','accessories') THEN 'accessories'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('cable','cables') THEN 'cables'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('electrical','electricals') THEN 'electricals'
          WHEN regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g') IN ('other','others') THEN 'others'
          ELSE regexp_replace(lower(trim(COALESCE(p.category,''))), '[^a-z0-9]+', ' ', 'g')
        END = $${n}`);
      }
      const result = await db().query(`
        SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
               p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
               p.is_active, p.pos_enabled,
               COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s
          ON s.product_id = p.id AND s.branch_id = $1
        WHERE ${clauses.join(' AND ')}
        ORDER BY p.name ASC
      `, params);
      res.set('Cache-Control', 'no-store').json({ products: result.rows, branch_id: id });
    } catch (error) {
      console.error('[inventory-v3] branch catalogue failed', error);
      res.status(500).json({ error: 'Unable to load branch inventory.' });
    }
  });

  app.get('/api/v3/inventory/dashboard', async (req, res) => {
    const id = branchId(req);
    if (!id) return res.status(400).json({ error: 'A valid branchId is required.' });
    try {
      const result = await db().query(`
        SELECT COUNT(DISTINCT p.id)::BIGINT AS total_products,
               COALESCE(SUM(s.quantity_on_hand), 0) AS total_units,
               COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand, 0) = 0)::BIGINT AS out_of_stock_items,
               COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand, 0) > 0 AND COALESCE(s.quantity_on_hand, 0) <= p.reorder_level)::BIGINT AS low_stock_items,
               COALESCE(SUM(s.quantity_on_hand * p.cost_price), 0) AS inventory_cost_value,
               GREATEST(COALESCE(MAX(p.updated_at), TIMESTAMPTZ 'epoch'), COALESCE(MAX(s.updated_at), TIMESTAMPTZ 'epoch')) AS last_updated
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s ON s.product_id = p.id AND s.branch_id = $1
        WHERE p.is_active = TRUE
      `, [id]);
      res.set('Cache-Control', 'no-store').json({ ...result.rows[0], branch_id: id });
    } catch (error) {
      console.error('[inventory-v3] branch dashboard failed', error);
      res.status(500).json({ error: 'Unable to load branch inventory dashboard.' });
    }
  });
}

module.exports = { mountInventoryV3BranchRoutes };