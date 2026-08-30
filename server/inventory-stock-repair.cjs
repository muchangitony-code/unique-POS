'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

async function repairInventoryStock() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-stock-repair');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query(`SELECT to_regclass('public.inventory_products_v2') AS products, to_regclass('public.inventory_stock_v2') AS stock, to_regclass('public.product_stock') AS legacy_stock, to_regclass('public.branches') AS branches`);
      const tables = exists.rows[0];
      if (!tables.products || !tables.stock || !tables.branches) {
        await client.query('ROLLBACK');
        return { repaired: 0, source: 'unavailable' };
      }
      const branch = await client.query(`SELECT id FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1`);
      if (!branch.rowCount) {
        await client.query('ROLLBACK');
        return { repaired: 0, source: 'no-active-branch' };
      }
      const branchId = branch.rows[0].id;
      let repaired = 0;
      let source = 'none';

      if (tables.legacy_stock) {
        const result = await client.query(`
          WITH source_stock AS (
            SELECT lower(trim(p.product_code)) AS sku_key, lower(trim(p.product_name)) AS name_key,
                   ps.current_stock::numeric AS quantity,
                   COALESCE(ps.branch_id, $1) AS branch_id
            FROM product_stock ps
            JOIN products p ON p.id = ps.product_id
            WHERE COALESCE(ps.current_stock, 0) > 0
          ), matched AS (
            SELECT ip.id AS product_id, ss.branch_id, MAX(ss.quantity) AS quantity
            FROM source_stock ss
            JOIN inventory_products_v2 ip
              ON lower(trim(ip.sku)) = ss.sku_key
              OR (ss.sku_key IS NULL AND lower(trim(ip.name)) = ss.name_key)
            GROUP BY ip.id, ss.branch_id
          )
          INSERT INTO inventory_stock_v2 (product_id, branch_id, quantity_on_hand)
          SELECT product_id, branch_id, quantity FROM matched
          ON CONFLICT (product_id, branch_id) DO UPDATE
            SET quantity_on_hand = GREATEST(inventory_stock_v2.quantity_on_hand, EXCLUDED.quantity_on_hand), updated_at = NOW()
          RETURNING product_id
        `, [branchId]);
        repaired += result.rowCount;
        if (result.rowCount) source = 'legacy-product-stock';
      }

      if (repaired === 0) {
        const ledger = await client.query(`SELECT to_regclass('public.product_import_rows') AS rows`);
        if (ledger.rows[0].rows) {
          const result = await client.query(`
            WITH ledger AS (
              SELECT lower(trim(COALESCE(r.normalized_data->>'product_code', r.normalized_data->>'sku', r.raw_data->>'Product Code', r.raw_data->>'SKU'))) AS sku_key,
                     lower(trim(COALESCE(r.normalized_data->>'product_name', r.normalized_data->>'name', r.raw_data->>'Product Name'))) AS name_key,
                     GREATEST(COALESCE((
                       SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric END
                       FROM jsonb_each_text(COALESCE(r.normalized_data, '{}'::jsonb) || COALESCE(r.raw_data, '{}'::jsonb)) e
                       WHERE regexp_replace(lower(e.key), '[^a-z0-9]', '', 'g') IN ('currentstock','openingstock','availableqty','availablequantity','stock','qty','quantity')
                       ORDER BY r.id DESC LIMIT 1
                     ), 0), 0) AS quantity
              FROM product_import_rows r
            ), matched AS (
              SELECT ip.id AS product_id, MAX(l.quantity) AS quantity
              FROM ledger l JOIN inventory_products_v2 ip
                ON (l.sku_key IS NOT NULL AND lower(trim(ip.sku)) = l.sku_key)
                OR (l.sku_key IS NULL AND l.name_key IS NOT NULL AND lower(trim(ip.name)) = l.name_key)
              WHERE l.quantity > 0 GROUP BY ip.id
            )
            INSERT INTO inventory_stock_v2 (product_id, branch_id, quantity_on_hand)
            SELECT product_id, $1, quantity FROM matched
            ON CONFLICT (product_id, branch_id) DO UPDATE
              SET quantity_on_hand = GREATEST(inventory_stock_v2.quantity_on_hand, EXCLUDED.quantity_on_hand), updated_at = NOW()
            RETURNING product_id
          `, [branchId]);
          repaired += result.rowCount;
          if (result.rowCount) source = 'import-ledger';
        }
      }
      await client.query('COMMIT');
      return { repaired, source, branchId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}

module.exports = { repairInventoryStock };
