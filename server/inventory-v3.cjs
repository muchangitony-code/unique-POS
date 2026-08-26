'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');
const { createBulkImportV2Router } = require('./bulk-import-v2-router.cjs');
const express = require('express');

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
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function productPayload(b) {
  return [
    text(b.sku), text(b.barcode) || null, text(b.name), text(b.category) || null,
    text(b.brand) || null, text(b.unit) || 'pcs', number(b.costPrice ?? 0, 'cost price'),
    number(b.sellingPrice ?? 0, 'selling price'), number(b.vatRate ?? 0, 'VAT rate'),
    number(b.reorderLevel ?? 0, 'reorder level'), text(b.supplier) || null,
    text(b.description) || null
  ];
}

async function syncImportJob(client, jobId, requestedBranchId) {
  const jobResult = await client.query(
    'SELECT id, status, total_rows, valid_rows, invalid_rows, COALESCE(summary, \'{}\'::jsonb) AS summary FROM product_import_jobs WHERE id=$1 FOR UPDATE',
    [jobId]
  );
  if (!jobResult.rowCount) throw new Error('Import job not found.');
  const job = jobResult.rows[0];
  if (job.status !== 'completed') throw new Error(`Import job is ${job.status}; only completed imports can be synced.`);
  if (job.summary && job.summary.live_inventory_synced === true) return { jobId, alreadySynced: true, created: 0, updated: 0, syncedRows: Number(job.valid_rows || 0), stockRows: Number(job.valid_rows || 0), branchId: null };
  const rowsResult = await client.query(`SELECT row_number, normalized_data, validation_errors FROM product_import_rows WHERE job_id=$1 AND status <> 'skipped' ORDER BY row_number`, [jobId]);
  const rows = rowsResult.rows;
  const invalid = rows.filter(row => Array.isArray(row.validation_errors) && row.validation_errors.length > 0);
  if (invalid.length) throw new Error(`Import job contains ${invalid.length} invalid row(s); correct the file and import again.`);
  const branchesResult = await client.query('SELECT id, name, code FROM branches WHERE is_active=TRUE ORDER BY id ASC');
  const branches = branchesResult.rows;
  if (!branches.length) throw new Error('No active branch is available for imported stock.');
  const requested = Number(requestedBranchId || 0);
  const targetBranch = requested && branches.some(branch => Number(branch.id) === requested) ? branches.find(branch => Number(branch.id) === requested) : branches[0];
  let created = 0, updated = 0, stockRows = 0;
  for (const row of rows) {
    const data = row.normalized_data || {};
    const name = text(data.product_name);
    const sku = text(data.product_code) || `IMP-${jobId}-${row.row_number}`;
    if (!name) throw new Error(`Row ${row.row_number}: product name is required.`);
    const barcode = text(data.barcode) || null;
    const costPrice = number(data.cost_price ?? 0, `cost price on row ${row.row_number}`);
    const sellingPrice = number(data.selling_price ?? 0, `selling price on row ${row.row_number}`);
    const vatRate = number(data.vat_rate ?? 0, `VAT rate on row ${row.row_number}`);
    const reorderLevel = number(data.min_stock ?? 0, `reorder level on row ${row.row_number}`);
    const openingStock = number(data.current_stock ?? 0, `opening stock on row ${row.row_number}`);
    const existing = await client.query('SELECT id FROM inventory_products_v2 WHERE sku=$1 OR ($2::text IS NOT NULL AND barcode=$2) LIMIT 1', [sku, barcode]);
    let productId;
    if (existing.rowCount) { productId = existing.rows[0].id; await client.query(`UPDATE inventory_products_v2 SET sku=$1,barcode=$2,name=$3,category=$4,brand=$5,unit=$6,cost_price=$7,selling_price=$8,vat_rate=$9,reorder_level=$10,supplier=$11,description=$12,is_active=TRUE,updated_at=NOW() WHERE id=$13`, [sku,barcode,name,text(data.category)||null,text(data.brand)||null,text(data.unit)||'pcs',costPrice,sellingPrice,vatRate,reorderLevel,text(data.supplier)||null,text(data.description)||null,productId]); updated++; }
    else { const inserted=await client.query(`INSERT INTO inventory_products_v2(sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [sku,barcode,name,text(data.category)||null,text(data.brand)||null,text(data.unit)||'pcs',costPrice,sellingPrice,vatRate,reorderLevel,text(data.supplier)||null,text(data.description)||null]); productId=inserted.rows[0].id; created++; }
    await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) SELECT $1,id,0 FROM branches WHERE is_active=TRUE ON CONFLICT(product_id,branch_id) DO NOTHING`, [productId]);
    await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`, [productId,targetBranch.id,openingStock]);
    stockRows++;
    await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason) VALUES($1,$2,'opening_balance',$3,$4)`, [productId,targetBranch.id,openingStock,`Bulk import job ${jobId}, row ${row.row_number}`]);
  }
  return { jobId, alreadySynced:false, created, updated, syncedRows:rows.length, stockRows, branchId:targetBranch.id };
}

function mountInventoryV3(app) {
  if (app.__inventoryV3Mounted) return;
  app.__inventoryV3Mounted = true;

  // Fresh Bulk Import V2 is mounted here against the clean V2 inventory schema.
  // It is intentionally independent of every historical importer.
  app.use(createBulkImportV2Router({ Router: express.Router, pool: db() }));

  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const q = text(req.query.q); const params = []; let where = 'p.is_active = TRUE';
      if (q) { params.push(`%${q}%`); where += ` AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR COALESCE(p.barcode,'') ILIKE $1)`; }
      const result = await db().query(`SELECT p.id,p.sku,p.barcode,p.name,p.category,p.brand,p.unit,p.cost_price,p.selling_price,p.vat_rate,p.reorder_level,COALESCE(SUM(s.quantity_on_hand),0) AS quantity_on_hand FROM inventory_products_v2 p LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id WHERE ${where} GROUP BY p.id ORDER BY p.name ASC`, params);
      res.set('Cache-Control','no-store').json({products:result.rows});
    } catch (error) { console.error('[inventory-v3] list failed',error); res.status(500).json({error:'Unable to load inventory.'}); }
  });

  app.get('/api/v3/inventory/dashboard', async (_req,res)=>{try{const result=await db().query(`SELECT COUNT(DISTINCT p.id)::BIGINT AS total_products,COALESCE(SUM(s.quantity_on_hand),0) AS total_units,COUNT(*) FILTER(WHERE COALESCE(s.quantity_on_hand,0)=0)::BIGINT AS out_of_stock_items,COUNT(*) FILTER(WHERE COALESCE(s.quantity_on_hand,0)>0 AND COALESCE(s.quantity_on_hand,0)<=p.reorder_level)::BIGINT AS low_stock_items,COALESCE(SUM(s.quantity_on_hand*p.cost_price),0) AS inventory_cost_value,GREATEST(COALESCE(MAX(p.updated_at),TIMESTAMPTZ 'epoch'),COALESCE(MAX(s.updated_at),TIMESTAMPTZ 'epoch')) AS last_updated FROM inventory_products_v2 p LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id WHERE p.is_active=TRUE`);res.set('Cache-Control','no-store').json(result.rows[0]);}catch(error){console.error('[inventory-v3] dashboard failed',error);res.status(500).json({error:'Unable to load live inventory dashboard data.'});}});

  app.post('/api/v3/inventory/import-job/latest/sync', async (req,res)=>{try{const result=await withTransaction(async client=>{const latest=await client.query(`SELECT id FROM product_import_jobs WHERE status='completed' ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1`);if(!latest.rowCount)throw new Error('No completed bulk import job was found.');return syncImportJob(client,latest.rows[0].id,req.body?.branchId);});res.set('Cache-Control','no-store').json({ok:true,...result});}catch(error){console.error('[inventory-v3] latest bulk import sync failed',error);res.status(400).json({error:error.message||'Unable to sync the latest bulk import.'});}});
  app.post('/api/v3/inventory/import-job/:id/sync',async(req,res)=>{const jobId=Number(req.params.id);if(!Number.isInteger(jobId)||jobId<=0)return res.status(400).json({error:'Invalid import job ID.'});try{const result=await withTransaction(client=>syncImportJob(client,jobId,req.body?.branchId));res.set('Cache-Control','no-store').json({ok:true,...result});}catch(error){console.error('[inventory-v3] bulk import sync failed',error);res.status(400).json({error:error.message||'Unable to sync bulk import into live inventory.'});}});
  app.post('/api/v3/inventory/products',async(req,res)=>{const b=req.body||{},values=productPayload(b);if(!values[0]||!values[2])return res.status(400).json({error:'SKU and product name are required.'});try{const product=await withTransaction(async client=>{const result=await client.query(`INSERT INTO inventory_products_v2(sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,values);await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) SELECT $1,id,0 FROM branches WHERE is_active=TRUE ON CONFLICT(product_id,branch_id) DO NOTHING`,[result.rows[0].id]);return result.rows[0];});res.status(201).json({product});}catch(error){if(error.code==='23505')return res.status(409).json({error:'SKU or barcode already exists.'});console.error('[inventory-v3] create failed',error);res.status(400).json({error:error.message});}});
  app.patch('/api/v3/inventory/products/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({error:'Invalid product ID.'});const b=req.body||{},values=[],fields=[];const add=(field,value)=>{values.push(value);fields.push(`${field}=$${values.length}`);};if(b.sku!==undefined)add('sku',text(b.sku));if(b.barcode!==undefined)add('barcode',text(b.barcode)||null);if(b.name!==undefined)add('name',text(b.name));if(b.category!==undefined)add('category',text(b.category)||null);if(b.brand!==undefined)add('brand',text(b.brand)||null);if(b.unit!==undefined)add('unit',text(b.unit)||'pcs');if(b.costPrice!==undefined)add('cost_price',number(b.costPrice,'cost price'));if(b.sellingPrice!==undefined)add('selling_price',number(b.sellingPrice,'selling price'));if(b.vatRate!==undefined)add('vat_rate',number(b.vatRate,'VAT rate'));if(b.reorderLevel!==undefined)add('reorder_level',number(b.reorderLevel,'reorder level'));if(b.supplier!==undefined)add('supplier',text(b.supplier)||null);if(b.description!==undefined)add('description',text(b.description)||null);if(!fields.length)return res.status(400).json({error:'No changes supplied.'});values.push(id);try{const result=await db().query(`UPDATE inventory_products_v2 SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length} AND is_active=TRUE RETURNING *`,values);if(!result.rowCount)return res.status(404).json({error:'Product not found.'});res.set('Cache-Control','no-store').json({product:result.rows[0]});}catch(error){if(error.code==='23505')return res.status(409).json({error:'SKU or barcode already exists.'});res.status(400).json({error:error.message});}});
  app.delete('/api/v3/inventory/products/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({error:'Invalid product ID.'});try{await withTransaction(async client=>{const result=await client.query('DELETE FROM inventory_products_v2 WHERE id=$1 RETURNING id',[id]);if(!result.rowCount){const error=new Error('Product not found.');error.status=404;throw error;}});res.sendStatus(204);}catch(error){if(error.status===404)return res.status(404).json({error:error.message});console.error('[inventory-v3] delete failed',error);res.status(400).json({error:error.message});}});
  app.post('/api/v3/inventory/stock/opening',async(req,res)=>{const b=req.body||{},productId=Number(b.productId),branchId=Number(b.branchId),quantity=number(b.quantity,'opening stock');if(!Number.isInteger(productId)||!Number.isInteger(branchId))return res.status(400).json({error:'Product and branch are required.'});try{const result=await withTransaction(async client=>{await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`,[productId,branchId,quantity]);await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,'opening_balance',$3,$4,$5)`,[productId,branchId,quantity,text(b.reason)||'Opening stock',b.userId||null]);return{ok:true};});res.status(201).json(result);}catch(error){res.status(400).json({error:error.message});}});
  app.post('/api/v3/inventory/stock/adjust',async(req,res)=>{const b=req.body||{},productId=Number(b.productId),branchId=Number(b.branchId),delta=number(b.quantityDelta,'quantity adjustment',true);if(!Number.isInteger(productId)||!Number.isInteger(branchId)||delta===0)return res.status(400).json({error:'Product, branch and non-zero adjustment are required.'});try{const result=await withTransaction(async client=>{const current=await client.query('SELECT quantity_on_hand FROM inventory_stock_v2 WHERE product_id=$1 AND branch_id=$2 FOR UPDATE',[productId,branchId]);const before=Number(current.rows[0]?.quantity_on_hand||0),after=before+delta;if(after<0)throw new Error('Stock cannot become negative.');await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=$3,updated_at=NOW()`,[productId,branchId,after]);await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,$3,$4,$5,$6)`,[productId,branchId,delta>0?'adjustment_in':'adjustment_out',delta,text(b.reason)||'Stock adjustment',b.userId||null]);return{before,after};});res.status(201).json(result);}catch(error){res.status(400).json({error:error.message});}});
  app.get('/api/v3/inventory/movements',async(req,res)=>{try{const params=[],where=[];if(req.query.productId){params.push(Number(req.query.productId));where.push(`product_id=$${params.length}`);}if(req.query.branchId){params.push(Number(req.query.branchId));where.push(`branch_id=$${params.length}`);}const result=await db().query(`SELECT * FROM inventory_movements_v2 ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`,params);res.set('Cache-Control','no-store').json({movements:result.rows});}catch(error){res.status(500).json({error:'Unable to load stock movements.'});}});
  console.log('[inventory-v3] transactional inventory API mounted');
}
module.exports={mountInventoryV3};
