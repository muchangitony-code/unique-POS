"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { applyMigrations } = require("./run-migrations.cjs");

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const REQUIRED_TABLES = [
  "users",
  "products",
  "customers",
  "suppliers",
  "sales",
  "quotations",
  "invoices",
  "purchases",
  "product_stock",
  "expenses",
  "business_settings",
  "branches",
  "login_history",
  "audit_log",
  "data_migrations"
];

function isEnabled(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function resolveSsl(databaseUrl) {
  const isLocal = /localhost|127\.0\.0\.1|::1/.test(databaseUrl);
  return isLocal ? false : { rejectUnauthorized: false };
}

function stripPsqlMetaAndCopy(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const out = [];
  let skippingCopy = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skippingCopy) {
      if (trimmed === "\\.") {
        skippingCopy = false;
      }
      continue;
    }

    if (/^COPY\s+.+\s+FROM\s+stdin;$/i.test(trimmed)) {
      skippingCopy = true;
      continue;
    }

    if (trimmed.startsWith("\\")) {
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "-" && next === "-") {
        current += ch + next;
        i += 1;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        current += ch + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDouble) {
      const escaped = sqlText[i - 1] === "\\";
      if (!escaped) inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      const escaped = sqlText[i - 1] === "\\";
      if (!escaped) inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === ";" && !inSingle && !inDouble) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function fetchMissingTables(client, tableNames) {
  const { rows } = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `
  );

  const existing = new Set(rows.map((r) => r.table_name));
  return tableNames.filter((name) => !existing.has(name));
}

async function ensureRolesAndPermissionsTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (role_id, permission_id)
    )
  `);

  await client.query(`
    INSERT INTO roles (name, description) VALUES
      ('super_admin', 'Full system access'),
      ('business_owner', 'Owner-level access'),
      ('branch_manager', 'Branch management access'),
      ('cashier', 'POS checkout access')
    ON CONFLICT (name) DO NOTHING
  `);
}

async function ensureAdminAccount(client, options) {
  const adminEmail = options.adminEmail;
  const adminUsername = options.adminUsername;
  const adminPassword = options.adminPassword;

  if (!adminPassword || adminPassword.length < 6) {
    throw new Error("Admin bootstrap password must be at least 6 characters.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const { rows: branchRows } = await client.query(
    "SELECT id FROM branches WHERE code = 'MAIN' ORDER BY id LIMIT 1"
  );
  const branchId = branchRows[0]?.id ?? null;

  const { rows: existingRows } = await client.query(
    `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1) OR lower(name) = lower($2)
      ORDER BY id ASC
      LIMIT 1
    `,
    [adminEmail, adminUsername]
  );

  if (existingRows.length === 0) {
    await client.query(
      `
        INSERT INTO users
          (name, email, password_hash, role, branch, branch_id, phone, is_active, failed_login_attempts, locked_until, password_changed_at)
        VALUES
          ($1, $2, $3, 'super_admin', NULL, $4, NULL, TRUE, 0, NULL, NULL)
      `,
      [adminUsername, adminEmail, passwordHash, branchId]
    );
    return;
  }

  await client.query(
    `
      UPDATE users
      SET
        name = $2,
        email = $3,
        password_hash = $4,
        role = 'super_admin',
        is_active = TRUE,
        branch_id = COALESCE(branch_id, $5),
        failed_login_attempts = 0,
        locked_until = NULL,
        password_changed_at = NULL
      WHERE id = $1
    `,
    [existingRows[0].id, adminUsername, adminEmail, passwordHash, branchId]
  );
}

async function bootstrapDatabaseIfNeeded(options = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for bootstrap.");
  }

  const autoInitEnabled = isEnabled(process.env.UNIQUEPOS_AUTO_DB_INIT, true);
  const bootstrapAdminEnabled = isEnabled(process.env.UNIQUEPOS_BOOTSTRAP_ADMIN, true);
  if (!autoInitEnabled && !bootstrapAdminEnabled) {
    return { initializedFromSql: false, adminBootstrapped: false, skipped: true };
  }

  const sqlFile = path.resolve(options.sqlFilePath || path.join(__dirname, "..", "database.sql"));
  const pool = new Pool({ connectionString: databaseUrl, ssl: resolveSsl(databaseUrl) });
  const client = await pool.connect();

  try {
    let initializedFromSql = false;

    const missingBefore = await fetchMissingTables(client, REQUIRED_TABLES);
    if (autoInitEnabled && missingBefore.length > 0) {
      if (!fs.existsSync(sqlFile)) {
        throw new Error(`Missing database bootstrap SQL file: ${sqlFile}`);
      }

      const rawSql = fs.readFileSync(sqlFile, "utf8");
      const sanitizedSql = stripPsqlMetaAndCopy(rawSql);
      const statements = splitSqlStatements(sanitizedSql);

      await client.query("BEGIN");
      for (const statement of statements) {
        await client.query(statement);
      }
      await client.query("COMMIT");
      await client.query("SET search_path TO public");
      initializedFromSql = true;
    }

    const missingAfter = await fetchMissingTables(client, REQUIRED_TABLES);
    if (missingAfter.length > 0) {
      throw new Error(`Database schema is incomplete. Missing tables: ${missingAfter.join(", ")}`);
    }

    await ensureRolesAndPermissionsTables(client);
    await applyMigrations({ migrationsDir: path.resolve(__dirname, "..", "migrations") });

    let adminBootstrapped = false;
    if (bootstrapAdminEnabled) {
      await ensureAdminAccount(client, {
        adminUsername: process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_USERNAME || "admin",
        adminEmail: process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL || "admin@uniquepos.com",
        adminPassword: process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD || "admin123"
      });
      adminBootstrapped = true;
    }

    return {
      initializedFromSql,
      adminBootstrapped,
      skipped: false
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_rollbackErr) {
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  bootstrapDatabaseIfNeeded().then((result) => {
    console.log("[bootstrap-db] Completed", result);
  }).catch((err) => {
    console.error("[bootstrap-db] Failed", err);
    process.exit(1);
  });
}

module.exports = {
  bootstrapDatabaseIfNeeded
};
