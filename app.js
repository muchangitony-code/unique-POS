// UniquePOS standalone entrypoint.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.SERVE_CLIENT_DIR = process.env.SERVE_CLIENT_DIR || path.join(__dirname, "public");
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");

// Bootstrap the standalone database before accepting requests. This is required
// for admin creation and password rotation to honor Railway environment values.
const { bootstrapDatabaseIfNeeded } = require("./scripts/bootstrap-db.cjs");

(async () => {
  await bootstrapDatabaseIfNeeded({ seed: true });
  require("./server/index.cjs");
})().catch((err) => {
  console.error("[startup] Database bootstrap failed", err);
  process.exit(1);
});
