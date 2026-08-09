"use strict";

const { Pool } = require("pg");
const { parseAndValidateDatabaseUrl, railwaySsl } = require("./database-url.cjs");

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
  const { databaseUrl } = parseAndValidateDatabaseUrl("verify-schema");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: railwaySsl()
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
