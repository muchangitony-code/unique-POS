'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { splitSqlStatements } = require('./sql-utils.cjs');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

const CONFIRMATION = 'APPLY_MIGRATIONS';
const DESTRUCTIVE_APPROVAL = 'APPROVE_DESTRUCTIVE_MIGRATION';
const DEFAULT_MAX_BACKUP_AGE_MS = 15 * 60 * 1000;

function listMigrationFiles(migrationsDir) {
  return fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--.*$/gm, ' ');
}

function classifyMigration(sqlText) {
  const statements = splitSqlStatements(sqlText);
  const findings = [];
  for (const statement of statements) {
    const normalized = stripComments(statement).replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const upper = normalized.toUpperCase();
    if (/\bTRUNCATE\s+(?:TABLE\s+)?/.test(upper)) findings.push('TRUNCATE');
    if (/\bDELETE\s+FROM\b/.test(upper)) findings.push('DELETE');
    if (/\bDROP\s+(?:TABLE|SCHEMA|DATABASE|TYPE|SEQUENCE|VIEW|MATERIALIZED\s+VIEW)\b/.test(upper)) findings.push('DROP');
    if (/\bALTER\s+TABLE\b/.test(upper) && /\bDROP\s+(?:COLUMN|CONSTRAINT)\b/.test(upper)) findings.push('ALTER TABLE DROP');
    if (/\bCASCADE\b/.test(upper) && (/\bTRUNCATE\b/.test(upper) || /\bDELETE\s+FROM\b/.test(upper) || /\bDROP\b/.test(upper))) findings.push('CASCADE');
  }
  return [...new Set(findings)];
}

function loadPolicy(policyPath) {
  if (!fs.existsSync(policyPath)) return {};
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function scanMigrations(migrationsDir, policyPath = path.resolve(process.cwd(), 'migration-safety.json')) {
  const policy = loadPolicy(policyPath);
  return listMigrationFiles(migrationsDir).map((name) => {
    const findings = classifyMigration(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
    const entry = policy[name] || {};
    return { name, destructive: findings.length > 0, findings, policy: entry.action || 'review' };
  });
}

async function readMigrationState(databaseUrl = null) {
  const connectionString = databaseUrl || parseAndValidateDatabaseUrl('migration-audit').databaseUrl;
  const pool = new Pool({ connectionString, ssl: railwaySsl(connectionString) });
  const client = await pool.connect();
  try {
    const table = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
    if (!table.rows[0]?.exists) return new Set();
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    return new Set(rows.map((row) => row.name));
  } finally {
    client.release();
    await pool.end();
  }
}

function requireDeploymentCredential() {
  const token = String(process.env.MIGRATION_DEPLOY_TOKEN || '');
  if (token.length < 32) throw new Error('Migration deployment blocked: MIGRATION_DEPLOY_TOKEN must be a distinct 32+ character deployment secret.');
  if (process.env.MIGRATION_CONFIRMATION !== CONFIRMATION) throw new Error(`Migration deployment blocked: set MIGRATION_CONFIRMATION=${CONFIRMATION}.`);
}

function requireBackupFile(filePath) {
  if (!filePath) throw new Error('Destructive migration blocked: MIGRATION_BACKUP_FILE is required and must point to a fresh pg_dump backup.');
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Destructive migration blocked: backup file does not exist: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size < 1024) throw new Error(`Destructive migration blocked: backup file is missing/too small: ${resolved}`);
  const maxAge = Number(process.env.MIGRATION_MAX_BACKUP_AGE_MS || DEFAULT_MAX_BACKUP_AGE_MS);
  if (Date.now() - stat.mtimeMs > maxAge) throw new Error(`Destructive migration blocked: backup is older than ${Math.round(maxAge / 60000)} minutes: ${resolved}`);
  return resolved;
}

function requireDestructiveApproval(names) {
  if (process.env.MIGRATION_ALLOW_DESTRUCTIVE !== 'YES') throw new Error(`Destructive migration blocked. Explicitly set MIGRATION_ALLOW_DESTRUCTIVE=YES after written approval for: ${names.join(', ')}`);
  if (process.env.MIGRATION_DESTRUCTIVE_APPROVAL !== DESTRUCTIVE_APPROVAL) throw new Error(`Destructive migration blocked: set MIGRATION_DESTRUCTIVE_APPROVAL=${DESTRUCTIVE_APPROVAL} only for the specifically approved migration set.`);
  const approved = new Set(String(process.env.MIGRATION_APPROVED_FILES || '').split(',').map((v) => v.trim()).filter(Boolean));
  const missing = names.filter((name) => !approved.has(name));
  if (missing.length) throw new Error(`Destructive migration blocked: explicit approval is missing for ${missing.join(', ')}.`);
}

async function assertMigrationDeploymentSafe(options = {}) {
  requireDeploymentCredential();
  const migrationsDir = options.migrationsDir || path.resolve(process.cwd(), 'migrations');
  const policyPath = options.policyPath || path.resolve(process.cwd(), 'migration-safety.json');
  const scanned = scanMigrations(migrationsDir, policyPath);
  const applied = await readMigrationState(options.databaseUrl);
  const pending = scanned.filter((item) => !applied.has(item.name));
  const retiredPending = pending.filter((item) => item.policy === 'retired');
  if (retiredPending.length) throw new Error(`Migration deployment blocked: retired migration(s) are still pending: ${retiredPending.map((item) => item.name).join(', ')}.`);

  const freshStartPending = pending.filter((item) => item.policy === 'fresh_start');
  const normalPending = pending.filter((item) => item.policy !== 'fresh_start');
  const destructivePending = normalPending.filter((item) => item.destructive);
  if (destructivePending.length) {
    const names = destructivePending.map((item) => item.name);
    requireDestructiveApproval(names);
    const backupFile = requireBackupFile(process.env.MIGRATION_BACKUP_FILE);
    return { pending, freshStartPending, destructivePending, backupFile };
  }

  if (freshStartPending.length) {
    console.warn(`[migration-deploy] Explicit fresh-start migration approved: ${freshStartPending.map((item) => item.name).join(', ')}. No backup/archive will be created.`);
  }
  return { pending, freshStartPending, destructivePending: [], backupFile: null };
}

async function auditMigrationState(options = {}) {
  const migrationsDir = options.migrationsDir || path.resolve(process.cwd(), 'migrations');
  const policyPath = options.policyPath || path.resolve(process.cwd(), 'migration-safety.json');
  const scanned = scanMigrations(migrationsDir, policyPath);
  const applied = await readMigrationState(options.databaseUrl);
  return scanned.map((item) => ({ ...item, status: applied.has(item.name) ? 'applied' : 'pending' }));
}

module.exports = { CONFIRMATION, DESTRUCTIVE_APPROVAL, scanMigrations, auditMigrationState, assertMigrationDeploymentSafe, requireBackupFile };

if (require.main === module) {
  auditMigrationState().then((rows) => {
    console.table(rows.map(({ name, destructive, findings, policy, status }) => ({ name, status, destructive, findings: findings.join(','), policy })));
    if (rows.some((row) => row.status === 'pending' && row.destructive && row.policy !== 'fresh_start')) process.exitCode = 2;
  }).catch((error) => {
    console.error('[migration-safety] Failed:', error.message || error);
    process.exitCode = 1;
  });
}
