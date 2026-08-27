'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');
const { allocateProductIdentifiers } = require('./product-identifiers.cjs');

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
  return [text(b.sku),text(b.barcode)||null,text(b.name),text(b.category)||null,text(b.brand)||null,text(b.unit)||'pcs',number(b.costPrice??0,'cost price'),number(b.sellingPrice??0,'selling price'),number(b.vatRate??0,'VAT rate'),number(b.reorderLevel??0,'reorder level'),text(b.supplier)||null,text(b.description)||null,b.posEnabled === false ? false : true];
}
function mountInventoryV3(app) {
  if (app.__inventoryV3Mounted) return;
  app.__inventoryV3Mounted = true;

  app.get('/api/v3/inventory/products',async(req,res)=>{try{
    const q=text(req.query.q);
    const requestedBranchId=Number(req.query.branchId);
    const params=[];
    const branchExpression=Number.isInteger(requestedBranchId)&&requestedBranchId>0
      ? (params.push(requestedBranchId),'$1')
      : "(SELECT id FROM branches WHERE is_active=TRUE AND (code='MAIN' OR lower(trim(name))='main branch') ORDER BY CASE WHEN code='MAIN' THEN 0 ELSE 1 END,id LIMIT 1)";
    let where='p.is_active=TRUE AND COALESCE(p.pos_enabled,TRUE)=TRUE';
    if(q){params.push(`%${q}%`);where+=` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`;}
    const result=await db().query(`SELECT p.id,p.sku,p.barcode,p.name,p.category,p.brand,p.unit,p.cost_price,p.selling_price,p.vat_rate,p.reorder_level,p.is_active,p.pos_enabled,COALESCE(s.quantity_on_hand,0) AS quantity_on_hand FROM inventory_products_v2 p LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id AND s.branch_id=${branchExpression} WHERE ${where} ORDER BY p.name ASC`,params);
    res.set('Cache-Control','no-store').json({products:result.rows});
  }catch(error){console.error('[inventory-v3] list failed',error);res.status(500).json({error:'Unable to load inventory.'});}});

  app.get('/api/v3/inventory/dashboard',async(_req,res)=>{try{const result=await db().query(`SELECT COUNT(DISTINCT p.id)::BIGINT AS total_products,COALESCE(SUM(s.quantity_on_hand),0) AS total_units,COUNT(*) FILTER(WHERE COALESCE(s.quantity_on_hand,0)=0)::BIGINT AS out_of_stock_items,COUNT(*) FILTER(WHERE COALESCE(s.quantity_on_hand,0)>0 AND COALESCE(s.quantity_on_hand,0)<=p.reorder_level)::BIGINT AS low_stock_items,COALESCE(SUM(s.quantity_on_hand*p.cost_price),0) AS inventory_cost_value,GREATEST(COALESCE(MAX(p.updated_at),TIMESTAMPTZ 'epoch'),COALESCE(MAX(s.updated_at),TIMESTAMPTZ 'epoch')) AS last_updated FROM inventory_products_v2 p LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id WHERE p.is_active=TRUE`);res.set('Cache-Control','no-store').json(result.rows[0]);}catch(error){console.error('[inventory-v3] dashboard failed',error);res.status(500).json({error:'Unable to load live inventory dashboard data.'});}});

  app.post('/api/v3/inventory/products',async(req,res)=>{const b=req.body||{},values=productPayload(b);if(!values[2])return res.status(400).json({error:'Product name is required.'});try{const product=await withTransaction(async client=>{const identifiers=await allocateProductIdentifiers(client,{sku:values[0],barcode:values[1],category:values[3]});values[0]=identifiers.sku;values[1]=identifiers.barcode;const result=await client.query(`INSERT INTO inventory_products_v2(sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description,pos_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,values);await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) SELECT $1,id,0 FROM branches WHERE is_active=TRUE ON CONFLICT(product_id,branch_id) DO NOTHING`,[result.rows[0].id]);return result.rows[0];});res.status(201).json({product});}catch(error){if(error.code==='23505')return res.status(409).json({error:'SKU or barcode already exists.'});res.status(400).json({error:error.message});}});

  app.patch('/api/v3/inventory/products/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({error:'Invalid product ID.'});const b=req.body||{},values=[],fields=[];const add=(f,v)=>{values.push(v);fields.push(`${f}=$${values.length}`);};if(b.sku!==undefined)add('sku',text(b.sku));if(b.barcode!==undefined)add('barcode',text(b.barcode)||null);if(b.name!==undefined)add('name',text(b.name));if(b.category!==undefined)add('category',text(b.category)||null);if(b.brand!==undefined)add('brand',text(b.brand)||null);if(b.unit!==undefined)add('unit',text(b.unit)||'pcs');if(b.costPrice!==undefined)add('cost_price',number(b.costPrice,'cost price'));if(b.sellingPrice!==undefined)add('selling_price',number(b.sellingPrice,'selling price'));if(b.vatRate!==undefined)add('vat_rate',number(b.vatRate,'VAT rate'));if(b.reorderLevel!==undefined)add('reorder_level',number(b.reorderLevel,'reorder level'));if(b.supplier!==undefined)add('supplier',text(b.supplier)||null);if(b.description!==undefined)add('description',text(b.description)||null);if(b.posEnabled!==undefined)add('pos_enabled',Boolean(b.posEnabled));if(!fields.length)return res.status(400).json({error:'No changes supplied.'});values.push(id);try{const result=await db().query(`UPDATE inventory_products_v2 SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length} AND is_active=TRUE RETURNING *`,values);if(!result.rowCount)return res.status(404).json({error:'Product not found.'});res.set('Cache-Control','no-store').json({product:result.rows[0]});}catch(error){if(error.code==='23505')return res.status(409).json({error:'SKU or barcode already exists.'});res.status(400).json({error:error.message});}});

  app.delete('/api/v3/inventory/products/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({error:'Invalid product ID.'});try{await withTransaction(async client=>{const result=await client.query('DELETE FROM inventory_products_v2 WHERE id=$1 RETURNING id',[id]);if(!result.rowCount){const e=new Error('Product not found.');e.status=404;throw e;}});res.sendStatus(204);}catch(error){if(error.status===404)return res.status(404).json({error:error.message});res.status(400).json({error:error.message});}});

  app.post('/api/v3/inventory/stock/opening',async(req,res)=>{const b=req.body||{},productId=Number(b.productId),branchId=Number(b.branchId),quantity=number(b.quantity,'opening stock');if(!Number.isInteger(productId)||!Number.isInteger(branchId))return res.status(400).json({error:'Product and branch are required.'});try{await withTransaction(async client=>{await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`,[productId,branchId,quantity]);await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,'opening_balance',$3,$4,$5)`,[productId,branchId,quantity,text(b.reason)||'Opening stock',b.userId||null]);});res.status(201).json({ok:true});}catch(error){res.status(400).json({error:error.message});}});

  app.post('/api/v3/inventory/stock/adjust',async(req,res)=>{const b=req.body||{},productId=Number(b.productId),branchId=Number(b.branchId),delta=number(b.quantityDelta,'quantity adjustment',true);if(!Number.isInteger(productId)||!Number.isInteger(branchId)||delta===0)return res.status(400).json({error:'Product, branch and non-zero adjustment are required.'});try{const result=await withTransaction(async client=>{const current=await client.query('SELECT quantity_on_hand FROM inventory_stock_v2 WHERE product_id=$1 AND branch_id=$2 FOR UPDATE',[productId,branchId]);const before=Number(current.rows[0]?.quantity_on_hand||0),after=before+delta;if(after<0)throw new Error('Stock cannot become negative.');await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=$3,updated_at=NOW()`,[productId,branchId,after]);await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,$3,$4,$5,$6)`,[productId,branchId,delta>0?'adjustment_in':'adjustment_out',delta,text(b.reason)||'Stock adjustment',b.userId||null]);return{before,after};});res.status(201).json(result);}catch(error){res.status(400).json({error:error.message});}});

  app.get('/api/v3/inventory/movements',async(req,res)=>{try{const params=[],where=[];if(req.query.productId){params.push(Number(req.query.productId));where.push(`product_id=$${params.length}`);}if(req.query.branchId){params.push(Number(req.query.branchId));where.push(`branch_id=$${params.length}`);}const result=await db().query(`SELECT * FROM inventory_movements_v2 ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`,params);res.set('Cache-Control','no-store').json({movements:result.rows});}catch(error){res.status(500).json({error:'Unable to load stock movements.'});}});
  console.log('[inventory-v3] transactional inventory API mounted');
}
module.exports={mountInventoryV3};
