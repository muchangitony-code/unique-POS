'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

async function repairInventoryStock() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-stock-repair');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 1 });

  try {
    const client = await pool.connect();
    try {
      const exists = await client.query(`SELECT
        to_regclass('public.inventory_products_v2') AS products,
        to_regclass('public.inventory_stock_v2') AS stock,
        to_regclass('public.product_stock') AS legacy_stock,
        to_regclass('public.products') AS legacy_products,
        to_regclass('public.branches') AS branches`);
      const tables = exists.rows[0];

      if (!tables.products || !tables.stock || !tables.branches) {
        return { repaired: 0, source: 'unavailable' };
      }

      const branch = await client.query(`SELECT id
        FROM branches
        WHERE is_active=TRUE AND (code='MAIN' OR lower(trim(name))='main branch')
        ORDER BY CASE WHEN code='MAIN' THEN 0 ELSE 1 END, id
        LIMIT 1`);
      if (!branch.rowCount) return { repaired: 0, source: 'no-main-branch' };

      const branchId = branch.rows[0].id;
      const sources = [];

      // Reconcile every available source. A partial match from one source must
      // never prevent unmatched products from being recovered by the next one.
      await client.query('BEGIN');
      try {
        if (tables.legacy_stock && tables.legacy_products) {
          const result = await client.query(`
            WITH source_stock AS (
              SELECT lower(trim(p.product_code)) AS sku_key,
                     lower(trim(p.product_name)) AS name_key,
                     ps.current_stock::numeric AS quantity,
                     COALESCE(ps.branch_id,$1) AS branch_id
              FROM product_stock ps
              JOIN products p ON p.id=ps.product_id
              WHERE COALESCE(ps.current_stock,0)>0
            ), matched AS (
              SELECT ip.id AS product_id, ss.branch_id, MAX(ss.quantity) AS quantity
              FROM source_stock ss
              JOIN inventory_products_v2 ip
                ON lower(trim(ip.sku))=ss.sku_key
                OR (ss.sku_key IS NULL AND lower(trim(ip.name))=ss.name_key)
              GROUP BY ip.id,ss.branch_id
            )
            INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
            SELECT product_id,branch_id,quantity FROM matched
            ON CONFLICT(product_id,branch_id) DO UPDATE
              SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),
                  updated_at=NOW()
            RETURNING product_id`, [branchId]);
          if (result.rowCount) sources.push('legacy-product-stock');
        }

        const ledger = await client.query(`SELECT to_regclass('public.product_import_rows') AS ledger`);
        if (ledger.rows[0].ledger) {
          const result = await client.query(`
            WITH source_rows AS (
              SELECT lower(trim(COALESCE(normalized_data->>'product_code',normalized_data->>'sku',raw_data->>'Product Code',raw_data->>'SKU'))) AS sku_key,
                     lower(trim(COALESCE(normalized_data->>'product_name',normalized_data->>'name',raw_data->>'Product Name'))) AS name_key,
                     GREATEST(COALESCE((
                       SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric END
                       FROM jsonb_each_text(COALESCE(normalized_data,'{}'::jsonb)||COALESCE(raw_data,'{}'::jsonb)) e
                       WHERE regexp_replace(lower(e.key),'[^a-z0-9]','','g') IN ('currentstock','openingstock','availableqty','availablequantity','stock','qty','quantity')
                       LIMIT 1
                     ),0),0) AS quantity
              FROM product_import_rows
            ), matched AS (
              SELECT ip.id AS product_id,MAX(sr.quantity) AS quantity
              FROM source_rows sr
              JOIN inventory_products_v2 ip
                ON (sr.sku_key IS NOT NULL AND lower(trim(ip.sku))=sr.sku_key)
                OR (sr.sku_key IS NULL AND sr.name_key IS NOT NULL AND lower(trim(ip.name))=sr.name_key)
              WHERE sr.quantity>0
              GROUP BY ip.id
            )
            INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
            SELECT product_id,$1,quantity FROM matched
            ON CONFLICT(product_id,branch_id) DO UPDATE
              SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),
                  updated_at=NOW()
            RETURNING product_id`, [branchId]);
          if (result.rowCount) sources.push('import-ledger');
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }

      // The workbook recovery is authoritative and fills products that legacy
      // sources did not restore. Run it regardless of partial earlier matches.
      const recoveryPath = path.join(__dirname,'..','migrations','0029_restore_main_branch_opening_stock.sql');
      if (fs.existsSync(recoveryPath)) {
        await client.query(fs.readFileSync(recoveryPath,'utf8'));
        sources.push('authoritative-opening-stock');
      }

      const count = await client.query(`SELECT COUNT(*)::int AS lines
        FROM inventory_stock_v2
        WHERE branch_id=$1 AND quantity_on_hand>0`, [branchId]);
      const repaired = Number(count.rows[0]?.lines || 0);
      return { repaired, source: sources.join('+') || 'none', branchId };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

module.exports={repairInventoryStock};
