// UniquePOS standalone entrypoint.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { validateStartupEnv } = require("./scripts/validate-startup-env.cjs");
const { assertFonts } = require("./server/pdf/fonts.cjs");
const { loadIndex } = require("./server/pdf/bundle-loader.cjs");

// Production isolation. Only the approved Railway project may serve the live POS.
// A second independent secret is required and is intentionally NOT stored in GitHub.
const APPROVED_RAILWAY_PROJECT_ID = "f453fde7-39c7-464a-9934-6ec7-dab51508";
const EXPECTED_PRODUCTION_LOCK = "UPOS-PROD-9xK7mQ2vL8rT4wN6cZ1pH5yB3sD7fJ0aX";

function assertProductionIsolation() {
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  if (!isRailway) return;

  const runtimeProjectId = process.env.RAILWAY_PROJECT_ID;
  if (runtimeProjectId !== APPROVED_RAILWAY_PROJECT_ID) {
    console.error("[security] Refusing startup: unapproved or missing Railway project identity.");
    process.exit(1);
  }

  const suppliedLock = process.env.UNIQUEPOS_PRODUCTION_LOCK;
  if (!suppliedLock || suppliedLock !== EXPECTED_PRODUCTION_LOCK) {
    console.error("[security] Refusing startup: UNIQUEPOS_PRODUCTION_LOCK is missing or invalid.");
    process.exit(1);
  }

  console.log("[security] Production isolation lock verified.");
}

assertProductionIsolation();

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq === -1) continue;
    const key = t.slice(0, eq).trim(); let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key !== "DATABASE_URL" && !(key in process.env)) process.env[key] = val;
  }
}
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.UNIQUEPOS_DISABLE_INTERNAL_STARTUP_MIGRATIONS = "1";
process.env.UNIQUEPOS_LEGACY_INVENTORY_RECOVERY = "disabled";
const defaultClientDir = path.join(__dirname, "public");
const configuredClientDir = process.env.SERVE_CLIENT_DIR ? path.resolve(process.env.SERVE_CLIENT_DIR) : "";
const configuredClientIndex = configuredClientDir ? path.join(configuredClientDir, "index.html") : "";
const defaultClientIndex = path.join(defaultClientDir, "index.html");
if (configuredClientDir && !fs.existsSync(configuredClientIndex)) { if (fs.existsSync(defaultClientIndex)) process.env.SERVE_CLIENT_DIR = defaultClientDir; else delete process.env.SERVE_CLIENT_DIR; }
else if (!configuredClientDir && fs.existsSync(defaultClientIndex)) process.env.SERVE_CLIENT_DIR = defaultClientDir;
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");
if (!process.env.PORT) process.env.PORT = "8080";

async function start() {
  try {
    assertFonts();
    console.log("[startup] PDF fonts: PDFKit built-in Helvetica / Helvetica-Bold");
    validateStartupEnv();
    console.log("[startup] Legacy inventory recovery and repair hooks: disabled");
    console.log("[security] Production clean-slate routine is permanently disabled and is not executed at startup");
    await loadIndex();
  } catch (err) { console.error("[startup] Startup failed", err); process.exit(1); }
}
start();
