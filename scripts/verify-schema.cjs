"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function databaseTargetFromUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "") || "postgres";
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: databaseName
  };
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const target = databaseTargetFromUrl(databaseUrl);
  console.log(`[verify-schema] Target host=${target.host} port=${target.port} database=${target.database}`);
  return databaseUrl;
}

function resolveSsl(databaseUrl) {
  const isLocal = /localhost|127\.0\.0\.1|::1/.test(databaseUrl);
  return isLocal ? false : { rejectUnauthorized: false };
}

const REQUIRED_TABLES = [
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "branches",
  "business_settings",
  "customers",
  "customer_groups",
  "suppliers",
  "categories",
  "brands",
  "products",
  "product_units",
  "stock",
  "stock_adjustments",
  "purchases",
  "purchase_items",
  "sales",
  "sale_items",
  "quotations",
  "quotation_items",
  "invoices",
  "invoice_items",
  "payments",
  "payment_methods",
  "expenses",
  "expense_categories",
  "returns",
  "return_items",
  "transfers",
  "transfer_items",
  "audit_logs",
  "audit_log",
  "sessions",
  "settings",
  "tax_rates",
  "discounts",
  "barcode_labels",
  "receipts",
  "currencies",
  "notifications",
  "product_stock",
  "stock_movements",
  "stock_transfers",
  "invoice_payments",
  "login_history",
  "admin_notifications",
  "data_migrations",
  "schema_migrations"
];

async function verifySchema() {
  const databaseUrl = getDatabaseUrl();

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: resolveSsl(databaseUrl)
  });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name ASC
    `);

    const existing = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !existing.has(name));

    if (missing.length > 0) {
      throw new Error(`Missing required tables: ${missing.join(", ")}`);
    }

    console.log("[verify-schema] OK - all required tables exist.");
    return {
      requiredCount: REQUIRED_TABLES.length,
      existingCount: rows.length
    };
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  verifySchema().then((result) => {
    console.log("[verify-schema] Summary", result);
  }).catch((err) => {
    console.error("[verify-schema] Failed", err.message || err);
    process.exit(1);
  });
}

module.exports = { verifySchema };
