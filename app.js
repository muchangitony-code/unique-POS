// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseAndValidateDatabaseUrl } = require("./scripts/database-url.cjs");

// Load .env (simple KEY=VALUE parser; no external dependency).
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === "DATABASE_URL") continue;
    if (!(key in process.env)) process.env[key] = val;
  }
}

// On-disk defaults (resolved next to this file).
process.env.NODE_ENV = process.env.NODE_ENV || "production";
const _defaultClientDir = path.join(__dirname, "public");
if (!process.env.SERVE_CLIENT_DIR) {
  // Only set SERVE_CLIENT_DIR when the public/ folder actually exists so the
  // server starts cleanly as an API-only deployment when the built frontend
  // has not been committed to the repository.
  if (fs.existsSync(_defaultClientDir)) {
    process.env.SERVE_CLIENT_DIR = _defaultClientDir;
  }
}
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");

if (!process.env.PORT) {
  process.env.PORT = "8080";
}

// DATABASE_URL must come from the deployment environment.
parseAndValidateDatabaseUrl("startup");

// index.cjs checks SESSION_SECRET at module load time. Supply a placeholder so
// the process starts (and passes the health check) even when the secret is not
// yet configured (e.g. Railway PR-preview environments). JWT operations will
// fail at runtime until a real secret is provided, which is the correct
// behaviour — the app should not be usable without a proper SESSION_SECRET.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "unconfigured-placeholder-change-me";
}

async function start() {
  try {
    const { bootstrapDatabaseIfNeeded } = require("./scripts/bootstrap-db.cjs");
    const result = await bootstrapDatabaseIfNeeded();
    if (result.initializedFromSql) {
      console.log("[bootstrap-db] Database initialized from database.sql");
    }
    if (result.adminBootstrapped) {
      console.log("[bootstrap-db] Admin account ensured");
    }
    require("./index.cjs");
  } catch (err) {
    console.error("[startup] Database bootstrap failed", err);
    process.exit(1);
  }
}

start();
