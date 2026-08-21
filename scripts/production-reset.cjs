'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

const CONFIRM_TEST = 'DELETE_TEST_DOCUMENTS';
const CONFIRM_ALL = 'DELETE_ALL_DOCUMENTS';
const CONFIRM_CATALOG = 'DELETE_ALL_PRODUCTS_INVENTORY';

// Only these tables contain disposable inventory/catalog relationships.
// Transactional history is deliberately NOT in this allow-list.
const INVENTORY_CHILD_TABLES = new Set([
  'product_stock',
  'stock',
  'stock_adjustments',
  'stock_movements',
  'barcode_labels'
]);

function assertSafeReset(scope) {
  const nodeEnv = String(process.env.NODE_ENV || 'production').toLowerCase();
  const confirm = process.env.RESET_CONFIRM || '';
  if (!['test', 'all', 'catalog'].includes(scope)) {
    throw new Error('RESET_SCOPE must be test, all, or catalog.');
  }
  if (['all', 'catalog'].includes(scope) && nodeEnv === 'production' && process.env.ALLOW_PRODUCTION_RESET !== 'YES') {
    throw new Error('Production reset is blocked. Set ALLOW_PRODUCTION_RESET=YES explicitly.');
  }
  const expected = scope === 'all' ? CONFIRM_ALL : scope === 'catalog' ? CONFIRM_CATALOG : CONFIRM_TEST;
  if (confirm !== expected) throw new Error(`Destructive reset blocked. Set RESET_CONFIRM=${expected}.`);
}

async function count(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

function quoteIdent(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

async function findProductReferences(client) {
  const { rows } = await client.query(`
    SELECT
      child.relname AS table_name,
      child_col.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute child_col
      ON child_col.attrelid = child.oid
     AND child_col.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND parent.relname = 'products'
      AND child.relnamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
    ORDER BY child.relname, child_col.attname
  `);
  return rows;
}

async function countProductReferences(client, tableName, columnName) {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM ${quoteIdent(tableName)} child
    JOIN products p ON p.id = child.${quoteIdent(columnName)}
  `;
  const { rows } = await client.query(sql);
  return rows[0].count;
}

async function resetCatalogSafely(client) {
  const references = await findProductReferences(client);
  const blocking = [];

  for (const ref of references) {
    const refCount = await countProductReferences(client, ref.table_name, ref.column_name);
    if (refCount === 0) continue;
    if (!INVENTORY_CHILD_TABLES.has(ref.table_name)) {
      blocking.push({ ...ref, count: refCount });
    }
  }

  if (blocking.length) {
    throw new Error(
      'Catalog reset aborted because products are referenced by transactional/history records: ' +
      JSON.stringify(blocking) +
      '. No data was deleted. Archive or clear those transactions first.'
    );
  }

  // Remove only disposable inventory rows that reference the current product set.
  // Do not use CASCADE: that could silently erase sales, invoices, purchases or returns.
  for (const ref of references) {
    if (!INVENTORY_CHILD_TABLES.has(ref.table_name)) continue;
    await client.query(`
      DELETE FROM ${quoteIdent(ref.table_name)} child
      USING products p
      WHERE child.${quoteIdent(ref.column_name)} = p.id
    `);
  }

  const deleted = await client.query('DELETE FROM products');

  await client.query(`
    DO $$
    BEGIN
      IF to_regclass('public.products_id_seq') IS NOT NULL THEN
        PERFORM setval('public.products_id_seq', 1, false);
      END IF;
    END $$;
  `);

  return deleted.rowCount;
}

async function run() {
  const scope = String(process.env.RESET_SCOPE || 'test').toLowerCase();
  assertSafeReset(scope);
  const { databaseUrl } = parseAndValidateDatabaseUrl('production-reset');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();

  try {
    const before = {
      products: await count(client, 'products'),
      stock: await count(client, 'stock'),
      product_stock: await count(client, 'product_stock'),
      stock_movements: await count(client, 'stock_movements'),
      stock_adjustments: await count(client, 'stock_adjustments'),
      stock_transfers: await count(client, 'stock_transfers'),
      purchases: await count(client, 'purchases'),
      purchase_items: await count(client, 'purchase_items'),
      quotations: await count(client, 'quotations'),
      invoices: await count(client, 'invoices')
    };
    console.log('[production-reset] Before', before);

    await client.query('BEGIN');

    if (scope === 'all') {
      // Preserve master data including products. This behavior is unchanged.
      await client.query('TRUNCATE TABLE invoices, quotations RESTART IDENTITY CASCADE');
      await client.query("DELETE FROM document_sequences WHERE lower(doc_type) IN ('invoice', 'quotation', 'quote')");
    } else if (scope === 'catalog') {
      // Clean-start product/inventory catalogue reset.
      // This branch is deliberately conservative: any product referenced by
      // transactional history causes a full rollback instead of a cascade delete.
      const deletedProducts = await resetCatalogSafely(client);
      console.log('[production-reset] Catalog products removed', { deletedProducts });
      // Categories, brands, customers, branches, users, settings and document
      // history are intentionally preserved so the POS remains operational.
    } else {
      const invoiceIds = (await client.query(`
        SELECT id FROM invoices
        WHERE lower(coalesce(invoice_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
           OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
      `)).rows.map(r => r.id);
      const quotationIds = (await client.query(`
        SELECT id FROM quotations
        WHERE lower(coalesce(quotation_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
           OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
      `)).rows.map(r => r.id);

      if (invoiceIds.length) {
        await client.query('DELETE FROM invoices WHERE id = ANY($1::int[])', [invoiceIds]);
      }
      if (quotationIds.length) {
        await client.query('DELETE FROM quotations WHERE id = ANY($1::int[])', [quotationIds]);
      }
      console.log('[production-reset] Test document IDs removed', { invoices: invoiceIds, quotations: quotationIds });
    }

    await client.query('COMMIT');

    const after = {
      products: await count(client, 'products'),
      stock: await count(client, 'stock'),
      product_stock: await count(client, 'product_stock'),
      stock_movements: await count(client, 'stock_movements'),
      stock_adjustments: await count(client, 'stock_adjustments'),
      stock_transfers: await count(client, 'stock_transfers'),
      purchases: await count(client, 'purchases'),
      purchase_items: await count(client, 'purchase_items'),
      quotations: await count(client, 'quotations'),
      invoices: await count(client, 'invoices')
    };
    console.log('[production-reset] After', after);
    console.log('[production-reset] Completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(error => {
  console.error('[production-reset] FAILED:', error.message || error);
  process.exit(1);
});
