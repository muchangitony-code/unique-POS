'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');
const { applyMigrations } = require('./run-migrations.cjs');
const { bootstrapDatabaseIfNeeded } = require('./bootstrap-db.cjs');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');
const { auditMigrationState, assertMigrationDeploymentSafe, DESTRUCTIVE_APPROVAL } = require('./migration-safety.cjs');

function requireDeploymentCredential() {
  const token = String(process.env.MIGRATION_DEPLOY_TOKEN || '');
  if (token.length < 32) throw new Error('Migration deployment blocked: MIGRATION_DEPLOY_TOKEN must be a distinct 32+ character secret.');
  if (process.env.MIGRATION_CONFIRMATION !== 'APPLY_MIGRATIONS') throw new Error('Migration deployment blocked: MIGRATION_CONFIRMATION=APPLY_MIGRATIONS is required.');
}

function requireDestructiveApproval(names) {
  if (process.env.MIGRATION_ALLOW_DESTRUCTIVE !== 'YES') throw new Error(`Destructive migration blocked. Written approval is required before setting MIGRATION_ALLOW_DESTRUCTIVE=YES for: ${names.join(', ')}`);
  if (process.env.MIGRATION_DESTRUCTIVE_APPROVAL !== DESTRUCTIVE_APPROVAL) throw new Error(`Destructive migration blocked: MIGRATION_DESTRUCTIVE_APPROVAL=${DESTRUCTIVE_APPROVAL} is required.`);
  const approved = new Set(String(process.env.MIGRATION_APPROVED_FILES || '').split(',').map((v) => v.trim()).filter(Boolean));
  const missing = names.filter((name) => !approved.has(name));
  if (missing.length) throw new Error(`Destructive migration blocked: approval missing for ${missing.join(', ')}`);
}

async function markRetiredAsAppliedInNonProduction(names) {
  const nodeEnv = String(process.env.NODE_ENV || 'production').toLowerCase();
  if (nodeEnv === 'production') throw new Error(`Retired historical migrations are pending in production: ${names.join(', ')}. Audit and reconcile them before deployment.`);
  const { databaseUrl } = parseAndValidateDatabaseUrl('migration-baseline');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const name of names) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`[migration-deploy] Non-production baseline recorded retired migration history without executing destructive SQL: ${names.join(', ')}`);
}

function createFreshBackup() {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, 'backup-before-migration.cjs')], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Fresh database backup failed. No migration was run.');
  const line = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  let parsed;
  try { parsed = JSON.parse(line); } catch { throw new Error('Backup command did not return a valid backup manifest. No migration was run.'); }
  if (!parsed.backupFile) throw new Error('Backup command did not return a backup file. No migration was run.');
  process.env.MIGRATION_BACKUP_FILE = parsed.backupFile;
  return parsed.backupFile;
}

async function main() {
  requireDeploymentCredential();
  let rows = await auditMigrationState();
  const retiredPending = rows.filter((row) => row.status === 'pending' && row.policy === 'retired').map((row) => row.name);
  if (retiredPending.length) {
    await markRetiredAsAppliedInNonProduction(retiredPending);
    rows = await auditMigrationState();
  }

  const destructivePending = rows.filter((row) => row.status === 'pending' && row.destructive).map((row) => row.name);
  if (destructivePending.length) {
    requireDestructiveApproval(destructivePending);
    console.log(`[migration-deploy] Fresh backup required for destructive migration(s): ${destructivePending.join(', ')}`);
    const backupFile = createFreshBackup();
    console.log(`[migration-deploy] Backup ready: ${backupFile}`);
  }

  await assertMigrationDeploymentSafe();
  const result = await applyMigrations();
  console.log('[migration-deploy] Migrations applied:', result.applied);
  const bootstrap = await bootstrapDatabaseIfNeeded({ seed: true });
  console.log('[migration-deploy] Bootstrap completed:', bootstrap);
}

main().catch((error) => {
  console.error('[migration-deploy] FAILED:', error.message || error);
  console.error('[migration-deploy] If a migration failed after a backup was created, restore the reported pre-migration dump before retrying.');
  process.exit(1);
});
