'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./database-url.cjs');

const CONFIRM = 'DESTROY_ALL_POS_DATA_AND_REBUILD';

async function run() {
  if (process.env.RESET_CONFIRM !== CONFIRM) {
    throw new Error(`Reset blocked. Set RESET_CONFIRM=${CONFIRM}`);
  }

  const { databaseUrl } = parseAndValidateDatabaseUrl('clean-reset');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    for (const { tablename } of rows) {
      await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tablename)} CASCADE`);
    }

    await client.query(`
      CREATE TABLE businesses (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        tax_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE branches (
        id BIGSERIAL PRIMARY KEY,
        business_id BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        address TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE products (
        id BIGSERIAL PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
        selling_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE stock_movements (
        id BIGSERIAL PRIMARY KEY,
        branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','receive','sale','adjustment','return')),
        quantity_delta NUMERIC(14,3) NOT NULL,
        unit_cost NUMERIC(14,2),
        reference_type TEXT,
        reference_id TEXT,
        note TEXT,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE sales (
        id BIGSERIAL PRIMARY KEY,
        branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
        sale_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft','completed','void')),
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE sale_items (
        id BIGSERIAL PRIMARY KEY,
        sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14,2) NOT NULL
      );

      CREATE TABLE payments (
        id BIGSERIAL PRIMARY KEY,
        sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        method TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
        reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE quotations (
        id BIGSERIAL PRIMARY KEY,
        branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
        quotation_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','expired','cancelled')),
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes TEXT,
        valid_until DATE,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE quotation_items (
        id BIGSERIAL PRIMARY KEY,
        quotation_id BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14,2) NOT NULL
      );

      CREATE TABLE invoices (
        id BIGSERIAL PRIMARY KEY,
        sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
        branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax NUMERIC(14,2) NOT NULL DEFAULT 0,
        total NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_stock_movements_branch_product ON stock_movements(branch_id, product_id, created_at);
      CREATE INDEX idx_sales_branch_created ON sales(branch_id, created_at);
      CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
    `);

    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, reset: 'complete', tables: rows.map(r => r.tablename), rebuilt: true }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function quoteIdent(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

run().catch(error => {
  console.error('[clean-reset] FAILED:', error.message || error);
  process.exit(1);
});
