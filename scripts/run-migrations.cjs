"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { parseAndValidateDatabaseUrl, railwaySsl } = require("./database-url.cjs");

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

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

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

    if (dollarTag) {
      current += ch;
      if (ch === "$") {
        const maybeTag = sqlText.slice(i - dollarTag.length + 1, i + 1);
        if (maybeTag === dollarTag) {
          dollarTag = null;
        }
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
      if (ch === "$") {
        const rest = sqlText.slice(i);
        const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          current += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
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
      try {
        await client.query(statement);
      } catch (err) {
        if (shouldIgnoreIdempotentError(err, statement)) {
          console.warn(`[migrations] Skipping existing object in ${fileName} (${err.code ?? "n/a"})`);
          continue;
        }
        throw err;
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

    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rows.length > 0) continue;

      await applyMigrationFile(client, path.join(migrationsDir, file), file);
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
