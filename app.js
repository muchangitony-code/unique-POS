'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('node:path');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');

const app = express();
app.use(express.json({ limit: '10mb' }));

const { databaseUrl } = parseAndValidateDatabaseUrl('unique-pos-clean');
const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl) });

app.get('/api/healthz', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'unique-pos' }); }
  catch (error) { res.status(503).json({ ok: false, error: 'database_unavailable' }); }
});

app.get('/api/inventory/dashboard', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS products,
        COUNT(*) FILTER (WHERE COALESCE(qty.quantity, 0) <= 0)::int AS out_of_stock,
        COALESCE(SUM(COALESCE(qty.quantity,0) * p.cost_price),0)::numeric(14,2) AS stock_value
      FROM products p
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(quantity_delta),0) AS quantity
        FROM stock_movements m WHERE m.product_id=p.id
      ) qty ON true
      WHERE p.active=true
    `);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/inventory/products', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*, COALESCE(q.quantity,0) AS quantity
      FROM products p
      LEFT JOIN LATERAL (SELECT SUM(quantity_delta) AS quantity FROM stock_movements m WHERE m.product_id=p.id) q ON true
      WHERE p.active=true ORDER BY p.name
    `);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/inventory/products', async (req, res, next) => {
  try {
    const { sku, barcode, name, description = null, cost_price = 0, selling_price = 0 } = req.body || {};
    if (!sku || !name) return res.status(400).json({ error: 'sku and name are required' });
    const result = await pool.query('INSERT INTO products (sku,barcode,name,description,cost_price,selling_price) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[sku,barcode||null,name,description,Number(cost_price),Number(selling_price)]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/api/inventory/receive', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { branch_id, product_id, quantity, unit_cost = null, note = null } = req.body || {};
    if (!branch_id || !product_id || !(Number(quantity) > 0)) return res.status(400).json({ error: 'branch_id, product_id and positive quantity are required' });
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO stock_movements (branch_id,product_id,movement_type,quantity_delta,unit_cost,note) VALUES ($1,$2,'receive',$3,$4,$5) RETURNING *`,[branch_id,product_id,Number(quantity),unit_cost,note]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); next(error); } finally { client.release(); }
});

app.post('/api/inventory/adjust', async (req, res, next) => {
  try {
    const { branch_id, product_id, quantity_delta, note = null } = req.body || {};
    if (!branch_id || !product_id || !Number.isFinite(Number(quantity_delta)) || Number(quantity_delta) === 0) return res.status(400).json({ error: 'branch_id, product_id and non-zero quantity_delta are required' });
    const result = await pool.query(`INSERT INTO stock_movements (branch_id,product_id,movement_type,quantity_delta,note) VALUES ($1,$2,'adjustment',$3,$4) RETURNING *`,[branch_id,product_id,Number(quantity_delta),note]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/inventory/movements', async (_req, res, next) => {
  try { const result = await pool.query('SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 200'); res.json(result.rows); } catch (error) { next(error); }
});

app.get('/api/branches', async (_req,res,next)=>{try{res.json((await pool.query('SELECT * FROM branches ORDER BY name')).rows);}catch(error){next(error);}});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req,res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({ error: 'internal_error', detail: process.env.NODE_ENV==='production'?undefined:error.message });});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`[unique-pos] listening on ${port}`));
