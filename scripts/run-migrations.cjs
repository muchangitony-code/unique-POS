"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function resolveSsl(databaseUrl) {
  const isLocal = /localhost|127\.0\.0\.1|::1/.test(databaseUrl);
  return isLocal ? false : { rejectUnauthorized: false };
}

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

async function applyMigrations(options = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const migrationsDir = options.migrationsDir || path.resolve(process.cwd(), "migrations");
  const files = listMigrationFiles(migrationsDir);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: resolveSsl(databaseUrl)
  });

  const client = await pool.connect();
  const applied = [];

  try {
    await ensureMigrationsTable(client);

    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rows.length > 0) continue;

      const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sqlText);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      applied.push(file);
    }

    return { applied, migrationsDir, totalFiles: files.length };
  } finally {
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
