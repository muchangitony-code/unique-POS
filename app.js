// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

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
    if (!(key in process.env)) process.env[key] = val;
  }
}

// On-disk defaults (resolved next to this file).
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.SERVE_CLIENT_DIR = process.env.SERVE_CLIENT_DIR || path.join(__dirname, "public");
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");

const isLocalStartup = require.main === module;
const LOCAL_STARTUP_DATABASE_URL = "postgresql://localhost:5432/local-startup-placeholder";
if (isLocalStartup && !process.env.PORT) {
  process.env.PORT = "3000";
}

// Synchronous require — the bundled server is CommonJS and starts on import.
// Direct local runs should get far enough to use the app's normal startup flow,
// so seed a clearly fake but valid connection string instead of failing during
// bundled module initialization before the remaining environment checks run.
if (isLocalStartup && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = LOCAL_STARTUP_DATABASE_URL;
}

require("./index.cjs");
