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
  const s = stripLeadingSqlComments(statement).trim().toUpperCase();
  return s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK";
}

function stripLeadingSqlComments(statement) {
  let text = statement.trimStart();

  for (;;) {
    if (text.startsWith("--")) {
      const newlineIndex = text.indexOf("\n");
      text = (newlineIndex === -1 ? "" : text.slice(newlineIndex + 1)).trimStart();
      continue;
    }

    if (text.startsWith("/*")) {
      const endCommentIndex = text.indexOf("*/");
      text = (endCommentIndex === -1 ? "" : text.slice(endCommentIndex + 2)).trimStart();
      continue;
    }

    break;
  }

  return text;
}

function normalizeStatementWhitespace(statement) {
  return stripLeadingSqlComments(statement).trim().replace(/\s+/g, " ");
}

function parseQualifiedName(name, defaultSchema = "public") {
  const cleaned = name.trim().replace(/;$/, "");
  const parts = cleaned.split(".").map((part) => part.trim().replace(/^"|"$/g, ""));
  if (parts.length === 1) {
    return { schema: defaultSchema, name: parts[0] };
  }
  return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
}

function getStatementTarget(statement) {
  const normalized = normalizeStatementWhitespace(statement);

  const createTypeMatch = normalized.match(/CREATE TYPE(?: IF NOT EXISTS)? ([^\s(]+) AS ENUM/i);
  if (createTypeMatch) {
    const identifier = parseQualifiedName(createTypeMatch[1]);
    return { kind: "enum", ...identifier };
  }

  const createTableMatch = normalized.match(/^CREATE TABLE(?: IF NOT EXISTS)? ([^\s(]+)/i);
  if (createTableMatch) {
    const identifier = parseQualifiedName(createTableMatch[1]);
    return { kind: "table", ...identifier };
  }

  const createIndexMatch = normalized.match(
    /^CREATE (?:UNIQUE )?INDEX(?: CONCURRENTLY)?(?: IF NOT EXISTS)? ([^\s]+) ON /i
  );
  if (createIndexMatch) {
    const identifier = parseQualifiedName(createIndexMatch[1]);
    return { kind: "index", ...identifier };
  }

  const createSequenceMatch = normalized.match(/^CREATE SEQUENCE(?: IF NOT EXISTS)? ([^\s;]+)/i);
  if (createSequenceMatch) {
    const identifier = parseQualifiedName(createSequenceMatch[1]);
    return { kind: "sequence", ...identifier };
  }

  const createViewMatch = normalized.match(
    /^CREATE(?: (OR REPLACE))? VIEW(?: IF NOT EXISTS)? ([^\s(]+)/i
  );
  if (createViewMatch) {
    const identifier = parseQualifiedName(createViewMatch[2]);
    const isReplace = Boolean(createViewMatch[1]);
    return { kind: "view", ...identifier, isReplace };
  }

  const createMaterializedViewMatch = normalized.match(
    /^CREATE MATERIALIZED VIEW(?: IF NOT EXISTS)? ([^\s(]+)/i
  );
  if (createMaterializedViewMatch) {
    const identifier = parseQualifiedName(createMaterializedViewMatch[1]);
    return { kind: "materialized_view", ...identifier };
  }

  const createTriggerMatch = normalized.match(
    /^CREATE(?: (OR REPLACE))? TRIGGER ([^\s]+) (?:BEFORE|AFTER|INSTEAD OF) .*? ON ([^\s(]+)/i
  );
  if (createTriggerMatch) {
    const tableIdentifier = parseQualifiedName(createTriggerMatch[3]);
    const triggerName = createTriggerMatch[2].replace(/^"|"$/g, "");
    const isReplace = Boolean(createTriggerMatch[1]);
    return { kind: "trigger", ...tableIdentifier, triggerName, isReplace };
  }

  const alterConstraintMatch = normalized.match(
    /^ALTER TABLE(?: ONLY)? ([^\s]+) ADD CONSTRAINT ([^\s]+)/i
  );
  if (alterConstraintMatch) {
    const tableIdentifier = parseQualifiedName(alterConstraintMatch[1]);
    const constraintName = alterConstraintMatch[2].replace(/^"|"$/g, "");
    return { kind: "constraint", ...tableIdentifier, constraintName };
  }

  const createExtensionMatch = normalized.match(/^CREATE EXTENSION(?: IF NOT EXISTS)? ([^\s;]+)/i);
  if (createExtensionMatch) {
    return { kind: "extension", name: createExtensionMatch[1].replace(/^"|"$/g, "") };
  }

  return null;
}

async function objectAlreadyExists(client, target) {
  if (!target) return false;

  if (target.kind === "enum") {
    const { rows } = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = $1 AND t.typname = $2 AND t.typtype = 'e'
        ) AS exists
      `,
      [target.schema, target.name]
    );
    return rows[0]?.exists === true;
  }

  if (
    target.kind === "table" ||
    target.kind === "index" ||
    target.kind === "sequence" ||
    target.kind === "view" ||
    target.kind === "materialized_view"
  ) {
    const { rows } = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS exists",
      [`${target.schema}.${target.name}`]
    );
    return rows[0]?.exists === true;
  }

  if (target.kind === "constraint") {
    const { rows } = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class tbl ON tbl.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = tbl.relnamespace
          WHERE n.nspname = $1
            AND tbl.relname = $2
            AND c.conname = $3
        ) AS exists
      `,
      [target.schema, target.name, target.constraintName]
    );
    return rows[0]?.exists === true;
  }

  if (target.kind === "extension") {
    const { rows } = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS exists",
      [target.name]
    );
    return rows[0]?.exists === true;
  }

  if (target.kind === "trigger") {
    const { rows } = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_trigger trg
          JOIN pg_class tbl ON tbl.oid = trg.tgrelid
          JOIN pg_namespace n ON n.oid = tbl.relnamespace
          WHERE n.nspname = $1
            AND tbl.relname = $2
            AND trg.tgname = $3
            AND trg.tgisinternal = FALSE
        ) AS exists
      `,
      [target.schema, target.name, target.triggerName]
    );
    return rows[0]?.exists === true;
  }

  return false;
}

function isIdempotentCreateOrAlterStatement(statement) {
  const s = stripLeadingSqlComments(statement).trim().toUpperCase();
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
  const duplicateCodes = new Set(["42710", "42P07", "42701", "42723", "42P06", "42P16"]);
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
      const target = getStatementTarget(statement);
      if (await objectAlreadyExists(client, target) && !target.isReplace) {
        const targetName = target.kind === "constraint" ? target.constraintName : target.name;
        console.log(`[migrations] Skipping existing ${target.kind} ${targetName} in ${fileName}`);
        continue;
      }

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
    } catch (err) {
      console.warn("[migrations] Failed to release advisory lock", err);
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
