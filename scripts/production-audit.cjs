'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');
const { REQUIRED_TABLES } = require('./schema-config.cjs');

const PLACEHOLDER_PATTERNS = [
  'change-me', 'placeholder', 'example.com', 'uniquepos.com', '000000',
  'admin123', 'regression', 'test quotation', 'sample'
];

async function run() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('production-audit');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();
  const failures = [];
  const warnings = [];

  try {
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const existing = new Set(tables.rows.map(r => r.table_name));
    const missing = REQUIRED_TABLES.filter(t => !existing.has(t));
    if (missing.length) failures.push(`Missing required tables: ${missing.join(', ')}`);

    const settings = await client.query(`
      SELECT business_name, business_address, business_phone, business_email,
             currency, currency_symbol, vat_rate, timezone
      FROM business_settings ORDER BY id LIMIT 1
    `);
    if (!settings.rows.length) failures.push('Business settings row is missing.');
    else {
      const text = JSON.stringify(settings.rows[0]).toLowerCase();
      const found = PLACEHOLDER_PATTERNS.filter(p => text.includes(p));
      if (found.length) failures.push(`Business settings contain placeholder/test values: ${found.join(', ')}`);
    }

    const branches = await client.query(`
      SELECT id, name, code FROM branches WHERE is_active = TRUE ORDER BY id
    `);
    if (!branches.rows.length) failures.push('No active branch exists.');

    const counts = {};
    for (const table of ['quotations', 'quotation_items', 'invoices', 'invoice_items', 'invoice_payments', 'sales', 'sale_items']) {
      if (existing.has(table)) {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
        counts[table] = rows[0].count;
      }
    }

    const suspicious = await client.query(`
      SELECT 'invoice' AS type, invoice_number AS number, notes, created_at
      FROM invoices
      WHERE lower(coalesce(invoice_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
         OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
      UNION ALL
      SELECT 'quotation', quotation_number, notes, created_at
      FROM quotations
      WHERE lower(coalesce(quotation_number,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
         OR lower(coalesce(notes,'')) ~ '(test|testing|demo|sample|regression|dummy|placeholder)'
      ORDER BY created_at
    `);
    if (suspicious.rows.length) warnings.push(`Suspicious test/demo documents remain: ${suspicious.rows.length}`);

    const defaultAdmin = await client.query(`
      SELECT COUNT(*)::int AS count FROM users
      WHERE lower(email) = 'admin@uniquepos.com' OR lower(name) = 'admin'
    `);
    if (defaultAdmin.rows[0].count) warnings.push('Bootstrap admin identity is still present; verify its password was replaced with a unique production password.');

    const schemaMigrations = existing.has('schema_migrations')
      ? await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
      : { rows: [{ count: 0 }] };

    console.log(JSON.stringify({
      status: failures.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
      failures,
      warnings,
      activeBranches: branches.rows,
      documentCounts: counts,
      appliedMigrations: schemaMigrations.rows[0].count
    }, null, 2));

    if (failures.length) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(error => {
  console.error('[production-audit] FAILED:', error.message || error);
  process.exit(1);
});
