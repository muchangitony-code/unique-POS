"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { parseAndValidateDatabaseUrl, railwaySsl } = require("./database-url.cjs");
const { splitSqlStatements } = require("./sql-utils.cjs");

const MIGRATION_LOCK_ID = 2141383001;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function listMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function isTransactionControlStatement(statement) {
  const s = statement.trim().toUpperCase();
  return s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK";
}

function isIdempotentCreateOrAlterStatement(statement) {
  const s = statement.trim().toUpperCase();
  if (
    s.startsWith("CREATE TYPE") ||
    s.startsWith("CREATE TABLE") ||
    s.startsWith("CREATE INDEX") ||
    s.startsWith("CREATE UNIQUE INDEX") ||
    s.startsWith("CREATE SEQUENCE") ||
    s.startsWith("CREATE TRIGGER") ||
    s.startsWith("CREATE FUNCTION") ||
    s.startsWith("CREATE VIEW") ||
    s.startsWith("CREATE MATERIALIZED VIEW") ||
    s.startsWith("CREATE EXTENSION")
  ) {
    return true;
  }

  return s.startsWith("ALTER TABLE") && (s.includes(" ADD CONSTRAINT") || s.includes(" ADD COLUMN"));
}

function shouldIgnoreIdempotentError(err, statement) {
  const duplicateCodes = new Set(["42710", "42P07", "42701", "42723", "42P06"]);
  if (!isIdempotentCreateOrAlterStatement(statement)) return false;
  if (duplicateCodes.has(err?.code)) return true;
  return /already exists/i.test(err?.message || "");
}

async function applyMigrationFile(client, filePath, fileName) {
  const sqlText = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sqlText).filter((s) => !isTransactionControlStatement(s));

  await client.query("BEGIN");
  try {
    for (const statement of statements) {
      if (isIdempotentCreateOrAlterStatement(statement)) {
        // Use a savepoint so a duplicate-object error does not abort the
        // surrounding transaction (PostgreSQL aborts the whole transaction on
        // any unhandled error, making subsequent queries fail too).
        await client.query("SAVEPOINT uniquepos_stmt");
        try {
          await client.query(statement);
          await client.query("RELEASE SAVEPOINT uniquepos_stmt");
        } catch (err) {
          await client.query("ROLLBACK TO SAVEPOINT uniquepos_stmt");
          await client.query("RELEASE SAVEPOINT uniquepos_stmt");
          if (shouldIgnoreIdempotentError(err, statement)) {
            console.warn(`[migrations] Skipping existing object in ${fileName} (${err.code ?? "n/a"})`);
            continue;
          }
          throw err;
        }
      } else {
        await client.query(statement);
      }
    }

    await client.query(
      "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [fileName]
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw err;
  }
}

async function applyMigrations(options = {}) {
  const { databaseUrl } = parseAndValidateDatabaseUrl("migrations");

  const migrationsDir = options.migrationsDir || path.resolve(process.cwd(), "migrations");
  const files = listMigrationFiles(migrationsDir);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: railwaySsl()
  });

  const client = await pool.connect();
  const applied = [];

  try {
    await ensureMigrationsTable(client);
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rows.length > 0) continue;

      await applyMigrationFile(client, path.join(migrationsDir, file), file);
      applied.push(file);
    }

    return { applied, migrationsDir, totalFiles: files.length };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } catch {
    }
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  applyMigrations().then((result) => {
    console.log("[migrations] Completed", result);
  }).catch((err) => {
    console.error("[migrations] Failed", err);
    process.exit(1);
  });
}

module.exports = { applyMigrations };
