'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

async function recoverInventoryFromLedger() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-ledger-recovery');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 1 });
  try {
    const client = await pool.connect();
    try {
      const tables = await client.query(`SELECT
        to_regclass('public.inventory_products_v2') AS products,
        to_regclass('public.inventory_stock_v2') AS stock,
        to_regclass('public.product_import_rows') AS ledger,
        to_regclass('public.branches') AS branches`);
      const t = tables.rows[0];
      if (!t.products || !t.stock || !t.ledger || !t.branches) return { recovered: 0, source: 'unavailable' };

      const branch = await client.query(`SELECT id FROM branches WHERE is_active=TRUE
        ORDER BY CASE WHEN code='MAIN' OR lower(trim(name))='main branch' THEN 0 ELSE 1 END,id LIMIT 1`);
      if (!branch.rowCount) return { recovered: 0, source: 'no-active-branch' };
      const branchId = branch.rows[0].id;

      await client.query('BEGIN');
      try {
        const result = await client.query(`
          WITH source_rows AS (
            SELECT
              regexp_replace(lower(trim(COALESCE(normalized_data->>'product_code',normalized_data->>'sku',raw_data->>'Product Code',raw_data->>'SKU',raw_data->>'product_code',raw_data->>'sku',''))),'[^a-z0-9]','','g') AS sku_key,
              regexp_replace(lower(trim(COALESCE(normalized_data->>'product_name',normalized_data->>'name',raw_data->>'Product Name',raw_data->>'product_name',raw_data->>'name',''))),'[^a-z0-9]','','g') AS name_key,
              GREATEST(COALESCE((
                SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric END
                FROM jsonb_each_text(COALESCE(normalized_data,'{}'::jsonb)||COALESCE(raw_data,'{}'::jsonb)) e
                WHERE regexp_replace(lower(e.key),'[^a-z0-9]','','g') IN ('currentstock','openingstock','availableqty','availablequantity','stock','qty','quantity')
                ORDER BY CASE regexp_replace(lower(e.key),'[^a-z0-9]','','g')
                  WHEN 'currentstock' THEN 1 WHEN 'openingstock' THEN 2
                  WHEN 'availableqty' THEN 3 WHEN 'availablequantity' THEN 4
                  WHEN 'stock' THEN 5 WHEN 'qty' THEN 6 WHEN 'quantity' THEN 7 ELSE 99 END
                LIMIT 1
              ),0),0) AS quantity
            FROM product_import_rows
          ), matched AS (
            SELECT ip.id AS product_id, MAX(sr.quantity) AS quantity
            FROM source_rows sr JOIN inventory_products_v2 ip
              ON (sr.sku_key<>'' AND regexp_replace(lower(trim(ip.sku)),'[^a-z0-9]','','g')=sr.sku_key)
              OR (sr.name_key<>'' AND regexp_replace(lower(trim(ip.name)),'[^a-z0-9]','','g')=sr.name_key)
            WHERE sr.quantity>0
            GROUP BY ip.id
          )
          INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
          SELECT product_id,$1,quantity FROM matched
          ON CONFLICT(product_id,branch_id) DO UPDATE
            SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),updated_at=NOW()
          RETURNING product_id`, [branchId]);
        await client.query('COMMIT');
        return { recovered: result.rowCount, branchId, source: 'prioritized-import-ledger' };
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

module.exports = { recoverInventoryFromLedger };
