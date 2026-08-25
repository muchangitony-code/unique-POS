'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

let pool;
function db() {
  if (!pool) {
    const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-v3');
    pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 10 });
  }
  return pool;
}
function text(v) { return String(v ?? '').trim(); }
function number(v, label, allowNegative = false) {
  const n = Number(v);
  if (!Number.isFinite(n) || (!allowNegative && n < 0)) throw new Error(`Invalid ${label}`);
  return n;
}

async function withTransaction(work) {
  const client = await db().connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function productPayload(b) {
  return [text(b.sku), text(b.barcode) || null, text(b.name), text(b.category) || null,
    text(b.brand) || null, text(b.unit) || 'pcs', number(b.costPrice ?? 0, 'cost price'),
    number(b.sellingPrice ?? 0, 'selling price'), number(b.vatRate ?? 0, 'VAT rate'),
    number(b.reorderLevel ?? 0, 'reorder level'), text(b.supplier) || null, text(b.description) || null];
}

function branchIdFromRequest(req) {
  const branchId = Number(req.query.branchId || req.headers['x-branch-id'] || 0);
  if (!Number.isInteger(branchId) || branchId <= 0) throw new Error('A valid branchId is required.');
  return branchId;
}

function mountInventoryV3(app) {
  if (app.__inventoryV3Mounted) return;
  app.__inventoryV3Mounted = true;

  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const branchId = branchIdFromRequest(req);
      const q = text(req.query.q);
      const params = [branchId];
      let where = 'p.is_active = TRUE';
      if (q) { params.push(`%${q}%`); where += ` AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.barcode,'') ILIKE $2)`; }
      const result = await db().query(`
        SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
               p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
               COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id AND s.branch_id=$1
        WHERE ${where}
        ORDER BY p.name ASC`, params);
      res.set('Cache-Control', 'no-store').json({ products: result.rows, branch_id: branchId });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post('/api/v3/inventory/products', async (req, res) => {
    const b = req.body || {};
    const [sku, , name] = productPayload(b);
    if (!sku || !name) return res.status(400).json({ error: 'SKU and product name are required.' });
    try {
      const values = productPayload(b);
      const result = await db().query(`INSERT INTO inventory_products_v2
        (sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, values);
      res.status(201).json({ product: result.rows[0] });
    } catch (error) { res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'SKU or barcode already exists.' : error.message }); }
  });

  app.patch('/api/v3/inventory/products/:id', async (req, res) => {
    const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const b = req.body || {}, values = [], fields = [];
    const add = (field, value) => { values.push(value); fields.push(`${field}=$${values.length}`); };
    for (const [key, field, label] of [['sku','sku'],['barcode','barcode'],['name','name'],['category','category'],['brand','brand'],['unit','unit'],['supplier','supplier'],['description','description']]) if (b[key] !== undefined) add(field, text(b[key]) || null);
    for (const [key, field, label] of [['costPrice','cost_price','cost price'],['sellingPrice','selling_price','selling price'],['vatRate','vat_rate','VAT rate'],['reorderLevel','reorder_level','reorder level']]) if (b[key] !== undefined) add(field, number(b[key], label));
    if (!fields.length) return res.status(400).json({ error: 'No changes supplied.' });
    values.push(id);
    try { const result = await db().query(`UPDATE inventory_products_v2 SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values); if (!result.rowCount) return res.status(404).json({ error: 'Product not found.' }); res.json({ product: result.rows[0] }); }
    catch (error) { res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'SKU or barcode already exists.' : error.message }); }
  });

  app.post('/api/v3/inventory/stock/opening', async (req, res) => {
    const b=req.body||{}, productId=Number(b.productId), branchId=Number(b.branchId), quantity=number(b.quantity,'opening stock');
    if(!Number.isInteger(productId)||!Number.isInteger(branchId)) return res.status(400).json({error:'Product and branch are required.'});
    try { await withTransaction(async client=>{ await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`,[productId,branchId,quantity]); await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,'opening_balance',$3,$4,$5)`,[productId,branchId,quantity,text(b.reason)||'Opening stock',b.userId||null]); }); res.status(201).json({ok:true}); }
    catch(error){res.status(400).json({error:error.message});}
  });

  app.post('/api/v3/inventory/stock/adjust', async (req,res)=>{
    const b=req.body||{},productId=Number(b.productId),branchId=Number(b.branchId),delta=number(b.quantityDelta,'quantity adjustment',true);
    if(!Number.isInteger(productId)||!Number.isInteger(branchId)||delta===0)return res.status(400).json({error:'Product, branch and non-zero adjustment are required.'});
    try { const result=await withTransaction(async client=>{const current=await client.query('SELECT quantity_on_hand FROM inventory_stock_v2 WHERE product_id=$1 AND branch_id=$2 FOR UPDATE',[productId,branchId]);const before=Number(current.rows[0]?.quantity_on_hand||0),after=before+delta;if(after<0)throw new Error('Stock cannot become negative.');await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=$3,updated_at=NOW()`,[productId,branchId,after]);await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,$3,$4,$5,$6)`,[productId,branchId,delta>0?'adjustment_in':'adjustment_out',delta,text(b.reason)||'Stock adjustment',b.userId||null]);return {before,after};});res.status(201).json(result);}
    catch(error){res.status(400).json({error:error.message});}
  });

  app.get('/api/v3/inventory/movements', async (req,res)=>{try{const params=[],where=[];if(req.query.productId){params.push(Number(req.query.productId));where.push(`product_id=$${params.length}`);}if(req.query.branchId){params.push(Number(req.query.branchId));where.push(`branch_id=$${params.length}`);}const result=await db().query(`SELECT * FROM inventory_movements_v2 ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`,params);res.json({movements:result.rows});}catch(error){res.status(500).json({error:'Unable to load stock movements.'});}});

  console.log('[inventory-v3] direct inventory API mounted');
}

module.exports = { mountInventoryV3, withTransaction };
