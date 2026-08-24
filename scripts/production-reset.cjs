'use strict';

const { Pool } = require('pg');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

const CONFIRM_TEST = 'DELETE_TEST_DOCUMENTS';
const CONFIRM_CATALOG = 'DELETE_ALL_PRODUCTS_INVENTORY';
const INVENTORY_CHILD_TABLES = new Set(['product_stock', 'stock', 'stock_adjustments', 'stock_movements', 'barcode_labels']);

function assertSafeReset(scope) {
  const confirm = process.env.RESET_CONFIRM || '';
  if (!['test', 'catalog'].includes(scope)) throw new Error('RESET_SCOPE must be test or catalog. The destructive all mode has been removed.');
  if (process.env.RESET_ALLOW !== 'YES') throw new Error(`Destructive reset blocked. Written approval is required; set RESET_ALLOW=YES only for the approved ${scope} reset.`);
  if (process.env.RESET_APPROVED_SCOPE !== scope) throw new Error(`Destructive reset blocked. RESET_APPROVED_SCOPE=${scope} is required for this specific operation.`);
  const expected = scope === 'catalog' ? CONFIRM_CATALOG : CONFIRM_TEST;
  if (confirm !== expected) throw new Error(`Destructive reset blocked. Set RESET_CONFIRM=${expected}.`);
}

function createFreshBackup() {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, 'backup-before-migration.cjs')], {
    stdio: ['ignore', 'pipe', 'inherit'], env: process.env, encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error('Fresh database backup failed. Reset will not run.');
  const line = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  try {
    const parsed = JSON.parse(line);
    if (!parsed.backupFile) throw new Error('No backup file was returned.');
    console.log('[production-reset] Fresh backup created:', parsed.backupFile);
  } catch (error) {
    throw new Error(`Backup verification failed: ${error.message || error}`);
  }
}

async function count(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

function quoteIdent(value) { return '"' + String(value).replaceAll('"', '""') + '"'; }

async function findProductReferences(client) {
  const { rows } = await client.query(`
    SELECT child.relname AS table_name, child_col.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND parent.relname = 'products'
      AND child.relnamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1
    ORDER BY child.relname, child_col.attname
  `);
  return rows;
}

async function countProductReferences(client, tableName, columnName) {
  const { rows } = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM ${quoteIdent(tableName)} child JOIN products p ON p.id = child.${quoteIdent(columnName)}
  `);
  return rows[0].count;
}

async function resetCatalogSafely(client) {
  const references = await findProductReferences(client);
  const blocking = [];
  for (const ref of references) {
    const refCount = await countProductReferences(client, ref.table_name, ref.column_name);
    if (refCount > 0 && !INVENTORY_CHILD_TABLES.has(ref.table_name)) blocking.push({ ...ref, count: refCount });
  }
  if (blocking.length) {
    throw new Error('Catalog reset aborted because products are referenced by transactional/history records: ' + JSON.stringify(blocking) + '. No data was deleted.');
  }
  for (const ref of references) {
    if (!INVENTORY_CHILD_TABLES.has(ref.table_name)) continue;
    await client.query(`DELETE FROM ${quoteIdent(ref.table_name)} child USING products p WHERE child.${quoteIdent(ref.column_name)} = p.id`);
  }
  const deleted = await client.query('DELETE FROM products');
  await client.query(`DO $$ BEGIN IF to_regclass('public.products_id_seq') IS NOT NULL THEN PERFORM setval('public.products_id_seq', 1, false); END IF; END $$;`);
  return deleted.rowCount;
}

async function run() {
  const scope = String(process.env.RESET_SCOPE || 'test').toLowerCase();
  assertSafeReset(scope);
  createFreshBackup();
  const { databaseUrl } = parseAndValidateDatabaseUrl('production-reset');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (scope === 'catalog') {
      const deletedProducts = await resetCatalogSafely(client);
      console.log('[production-reset] Catalog products removed', { deletedProducts });
    } else {
      const invoiceIds = (await client.query(`SELECT id FROM invoices WHERE lower(coalesce(invoice_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)' OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'`)).rows.map(r => r.id);
      const quotationIds = (await client.query(`SELECT id FROM quotations WHERE lower(coalesce(quotation_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)' OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'`)).rows.map(r => r.id);
      if (invoiceIds.length) await client.query('DELETE FROM invoices WHERE id = ANY($1::int[])', [invoiceIds]);
      if (quotationIds.length) await client.query('DELETE FROM quotations WHERE id = ANY($1::int[])', [quotationIds]);
      console.log('[production-reset] Test document IDs removed', { invoices: invoiceIds, quotations: quotationIds });
    }
    await client.query('COMMIT');
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
  console.error('[production-reset] If the operation failed after backup creation, restore that backup before retrying.');
  process.exit(1);
});
