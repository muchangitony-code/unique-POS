"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { stripPsqlMetaAndCopy } = require("./sql-utils.cjs");

function filterMigrationStatements(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const kept = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    if (!trimmed) {
      kept.push(line);
      continue;
    }

    if (upper.startsWith("DROP ")) continue;
    if (upper.startsWith("ALTER TABLE") && upper.includes(" DROP ")) continue;
    if (upper.startsWith("ALTER SEQUENCE") && upper.includes(" OWNED BY ")) continue;
    if (upper.startsWith("ALTER TABLE ONLY") && upper.includes(" ALTER COLUMN ") && upper.includes(" SET DEFAULT ")) continue;
    if (upper.startsWith("SELECT PG_CATALOG.SETVAL(")) continue;
    if (upper.startsWith("SET ")) continue;
    if (upper.startsWith("SELECT PG_CATALOG.SET_CONFIG(")) continue;
    if (upper.startsWith("BEGIN")) continue;
    if (upper.startsWith("COMMIT")) continue;
    if (upper.startsWith("--")) {
      kept.push(line);
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const inputPath = path.join(repoRoot, "database.sql");
  const outputPath = path.join(repoRoot, "migrations", "0001_initial_schema.sql");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input schema: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const sanitized = stripPsqlMetaAndCopy(raw);
  const filtered = filterMigrationStatements(sanitized);

  const header = [
    "-- Generated from database.sql",
    "-- Source of truth for initial schema provisioning",
    "BEGIN;",
    filtered,
    "COMMIT;",
    ""
  ].join("\n");

  fs.writeFileSync(outputPath, header, "utf8");
  console.log(`[generate-initial-migration] Wrote ${outputPath}`);
}

if (require.main === module) {
  main();
}
