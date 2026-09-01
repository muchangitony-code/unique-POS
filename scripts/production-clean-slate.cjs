'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

// This reset is intentionally destructive. It is keyed so that every running
// Railway service sharing the production database observes the same completed
// reset and cannot re-run it on subsequent restarts.
const RESET_KEY = '2026-09-01-full-pos-clean-slate-v1';
const PRESERVE = new Set([
  'schema_migrations',
  'users', 'user_roles', 'roles', 'permissions', 'role_permissions',
  'branches', 'branch_users',
  'company_settings', 'settings', 'system_settings',
  'production_clean_slate_markers'
]);

async function runProductionCleanSlate() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('production clean slate');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [2141383002]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.production_clean_slate_markers (
      reset_key TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const existing = await client.query('SELECT 1 FROM public.production_clean_slate_markers WHERE reset_key=$1', [RESET_KEY]);
    if (existing.rowCount) return { applied: false, reason: 'already-completed' };

    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r'
      ORDER BY c.relname
    `);
    const targets = rows.map((r) => r.relname).filter((name) => !PRESERVE.has(name));
    if (targets.length) {
      const identifiers = targets.map((name) => '"' + name.replace(/"/g, '""') + '"').join(', ');
      await client.query(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`);
    }
    await client.query('INSERT INTO public.production_clean_slate_markers (reset_key) VALUES ($1)', [RESET_KEY]);
    await client.query('COMMIT');
    return { applied: true, tables: targets };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [2141383002]); } catch {}
    client.release();
    await pool.end();
  }
}

module.exports = { runProductionCleanSlate };
