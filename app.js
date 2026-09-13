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

// The production runtime is a generated CommonJS bundle. Older builds did not
// mount the standalone product-bulk router, even though product-bulk.cjs exists.
// Patch the generated runtime at startup so cPanel/Passenger deployments get the
// API without requiring a separate build step after every GitHub update.
const runtimePath = path.join(__dirname, "server", "index.cjs");
const runtimeMarker = "UNIQUEPOS_PRODUCT_BULK_RUNTIME_MOUNT_V1";
if (fs.existsSync(runtimePath)) {
  let runtime = fs.readFileSync(runtimePath, "utf8");
  if (!runtime.includes(runtimeMarker)) {
    const anchor = "runStartupMigrations().then(() => {";
    if (!runtime.includes(anchor)) {
      throw new Error("UniquePOS: could not locate runtime startup anchor for product bulk import.");
    }
    const injection = `\n// ${runtimeMarker}\n(function mountProductBulkImportRuntime() {\n  try {\n    const expressRuntime = require("express");\n    const { Pool } = require("pg");\n    const { createProductBulkRouter } = require(path.join(__dirname, "..", "product-bulk.cjs"));\n    const bulkPool = new Pool({\n      connectionString: process.env.DATABASE_URL,\n      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined\n    });\n    const bulkLogAudit = async () => {};\n    const bulkMakeBarcode = (productCode, productId) => {\n      const prefix = String(productCode || "PROD").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4).padEnd(4, "X");\n      return prefix + String(productId).padStart(8, "0");\n    };\n    const bulkResolveWriteBranchId = async (req) => {\n      const direct = Number(req?.user?.branchId || req?.user?.branch_id || 0);\n      if (Number.isInteger(direct) && direct > 0) return direct;\n      const result = await bulkPool.query("SELECT id FROM branches ORDER BY id LIMIT 1");\n      return Number(result.rows[0]?.id || 0);\n    };\n    const bulkRouter = createProductBulkRouter({\n      Router: expressRuntime.Router,\n      pool: bulkPool,\n      logAudit: bulkLogAudit,\n      makeBarcode: bulkMakeBarcode,\n      resolveWriteBranchId: bulkResolveWriteBranchId,\n      detectProductCategorySuggestion: async () => null\n    });\n    app_default.use("/api", bulkRouter);\n    console.log("[product-bulk] runtime router mounted at /api/products/imports");\n  } catch (error) {\n    console.error("[product-bulk] failed to mount runtime router", error);\n    throw error;\n  }\n})();\n\n`;
    runtime = runtime.replace(anchor, injection + anchor);
    fs.writeFileSync(runtimePath, runtime, "utf8");
  }
}

// Synchronous require — the bundled server is CommonJS and starts on import.
require("./server/index.cjs");
