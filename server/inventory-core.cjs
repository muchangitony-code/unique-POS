'use strict';

const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');
const { allocateProductIdentifiers } = require('./product-identifiers.cjs');

let pool;
function db() {
  if (!pool) {
    const { databaseUrl } = parseAndValidateDatabaseUrl('inventory-core');
    pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 10 });
  }
  return pool;
}
function text(v) { return String(v ?? '').trim(); }
function amount(v, label, negative = false) {
  const n = Number(v);
  if (!Number.isFinite(n) || (!negative && n < 0)) throw new Error(`Invalid ${label}`);
  return n;
}
function optionalAmount(v, label) {
  if (v === undefined || v === null || text(v) === '') return null;
  return amount(v, label);
}
function id(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} is required.`);
  return n;
}
function firstDefined(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== null && text(object[key]) !== '') return object[key];
  }
  return null;
}
async function tx(work) {
  const client = await db().connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function mountInventoryCore(app) {
  if (app.__inventoryCoreMounted) return;
  app.__inventoryCoreMounted = true;

  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const branchId = req.query.branchId ? id(req.query.branchId, 'Branch') : null;
      const q = text(req.query.q);
      const params = [];
      let branchSql;
      if (branchId) { params.push(branchId); branchSql = `$${params.length}`; }
      else branchSql = `(SELECT id FROM branches WHERE is_active=TRUE ORDER BY CASE WHEN code='MAIN' OR lower(trim(name))='main branch' THEN 0 ELSE 1 END,id LIMIT 1)`;
      const filters = ['p.is_active=TRUE', 'COALESCE(p.pos_enabled,TRUE)=TRUE'];
      if (q) {
        params.push(`%${q}%`);
        filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`);
      }
      const result = await db().query(`
        SELECT p.id,p.sku,p.barcode,p.name,p.category,p.brand,p.unit,p.cost_price,p.selling_price,p.vat_rate,p.reorder_level,p.is_active,p.pos_enabled,
               COALESCE(s.quantity_on_hand,0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s ON s.product_id=p.id AND s.branch_id=${branchSql}
        WHERE ${filters.join(' AND ')} ORDER BY p.name ASC`, params);
      res.set('Cache-Control','no-store').json({ products: result.rows, branch_id: branchId });
    } catch (error) { console.error('[inventory-core] products failed', error); res.status(400).json({ error: error.message }); }
  });

  app.get('/api/v3/inventory/dashboard', async (req, res) => {
    try {
      const branchId = req.query.branchId ? id(req.query.branchId, 'Branch') : null;
      if (branchId) {
        const result = await db().query(`SELECT COUNT(*)::BIGINT AS total_products,COALESCE(SUM(sq.total_units),0) AS total_units,COUNT(*) FILTER(WHERE COALESCE(sq.total_units,0)=0)::BIGINT AS out_of_stock_items,COUNT(*) FILTER(WHERE COALESCE(sq.total_units,0)>0 AND COALESCE(sq.total_units,0)<=p.reorder_level)::BIGINT AS low_stock_items,COALESCE(SUM(sq.total_units*p.cost_price),0) AS inventory_cost_value,COALESCE(MAX(sq.updated_at),MAX(p.updated_at)) AS last_updated FROM inventory_products_v2 p LEFT JOIN (SELECT product_id,SUM(quantity_on_hand) AS total_units,MAX(updated_at) AS updated_at FROM inventory_stock_v2 WHERE branch_id=$1 GROUP BY product_id) sq ON sq.product_id=p.id WHERE p.is_active=TRUE`, [branchId]);
        return res.set('Cache-Control','no-store').json({ ...result.rows[0], branch_id: branchId });
      }
      const result = await db().query(`SELECT COUNT(*)::BIGINT AS total_products,COALESCE(SUM(sq.total_units),0) AS total_units,COUNT(*) FILTER(WHERE COALESCE(sq.total_units,0)=0)::BIGINT AS out_of_stock_items,COUNT(*) FILTER(WHERE COALESCE(sq.total_units,0)>0 AND COALESCE(sq.total_units,0)<=p.reorder_level)::BIGINT AS low_stock_items,COALESCE(SUM(sq.total_units*p.cost_price),0) AS inventory_cost_value,COALESCE(MAX(sq.updated_at),MAX(p.updated_at)) AS last_updated FROM inventory_products_v2 p LEFT JOIN (SELECT product_id,SUM(quantity_on_hand) AS total_units,MAX(updated_at) AS updated_at FROM inventory_stock_v2 GROUP BY product_id) sq ON sq.product_id=p.id WHERE p.is_active=TRUE`);
      res.set('Cache-Control','no-store').json({ ...result.rows[0], branch_id: null });
    } catch (error) { console.error('[inventory-core] dashboard failed', error); res.status(400).json({ error: error.message }); }
  });

  app.post('/api/v3/inventory/products', async (req, res) => {
    const b = req.body || {};
    const name = text(b.name);
    if (!name) return res.status(400).json({ error: 'Product name is required.' });
    try {
      const product = await tx(async client => {
        const openingInput = firstDefined(b, ['openingStock', 'opening_stock', 'currentStock', 'current_stock', 'initialStock', 'initial_stock', 'quantity', 'quantityOnHand', 'quantity_on_hand']);
        const openingStock = optionalAmount(openingInput, 'opening stock') ?? 0;
        let branchId = b.branchId ? id(b.branchId, 'Branch') : (b.branch_id ? id(b.branch_id, 'Branch') : null);
        if (!branchId) {
          const branch = await client.query(`SELECT id FROM branches WHERE is_active=TRUE ORDER BY CASE WHEN code='MAIN' OR lower(trim(name))='main branch' THEN 0 ELSE 1 END,id LIMIT 1`);
          if (!branch.rowCount) throw new Error('No active branch is available for opening stock.');
          branchId = branch.rows[0].id;
        }
        const identifiers = await allocateProductIdentifiers(client, { sku: text(b.sku), barcode: text(b.barcode) || null, category: text(b.category) || null });
        const posEnabled = b.posEnabled === undefined && b.pos_enabled === undefined ? true : !(b.posEnabled === false || b.pos_enabled === false || text(b.posEnabled || b.pos_enabled).toLowerCase() === 'false');
        const result = await client.query(`INSERT INTO inventory_products_v2(sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description,pos_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [identifiers.sku, identifiers.barcode, name, text(b.category) || null, text(b.brand) || null, text(b.unit) || null, Number(b.costPrice ?? b.cost_price) || 0, Number(b.sellingPrice ?? b.selling_price) || 0, Number(b.vatRate ?? b.vat_rate) || 0, Number(b.reorderLevel ?? b.reorder_level) || 0, text(b.supplier) || null, text(b.description) || null, posEnabled]);
        const product = result.rows[0];
        await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) SELECT $1,id,CASE WHEN id=$2 THEN $3 ELSE 0 END FROM branches WHERE is_active=TRUE ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=CASE WHEN inventory_stock_v2.quantity_on_hand=0 AND EXCLUDED.branch_id=$2 THEN EXCLUDED.quantity_on_hand ELSE inventory_stock_v2.quantity_on_hand END,updated_at=NOW()`, [product.id, branchId, openingStock]);
        if (openingStock > 0) await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,'opening_balance',$3,'Initial stock on product creation',$4)`, [product.id, branchId, openingStock, req.user?.id || null]);
        return { ...product, quantity_on_hand: openingStock, branch_id: branchId };
      });
      res.status(201).json({ product });
    } catch (error) { res.status(error.code==='23505'?409:400).json({ error: error.code==='23505'?'SKU or barcode already exists.':error.message }); }
  });

  async function changeStock(req, res, type) {
    try {
      const b=req.body||{};
      const productId=id(b.productId,'Product');
      const branchId=id(b.branchId,'Branch');
      const quantity=amount(type==='adjust'?b.quantityDelta:b.quantity, type==='adjust'?'quantity adjustment':'quantity', type==='adjust');
      if (quantity===0) throw new Error('Quantity must not be zero.');
      const result=await tx(async client=>{
        const exists=await client.query('SELECT id FROM inventory_products_v2 WHERE id=$1 AND is_active=TRUE',[productId]);
        if(!exists.rowCount) throw new Error('Product not found.');
        const current=await client.query('SELECT quantity_on_hand FROM inventory_stock_v2 WHERE product_id=$1 AND branch_id=$2 FOR UPDATE',[productId,branchId]);
        const before=Number(current.rows[0]?.quantity_on_hand||0);
        const after=type==='opening'?quantity:before+quantity;
        if(after<0) throw new Error('Stock cannot become negative.');
        await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`,[productId,branchId,after]);
        const delta=after-before;
        await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,$3,$4,$5,$6)`,[productId,branchId,type==='receive'?'stock_receive':type==='opening'?'opening_balance':type==='adjust'?'adjustment':'unknown',delta,req.user?.id||null]);
        return { before, after };
      });
      res.status(201).json(result);
    } catch(error) { res.status(400).json({ error:error.message }); }
  }
  app.post('/api/v3/inventory/stock/receive',(req,res)=>changeStock(req,res,'receive'));
  app.post('/api/v3/inventory/stock/opening',(req,res)=>changeStock(req,res,'opening'));
  app.post('/api/v3/inventory/stock/adjust',(req,res)=>changeStock(req,res,'adjust'));

  app.get('/api/v3/inventory/movements', async (req,res) => {
    try {
      const params=[]; const where=[];
      if(req.query.productId){params.push(id(req.query.productId,'Product'));where.push(`product_id=$${params.length}`);}
      if(req.query.branchId){params.push(id(req.query.branchId,'Branch'));where.push(`branch_id=$${params.length}`);}
      const result=await db().query(`SELECT * FROM inventory_movements_v2 ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`,params);
      res.set('Cache-Control','no-store').json({ movements:result.rows });
    } catch(error){res.status(400).json({error:error.message});}
  });
  console.log('[inventory-core] single authoritative inventory API mounted');
}
module.exports={mountInventoryCore};
