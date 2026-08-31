'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

function parseOpeningStockSeed(sql) {
  const match = sql.match(/WITH\s+seed\s*\(\s*product_name\s*,\s*selling_price\s*,\s*opening_stock\s*\)\s+AS\s*\(\s*VALUES([\s\S]*?)\n\s*\)\s*,/i);
  if (!match) throw new Error('Opening-stock recovery SQL did not contain the expected seed VALUES block');
  const rows = [];
  const tuple = /\(\s*'((?:''|[^'])*)'\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  let item;
  while ((item = tuple.exec(match[1]))) {
    rows.push({ productName: item[1].replace(/''/g, "'"), sellingPrice: Number(item[2]), openingStock: Number(item[3]) });
  }
  if (!rows.length) throw new Error('Opening-stock recovery SQL contained no seed rows');
  return rows;
}

function normalizedName(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
}

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
      if (!tables.products || !tables.stock || !tables.branches) return { repaired: 0, source: 'unavailable' };

      const branch = await client.query(`SELECT id FROM branches
        WHERE is_active=TRUE
        ORDER BY CASE WHEN code='MAIN' OR lower(trim(name))='main branch' THEN 0 ELSE 1 END,id LIMIT 1`);
      if (!branch.rowCount) return { repaired: 0, source: 'no-active-branch' };
      const branchId = branch.rows[0].id;
      const sources = [];

      await client.query('BEGIN');
      try {
        if (tables.legacy_stock && tables.legacy_products) {
          const result = await client.query(`
            WITH source_stock AS (
              SELECT regexp_replace(lower(trim(p.product_code)),'[^a-z0-9]','','g') AS sku_key,
                     regexp_replace(lower(trim(p.product_name)),'[^a-z0-9]','','g') AS name_key,
                     ps.current_stock::numeric AS quantity,
                     COALESCE(ps.branch_id,$1) AS branch_id
              FROM product_stock ps JOIN products p ON p.id=ps.product_id
              WHERE COALESCE(ps.current_stock,0)>0
            ), matched AS (
              SELECT ip.id AS product_id, ss.branch_id, MAX(ss.quantity) AS quantity
              FROM source_stock ss JOIN inventory_products_v2 ip
                ON (ss.sku_key<>'' AND regexp_replace(lower(trim(ip.sku)),'[^a-z0-9]','','g')=ss.sku_key)
                OR (ss.name_key<>'' AND regexp_replace(lower(trim(ip.name)),'[^a-z0-9]','','g')=ss.name_key)
              GROUP BY ip.id,ss.branch_id
            )
            INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
            SELECT product_id,branch_id,quantity FROM matched
            ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),updated_at=NOW()
            RETURNING product_id`, [branchId]);
          if (result.rowCount) sources.push(`legacy-product-stock:${result.rowCount}`);
        }

        const ledger = await client.query(`SELECT to_regclass('public.product_import_rows') AS ledger`);
        if (ledger.rows[0].ledger) {
          const result = await client.query(`
            WITH source_rows AS (
              SELECT regexp_replace(lower(trim(COALESCE(normalized_data->>'product_code',normalized_data->>'sku',raw_data->>'Product Code',raw_data->>'SKU',''))),'[^a-z0-9]','','g') AS sku_key,
                     regexp_replace(lower(trim(COALESCE(normalized_data->>'product_name',normalized_data->>'name',raw_data->>'Product Name',''))),'[^a-z0-9]','','g') AS name_key,
                     GREATEST(COALESCE((SELECT CASE WHEN trim(e.value) ~ '^-?[0-9]+([.][0-9]+)?$' THEN trim(e.value)::numeric END
                       FROM jsonb_each_text(COALESCE(normalized_data,'{}'::jsonb)||COALESCE(raw_data,'{}'::jsonb)) e
                       WHERE regexp_replace(lower(e.key),'[^a-z0-9]','','g') IN ('currentstock','openingstock','availableqty','availablequantity','stock','qty','quantity') LIMIT 1),0),0) AS quantity
              FROM product_import_rows
            ), matched AS (
              SELECT ip.id AS product_id,MAX(sr.quantity) AS quantity FROM source_rows sr JOIN inventory_products_v2 ip
                ON (sr.sku_key<>'' AND regexp_replace(lower(trim(ip.sku)),'[^a-z0-9]','','g')=sr.sku_key)
                OR (sr.name_key<>'' AND regexp_replace(lower(trim(ip.name)),'[^a-z0-9]','','g')=sr.name_key)
              WHERE sr.quantity>0 GROUP BY ip.id
            )
            INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
            SELECT product_id,$1,quantity FROM matched
            ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),updated_at=NOW()
            RETURNING product_id`, [branchId]);
          if (result.rowCount) sources.push(`import-ledger:${result.rowCount}`);
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }

      const recoveryPath = path.join(__dirname, '..', 'migrations', '0029_restore_main_branch_opening_stock.sql');
      let strictMatches = 0, normalizedMatches = 0, unmatched = 0, restored = 0;
      if (fs.existsSync(recoveryPath)) {
        const seen = new Map();
        for (const row of parseOpeningStockSeed(fs.readFileSync(recoveryPath, 'utf8'))) {
          const key = `${normalizedName(row.productName)}\u0000${row.sellingPrice}`;
          const previous = seen.get(key);
          if (!previous || row.openingStock > previous.openingStock) seen.set(key, row);
        }
        for (const row of seen.values()) {
          if (row.openingStock <= 0) continue;
          const key = normalizedName(row.productName);
          let product = await client.query(`SELECT id FROM inventory_products_v2
            WHERE is_active=TRUE AND regexp_replace(lower(trim(name)),'[^a-z0-9]','','g')=$1 AND selling_price=$2
            ORDER BY id LIMIT 1`, [key, row.sellingPrice]);
          if (product.rowCount) strictMatches += 1;
          if (!product.rowCount) {
            product = await client.query(`SELECT id FROM inventory_products_v2
              WHERE is_active=TRUE AND regexp_replace(lower(trim(name)),'[^a-z0-9]','','g')=$1
              ORDER BY id LIMIT 1`, [key]);
            if (product.rowCount) normalizedMatches += 1;
          }
          if (!product.rowCount) { unmatched += 1; continue; }
          const upsert = await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand)
            VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE
            SET quantity_on_hand=GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand),updated_at=NOW()
            RETURNING product_id`, [product.rows[0].id, branchId, row.openingStock]);
          restored += upsert.rowCount;
        }
        sources.push(`workbook:${restored}-restored:${strictMatches}-price-match:${normalizedMatches}-name-match:${unmatched}-unmatched`);
      }

      const summary = await client.query(`SELECT COUNT(*) FILTER (WHERE quantity_on_hand>0)::int AS positive_lines,
        COALESCE(SUM(quantity_on_hand),0) AS total_units FROM inventory_stock_v2 WHERE branch_id=$1`, [branchId]);
      return { repaired: Number(summary.rows[0].positive_lines || 0), totalUnits: Number(summary.rows[0].total_units || 0), source: sources.join('+') || 'none', branchId };
    } finally { client.release(); }
  } finally { await pool.end(); }
}
module.exports = { repairInventoryStock };
