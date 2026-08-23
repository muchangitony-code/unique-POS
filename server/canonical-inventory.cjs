const express = require('express');
const router = express.Router();
const { pool } = require('./db');

router.get('/api/canonical/products', async (req,res)=>{
  const q=String(req.query.q||'').trim(); const p=[]; let where='WHERE p.active=TRUE';
  if(q){p.push(`%${q}%`);where+=` AND (p.name ILIKE $${p.length} OR p.sku ILIKE $${p.length})`;}
  const r=await pool.query(`SELECT p.id,p.name,p.sku,p.price,p.category,p.active,i.quantity_on_hand,i.reserved_quantity,i.reorder_threshold,(i.quantity_on_hand-i.reserved_quantity) AS available_quantity FROM products_canonical p JOIN inventory_canonical i ON i.product_id=p.id ${where} ORDER BY p.name`,p);
  res.json({products:r.rows});
});

router.post('/api/canonical/products', async(req,res)=>{
  const b=req.body||{}; if(!String(b.name||'').trim()||!String(b.sku||'').trim()) return res.status(400).json({error:'name and sku are required'});
  const c=await pool.connect();
  try{await c.query('BEGIN'); const r=await c.query('SELECT * FROM public.create_canonical_product_with_inventory($1,$2,$3,$4,$5)',[b.name,b.sku,Number(b.price||0),b.category,Number(b.initialQuantity||0)]); await c.query('COMMIT'); res.status(201).json({product:r.rows[0]});}
  catch(e){await c.query('ROLLBACK');res.status(e.code==='23505'?409:400).json({error:e.code==='23505'?'SKU already exists':e.message});} finally{c.release();}
});

router.patch('/api/canonical/products/:id', async(req,res)=>{
  const id=Number(req.params.id), b=req.body||{}; if(!Number.isInteger(id)) return res.status(400).json({error:'invalid id'});
  const allowed={name:'name',sku:'sku',price:'price',category:'category',active:'active'}; const sets=[],vals=[];
  for(const [k,col] of Object.entries(allowed)) if(b[k]!==undefined){vals.push(k==='price'?Number(b[k]):b[k]);sets.push(`${col}=$${vals.length}`);}
  if(!sets.length)return res.status(400).json({error:'no changes'}); vals.push(id);
  try{const r=await pool.query(`UPDATE products_canonical SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,vals);if(!r.rowCount)return res.status(404).json({error:'product not found'});res.json({product:r.rows[0]});}catch(e){res.status(e.code==='23505'?409:400).json({error:e.code==='23505'?'SKU already exists':e.message});}
});

router.delete('/api/canonical/products/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({error:'invalid id'});const r=await pool.query('DELETE FROM products_canonical WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)return res.status(404).json({error:'product not found'});res.json({deleted:r.rows[0].id});});

router.post('/api/canonical/inventory/adjust',async(req,res)=>{const b=req.body||{},id=Number(b.productId),delta=Number(b.delta);if(!Number.isInteger(id)||!Number.isFinite(delta)||delta===0)return res.status(400).json({error:'productId and non-zero delta required'});const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query(`UPDATE inventory_canonical SET quantity_on_hand=quantity_on_hand+$1,updated_at=NOW() WHERE product_id=$2 AND quantity_on_hand+$1>=0 RETURNING *`,[delta,id]);if(!r.rowCount)throw new Error('Product not found or stock cannot become negative');await c.query('COMMIT');res.json({inventory:r.rows[0]});}catch(e){await c.query('ROLLBACK');res.status(400).json({error:e.message});}finally{c.release();}});

module.exports=router;
