'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');
const { REQUIRED_TABLES } = require('./schema-config.cjs');

const DEFAULT_ADMIN_PASSWORD = 'admin123';
const BRANCH_BACKFILL_STATEMENTS = Object.freeze({
  users: 'UPDATE users SET branch_id = $1 WHERE branch_id IS NULL',
  customers: 'UPDATE customers SET branch_id = $1 WHERE branch_id IS NULL',
  suppliers: 'UPDATE suppliers SET branch_id = $1 WHERE branch_id IS NULL',
  quotations: 'UPDATE quotations SET branch_id = $1 WHERE branch_id IS NULL',
  invoices: 'UPDATE invoices SET branch_id = $1 WHERE branch_id IS NULL',
  purchases: 'UPDATE purchases SET branch_id = $1 WHERE branch_id IS NULL',
  expenses: 'UPDATE expenses SET branch_id = $1 WHERE branch_id IS NULL',
  sales: 'UPDATE sales SET branch_id = $1 WHERE branch_id IS NULL',
  stock_movements: 'UPDATE stock_movements SET branch_id = $1 WHERE branch_id IS NULL',
  audit_log: 'UPDATE audit_log SET branch_id = $1 WHERE branch_id IS NULL'
});

function isEnabled(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

async function fetchMissingTables(client, tableNames) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existing = new Set(rows.map((r) => r.table_name));
  return tableNames.filter((name) => !existing.has(name));
}

async function ensureAdminAccount(client, options) {
  const { adminEmail, adminUsername, adminPassword, rotateExistingPassword } = options;
  if (!adminPassword || adminPassword.length < 6) throw new Error('Admin bootstrap password must be at least 6 characters.');

  const { rows: branchRows } = await client.query("SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id LIMIT 1");
  const branchId = branchRows[0]?.id ?? null;
  const { rows: existingRows } = await client.query(`
    SELECT id FROM users
    WHERE lower(email) = lower($1) OR lower(name) = lower($2)
    ORDER BY id ASC LIMIT 1
  `, [adminEmail, adminUsername]);

  if (existingRows.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await client.query(`
      INSERT INTO users
        (name, email, password_hash, role, branch, branch_id, phone, is_active, failed_login_attempts, locked_until, password_changed_at)
      VALUES ($1, $2, $3, 'super_admin', NULL, $4, NULL, TRUE, 0, NULL, NULL)
    `, [adminUsername, adminEmail, passwordHash, branchId]);
    return;
  }

  const updates = [
    'name = $2', 'email = $3', "role = 'super_admin'", 'is_active = TRUE',
    'branch_id = COALESCE(branch_id, $4)', 'failed_login_attempts = 0', 'locked_until = NULL'
  ];
  const params = [existingRows[0].id, adminUsername, adminEmail, branchId];
  if (rotateExistingPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    updates.push('password_hash = $5', 'password_changed_at = NULL');
    params.push(passwordHash);
  }

  await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);
}

async function ensureBusinessSettings(client) {
  const { rows } = await client.query('SELECT id FROM business_settings ORDER BY id ASC LIMIT 1');
  if (rows.length === 0) {
    await client.query('INSERT INTO business_settings DEFAULT VALUES');
    return true;
  }
  return false;
}

async function ensureMainBranch(client) {
  await client.query(`
    INSERT INTO branches (name, code, is_active)
    VALUES ('Main Branch', 'MAIN', TRUE)
    ON CONFLICT (code) DO NOTHING
  `);
  const { rows } = await client.query("SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id ASC LIMIT 1");
  const branchId = rows[0]?.id;
  if (!branchId) throw new Error('Failed to resolve MAIN branch.');

  for (const statement of Object.values(BRANCH_BACKFILL_STATEMENTS)) {
    await client.query(statement, [branchId]);
  }

  await client.query(`
    INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock)
    SELECT $1, id, current_stock, min_stock
    FROM products
    ON CONFLICT (branch_id, product_id) DO NOTHING
  `, [branchId]);
  return branchId;
}

async function bootstrapDatabaseIfNeeded(options = {}) {
  const { databaseUrl } = parseAndValidateDatabaseUrl('bootstrap-db');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();

  try {
    const missing = await fetchMissingTables(client, REQUIRED_TABLES);
    if (missing.length > 0) {
      throw new Error(`Database schema is incomplete. Run the explicit migration deployment step first: npm run db:migrate. Missing tables: ${missing.join(', ')}`);
    }

    if (!options.seed) {
      return {
        migrationsApplied: [],
        adminBootstrapped: false,
        branchEnsured: false,
        settingsEnsured: false,
        skipped: true
      };
    }

    const bootstrapAdminEnabled = isEnabled(process.env.UNIQUEPOS_BOOTSTRAP_ADMIN, true);
    const rotateExistingAdminPassword = isEnabled(process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_ROTATE_PASSWORD, false);
    const nodeEnv = process.env.NODE_ENV || 'production';
    const adminPassword = process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    if (bootstrapAdminEnabled && adminPassword === DEFAULT_ADMIN_PASSWORD && nodeEnv === 'production') {
      throw new Error('UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD must be set in production.');
    }

    await client.query('BEGIN');
    const settingsEnsured = await ensureBusinessSettings(client);
    await ensureMainBranch(client);

    let adminBootstrapped = false;
    if (bootstrapAdminEnabled) {
      await ensureAdminAccount(client, {
        adminUsername: process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_USERNAME || 'admin',
        adminEmail: process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL || 'admin@uniquepos.com',
        adminPassword,
        rotateExistingPassword: rotateExistingAdminPassword
      });
      adminBootstrapped = true;
    }
    await client.query('COMMIT');

    return {
      migrationsApplied: [],
      adminBootstrapped,
      branchEnsured: true,
      settingsEnsured,
      skipped: false
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  bootstrapDatabaseIfNeeded({ seed: true }).then((result) => {
    console.log('[bootstrap-db] Completed', result);
  }).catch((err) => {
    console.error('[bootstrap-db] Failed', err);
    process.exit(1);
  });
}

module.exports = { bootstrapDatabaseIfNeeded };
