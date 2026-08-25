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

function mountInventoryV3BranchRoutes(app) {
  if (app.__inventoryV3BranchRoutesMounted) return;
  app.__inventoryV3BranchRoutesMounted = true;

  app.get('/api/v3/inventory/products', async (req, res) => {
    const id = branchId(req);
    if (!id) return res.status(400).json({ error: 'A valid branchId is required.' });
    try {
      const q = String(req.query.q || '').trim();
      const params = [id];
      let where = 'p.is_active = TRUE';
      if (q) {
        params.push(`%${q}%`);
        where += ` AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.barcode,\'\') ILIKE $2)`;
      }
      const result = await db().query(`
        SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
               p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
               COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s
          ON s.product_id = p.id AND s.branch_id = $1
        WHERE ${where}
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
        SELECT
          COUNT(DISTINCT p.id)::BIGINT AS total_products,
          COALESCE(SUM(s.quantity_on_hand), 0) AS total_units,
          COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand, 0) = 0)::BIGINT AS out_of_stock_items,
          COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand, 0) > 0
                            AND COALESCE(s.quantity_on_hand, 0) <= p.reorder_level)::BIGINT AS low_stock_items,
          COALESCE(SUM(s.quantity_on_hand * p.cost_price), 0) AS inventory_cost_value,
          GREATEST(
            COALESCE(MAX(p.updated_at), TIMESTAMPTZ 'epoch'),
            COALESCE(MAX(s.updated_at), TIMESTAMPTZ 'epoch')
          ) AS last_updated
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s
          ON s.product_id = p.id AND s.branch_id = $1
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
