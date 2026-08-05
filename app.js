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
if (isLocalStartup && !process.env.PORT) {
  process.env.PORT = "3000";
}

// Direct local runs without a configured database should still start the app
// shell instead of failing during bundled bootstrap or startup migrations.
if (isLocalStartup && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/local-startup-placeholder";
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit;
  let skipNextExit = false;

  process.stderr.write = (chunk, encoding, callback) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (text.includes("Startup migrations failed — aborting")) {
      skipNextExit = true;
      console.warn(
        "Skipping startup database connection for local run because DATABASE_URL is not configured."
      );
      if (typeof callback === "function") callback();
      return true;
    }
    return originalStderrWrite(chunk, encoding, callback);
  };

  process.exit = (code) => {
    if (code && code !== 0 && skipNextExit) {
      skipNextExit = false;
      return;
    }
    return originalExit.call(process, code);
  };
}

require("./index.cjs");
