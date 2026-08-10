// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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

const isLocalStartup = require.main === module;
if (isLocalStartup && !process.env.PORT) {
  process.env.PORT = "3000";
}

// Direct local runs without a configured database should still start the app
// shell instead of failing during bundled bootstrap or startup migrations.
if (isLocalStartup && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/local-startup-placeholder";
  process.env.UNIQUEPOS_SKIP_STARTUP_DB_ABORT = "1";
}

function hasPsqlBinary() {
  const check = spawnSync("psql", ["--version"], { encoding: "utf8" });
  return !check.error && check.status === 0;
}

function runPsql(args) {
  return spawnSync("psql", args, { encoding: "utf8", env: process.env });
}

function ensureDatabaseBootstrap() {
  if (!process.env.DATABASE_URL) return;
  if (process.env.UNIQUEPOS_SKIP_STARTUP_DB_ABORT === "1") return;
  if (process.env.UNIQUEPOS_AUTO_DB_BOOTSTRAP === "0") return;
  if (!hasPsqlBinary()) return;
  const sqlPath = path.join(__dirname, "database.sql");
  if (!fs.existsSync(sqlPath)) return;

  const existsCheck = runPsql([
    process.env.DATABASE_URL,
    "-tAc",
    "SELECT to_regclass('public.business_settings') IS NOT NULL"
  ]);
  if (existsCheck.status === 0 && existsCheck.stdout.trim() === "t") return;

  const restore = runPsql([
    process.env.DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    sqlPath
  ]);
  if (restore.status !== 0) {
    const details = [restore.stdout, restore.stderr].filter(Boolean).join("\n").trim();
    const error = new Error(
      `Automatic PostgreSQL bootstrap failed.${details ? `\n${details}` : ""}`
    );
    if (process.env.UNIQUEPOS_AUTO_DB_BOOTSTRAP_REQUIRED === "1") {
      throw error;
    }
    console.warn(error.message);
  }
}

ensureDatabaseBootstrap();

require("./index.cjs");
