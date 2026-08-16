// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { validateStartupEnv } = require("./scripts/validate-startup-env.cjs");
const { FONT_DIR, assertFonts } = require("./server/pdf/fonts.cjs");
const { loadIndex } = require("./server/pdf/bundle-loader.cjs");

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
const defaultClientDir = path.join(__dirname, "public");
const configuredClientDir = process.env.SERVE_CLIENT_DIR ? path.resolve(process.env.SERVE_CLIENT_DIR) : "";
const configuredClientIndex = configuredClientDir ? path.join(configuredClientDir, "index.html") : "";
const defaultClientIndex = path.join(defaultClientDir, "index.html");
if (configuredClientDir && !fs.existsSync(configuredClientIndex)) {
  if (fs.existsSync(defaultClientIndex)) process.env.SERVE_CLIENT_DIR = defaultClientDir;
  else delete process.env.SERVE_CLIENT_DIR;
} else if (!configuredClientDir && fs.existsSync(defaultClientIndex)) process.env.SERVE_CLIENT_DIR = defaultClientDir;
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");
if (!process.env.PORT) process.env.PORT = "8080";

function ensureRuntimeBundle() {
  const runtimeBundle = path.join(__dirname, "index.runtime.cjs");
  if (fs.existsSync(runtimeBundle)) return;
  console.log("[startup] Generated runtime bundle is missing; running deterministic build step");
  require("./scripts/build.cjs");
  if (!fs.existsSync(runtimeBundle)) throw new Error(`Build completed without creating ${runtimeBundle}`);
}

async function start() {
  try {
    assertFonts();
    console.log("[startup] PDF FONT_DIR:", FONT_DIR);
    console.log("[startup] PDF FONT_DIR contents:", fs.readdirSync(FONT_DIR).sort());
    validateStartupEnv();
    ensureRuntimeBundle();
    const { bootstrapDatabaseIfNeeded } = require("./scripts/bootstrap-db.cjs");
    const result = await bootstrapDatabaseIfNeeded();
    process.env.UNIQUEPOS_DISABLE_INTERNAL_STARTUP_MIGRATIONS = "1";
    console.log("[startup] Database bootstrap complete", result);
    if (result.adminBootstrapped) console.log("[bootstrap-db] Admin account ensured");
    loadIndex();
  } catch (err) {
    console.error("[startup] Startup failed", err);
    process.exit(1);
  }
}
start();
