'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

const CONFIRM_TEST = 'DELETE_TEST_DOCUMENTS';
const CONFIRM_ALL = 'DELETE_ALL_DOCUMENTS';

function assertSafeReset(scope) {
  const nodeEnv = String(process.env.NODE_ENV || 'production').toLowerCase();
  const confirm = process.env.RESET_CONFIRM || '';
  if (!['test', 'all'].includes(scope)) throw new Error('RESET_SCOPE must be test or all.');
  if (scope === 'all' && nodeEnv === 'production' && process.env.ALLOW_PRODUCTION_RESET !== 'YES') {
    throw new Error('Production reset is blocked. Set ALLOW_PRODUCTION_RESET=YES explicitly.');
  }
  const expected = scope === 'all' ? CONFIRM_ALL : CONFIRM_TEST;
  if (confirm !== expected) throw new Error(`Destructive reset blocked. Set RESET_CONFIRM=${expected}.`);
}

async function count(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return rows[0].count;
}

async function run() {
  const scope = String(process.env.RESET_SCOPE || 'test').toLowerCase();
  assertSafeReset(scope);
  const { databaseUrl } = parseAndValidateDatabaseUrl('production-reset');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();

  try {
    const before = {
      quotations: await count(client, 'quotations'),
      invoices: await count(client, 'invoices'),
      quotation_items: await count(client, 'quotation_items'),
      invoice_items: await count(client, 'invoice_items'),
      invoice_payments: await count(client, 'invoice_payments')
    };
    console.log('[production-reset] Before', before);

    await client.query('BEGIN');

    if (scope === 'all') {
      // CASCADE removes only rows belonging to these document trees; master data
      // such as products, customers, branches and users is not truncated.
      await client.query('TRUNCATE TABLE invoices, quotations RESTART IDENTITY CASCADE');
      await client.query("DELETE FROM document_sequences WHERE lower(doc_type) IN ('invoice', 'quotation', 'quote')");
    } else {
      // Remove clearly identifiable development/test documents without touching
      // legitimate customer records that happen to contain similar words.
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
      quotations: await count(client, 'quotations'),
      invoices: await count(client, 'invoices'),
      quotation_items: await count(client, 'quotation_items'),
      invoice_items: await count(client, 'invoice_items'),
      invoice_payments: await count(client, 'invoice_payments')
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
