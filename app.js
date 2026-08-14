// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { validateStartupEnv } = require("./scripts/validate-startup-env.cjs");

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
const _configuredClientDir = process.env.SERVE_CLIENT_DIR ? path.resolve(process.env.SERVE_CLIENT_DIR) : "";
const _configuredClientIndex = _configuredClientDir ? path.join(_configuredClientDir, "index.html") : "";
const _defaultClientIndex = path.join(_defaultClientDir, "index.html");
if (_configuredClientDir && !fs.existsSync(_configuredClientIndex)) {
  // Fall back to the bundled frontend when SERVE_CLIENT_DIR points to a stale
  // or missing directory (for example after deployment environment drift).
  if (fs.existsSync(_defaultClientIndex)) {
    process.env.SERVE_CLIENT_DIR = _defaultClientDir;
    console.warn(`[startup] SERVE_CLIENT_DIR "${_configuredClientDir}" missing index.html; falling back to "${_defaultClientDir}".`);
  } else {
    delete process.env.SERVE_CLIENT_DIR;
    console.warn(`[startup] SERVE_CLIENT_DIR "${_configuredClientDir}" missing index.html and no bundled frontend found; starting API-only.`);
  }
} else if (!_configuredClientDir) {
  // Only set SERVE_CLIENT_DIR when the bundled frontend entry file exists so
  // the server starts cleanly as an API-only deployment when frontend assets
  // have not been committed to the repository.
  if (fs.existsSync(_defaultClientIndex)) {
    process.env.SERVE_CLIENT_DIR = _defaultClientDir;
  }
}
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");

if (!process.env.PORT) {
  process.env.PORT = "8080";
}

async function start() {
  try {
    validateStartupEnv();
    const { bootstrapDatabaseIfNeeded } = require("./scripts/bootstrap-db.cjs");
    const result = await bootstrapDatabaseIfNeeded();
    process.env.UNIQUEPOS_DISABLE_INTERNAL_STARTUP_MIGRATIONS = "1";
    console.log("[startup] Database bootstrap complete", result);
    if (result.adminBootstrapped) {
      console.log("[bootstrap-db] Admin account ensured");
    }
    // Load the targeted PDFKit table-cursor fix before the bundled API renderer.
    // It affects only the A4 item-table drawing sequence.
    require("./scripts/pdfkit-a4-table-runtime-fix.cjs");
    require("./index.cjs");
  } catch (err) {
    console.error("[startup] Startup failed", err);
    process.exit(1);
  }
}

start();
