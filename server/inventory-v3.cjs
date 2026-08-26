'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');
const { createBulkImportV2Router } = require('./bulk-import-v2-router.cjs');

let pool;
function db() {
  if (!pool) {
    const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-v3');
    pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 10 });
  }
  return pool;
}
function text(v) { return String(v ?? '').trim(); }
function number(v, label, allowNegative = false) {
  const n = Number(v);
  if (!Number.isFinite(n) || (!allowNegative && n < 0)) throw new Error(`Invalid ${label}`);
  return n;
}

async function withTransaction(work) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function productPayload(b) {
  return [
    text(b.sku), text(b.barcode) || null, text(b.name), text(b.category) || null,
    text(b.brand) || null, text(b.unit) || 'pcs', number(b.costPrice ?? 0, 'cost price'),
    number(b.sellingPrice ?? 0, 'selling price'), number(b.vatRate ?? 0, 'VAT rate'),
    number(b.reorderLevel ?? 0, 'reorder level'), text(b.supplier) || null,
    text(b.description) || null
  ];
}

async function syncImportJob(client, jobId, requestedBranchId) {
  const jobResult = await client.query(
    'SELECT id, status, total_rows, valid_rows, invalid_rows, COALESCE(summary, \'{}\'::jsonb) AS summary FROM product_import_jobs WHERE id=$1 FOR UPDATE',
    [jobId]
  );
  if (!jobResult.rowCount) throw new Error('Import job not found.');
  const job = jobResult.rows[0];
  if (job.status !== 'completed') throw new Error(`Import job is ${job.status}; only completed imports can be synced.`);
  if (job.summary && job.summary.live_inventory_synced === true) return { jobId, alreadySynced: true, created: 0, updated: 0, syncedRows: Number(job.valid_rows || 0), stockRows: Number(job.valid_rows || 0), branchId: null };
  const rowsResult = await client.query(`SELECT row_number, normalized_data, validation_errors FROM product_import_rows WHERE job_id=$1 AND status <> 'skipped' ORDER BY row_number`, [jobId]);
  const rows = rowsResult.rows;
  const invalid = rows.filter(row => Array.isArray(row.validation_errors) && row.validation_errors.length > 0);
  if (invalid.length) throw new Error(`Import job contains ${invalid.length} invalid row(s); correct the file and import again.`);
