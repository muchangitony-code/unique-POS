'use strict';

const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const poolInfo = parseAndValidateDatabaseUrl('inventory-acceptance');
const pool = new Pool({ connectionString: poolInfo.databaseUrl, ssl: railwaySsl(poolInfo.databaseUrl), max: 20 });

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store'
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text}`);
  return body;
}

async function main() {
  const client = await pool.connect();
  let createdIds = [];
  try {
    for (const table of ['products', 'product_stock']) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
      assert.equal(rows[0].count, 0, `${table} still contains legacy rows`);
    }

    const fk = await client.query(`
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.inventory_stock_v2'::regclass
        AND confrelid = 'public.inventory_products_v2'::regclass
        AND contype = 'f'
    `);
    assert.equal(fk.rowCount, 1, 'inventory_stock_v2.product_id FK is missing');

    const branches = await client.query('SELECT id FROM branches WHERE is_active=TRUE ORDER BY id LIMIT 2');
    assert.ok(branches.rowCount >= 1, 'At least one active branch is required');
    const branchA = Number(branches.rows[0].id);
    const branchB = branches.rowCount > 1 ? Number(branches.rows[1].id) : null;

    const sku = `ACCEPT-${Date.now()}`;
    const created = await api('/api/v3/inventory/products', {
      method: 'POST', body: JSON.stringify({ sku, name: 'Acceptance Product', sellingPrice: 100 })
    });
    createdIds.push(created.product.id);

    let list = await api(`/api/v3/inventory/products?q=${encodeURIComponent(sku)}&branchId=${branchA}`);
    assert.equal(list.products.length, 1);
    assert.equal(Number(list.products[0].quantity_on_hand), 0);

    if (branchB) {
      const other = await api(`/api/v3/inventory/products?q=${encodeURIComponent(sku)}&branchId=${branchB}`);
      assert.equal(other.products.length, 1);
      assert.equal(Number(other.products[0].quantity_on_hand), 0);
    }

    await api(`/api/v3/inventory/products/${created.product.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Acceptance Product Edited' })
    });
    list = await api(`/api/v3/inventory/products?q=${encodeURIComponent(sku)}&branchId=${branchA}`);
    assert.equal(list.products[0].name, 'Acceptance Product Edited');

    const dashboard = await api(`/api/v3/inventory/dashboard?branchId=${branchA}`);
    const direct = await client.query(`
      SELECT
        COUNT(DISTINCT p.id)::int AS total_products,
        COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand,0)=0)::int AS out_of_stock_items,
        COUNT(*) FILTER (WHERE COALESCE(s.quantity_on_hand,0)>0 AND COALESCE(s.quantity_on_hand,0)<=p.reorder_level)::int AS low_stock_items
      FROM inventory_products_v2 p
      LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id AND s.branch_id=$1
      WHERE p.is_active=TRUE
    `, [branchA]);
    assert.equal(Number(dashboard.total_products), Number(direct.rows[0].total_products));
    assert.equal(Number(dashboard.out_of_stock_items), Number(direct.rows[0].out_of_stock_items));
    assert.equal(Number(dashboard.low_stock_items), Number(direct.rows[0].low_stock_items));

    const batch = Array.from({ length: 20 }, (_, i) => `STRESS-${Date.now()}-${i}`);
    const stress = await Promise.all(batch.map(s => api('/api/v3/inventory/products', {
      method: 'POST', body: JSON.stringify({ sku: s, name: s, sellingPrice: 10 })
    })));
    createdIds.push(...stress.map(x => x.product.id));
    const duplicateStock = await client.query(`
      SELECT product_id, branch_id, COUNT(*) AS n
      FROM inventory_stock_v2 WHERE product_id = ANY($1::bigint[])
      GROUP BY product_id, branch_id HAVING COUNT(*) > 1
    `, [stress.map(x => x.product.id)]);
    assert.equal(duplicateStock.rowCount, 0, 'Concurrent product creation created duplicate stock rows');

    await Promise.all(stress.map(x => api(`/api/v3/inventory/products/${x.product.id}`, {
      method: 'PATCH', body: JSON.stringify({ sellingPrice: 11 })
    })));

    await Promise.all(createdIds.map(id => api(`/api/v3/inventory/products/${id}`, { method: 'DELETE' })));
    const orphanStock = await client.query(`
      SELECT COUNT(*)::int AS count FROM inventory_stock_v2 s
      LEFT JOIN inventory_products_v2 p ON p.id=s.product_id WHERE p.id IS NULL
    `);
    const orphanMovements = await client.query(`
      SELECT COUNT(*)::int AS count FROM inventory_movements_v2 m
      LEFT JOIN inventory_products_v2 p ON p.id=m.product_id WHERE p.id IS NULL
    `);
    assert.equal(orphanStock.rows[0].count, 0);
    assert.equal(orphanMovements.rows[0].count, 0);

    console.log('Inventory acceptance criteria: PASS');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
