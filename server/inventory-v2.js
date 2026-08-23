import express from 'express';
import { pool } from './db.js';

const router = express.Router();

function cleanText(v) { return String(v ?? '').trim(); }
function money(v) { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error('Invalid price'); return n; }
function qty(v) { const n = Number(v); if (!Number.isFinite(n)) throw new Error('Invalid quantity'); return n; }

router.get('/api/v2/inventory/products', async (req, res) => {
  const q = cleanText(req.query.q);
  const branchId = Number(req.query.branchId || 0);
  const params = [];
  const where = ['p.is_active = TRUE'];
  if (q) { params.push(`%${q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`); }
  if (branchId) { params.push(branchId); where.push(`s.branch_id = $${params.length}`); }
  const result = await pool.query(`
    SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
           p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
           COALESCE(s.quantity_on_hand,0) AS quantity_on_hand
    FROM inventory_products_v2 p
    LEFT JOIN inventory_stock_v2 s ON s.product_id = p.id ${branchId ? '' : ''}
    WHERE ${where.join(' AND ')}
    ORDER BY p.name ASC
  `, params);
  res.json({ products: result.rows });
});

router.post('/api/v2/inventory/products', async (req, res) => {
  const b = req.body || {};
  const sku = cleanText(b.sku); const name = cleanText(b.name);
  if (!sku || !name) return res.status(400).json({ error: 'SKU and product name are required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`INSERT INTO inventory_products_v2
      (sku, barcode, name, category, brand, unit, cost_price, selling_price, vat_rate, reorder_level, supplier, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [sku, cleanText(b.barcode) || null, name, cleanText(b.category) || null, cleanText(b.brand) || null,
       cleanText(b.unit) || 'pcs', money(b.costPrice), money(b.sellingPrice), Number(b.vatRate || 0), qty(b.reorderLevel || 0), cleanText(b.supplier) || null, cleanText(b.description) || null]);
    await client.query('COMMIT');
    res.status(201).json({ product: r.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ error: 'SKU or barcode already exists' }); res.status(400).json({ error: e.message }); }
  finally { client.release(); }
});

router.patch('/api/v2/inventory/products/:id', async (req, res) => {
  const id = Number(req.params.id); const b = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });
  const fields = []; const values = [];
  const add = (column, value) => { values.push(value); fields.push(`${column}=$${values.length}`); };
  if (b.sku !== undefined) add('sku', cleanText(b.sku));
  if (b.barcode !== undefined) add('barcode', cleanText(b.barcode) || null);
  if (b.name !== undefined) add('name', cleanText(b.name));
  if (b.category !== undefined) add('category', cleanText(b.category) || null);
  if (b.brand !== undefined) add('brand', cleanText(b.brand) || null);
  if (b.unit !== undefined) add('unit', cleanText(b.unit) || 'pcs');
  if (b.costPrice !== undefined) add('cost_price', money(b.costPrice));
  if (b.sellingPrice !== undefined) add('selling_price', money(b.sellingPrice));
  if (b.vatRate !== undefined) add('vat_rate', Number(b.vatRate));
  if (b.reorderLevel !== undefined) add('reorder_level', qty(b.reorderLevel));
  if (b.supplier !== undefined) add('supplier', cleanText(b.supplier) || null);
  if (b.description !== undefined) add('description', cleanText(b.description) || null);
  if (b.isActive !== undefined) add('is_active', Boolean(b.isActive));
  if (!fields.length) return res.status(400).json({ error: 'No changes supplied' });
  values.push(id);
  try { const r = await pool.query(`UPDATE inventory_products_v2 SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values); if (!r.rowCount) return res.status(404).json({ error: 'Product not found' }); res.json({ product: r.rows[0] }); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'SKU or barcode already exists' }); res.status(400).json({ error: e.message }); }
});

router.post('/api/v2/inventory/stock-adjustments', async (req, res) => {
  const b = req.body || {}; const productId = Number(b.productId); const branchId = Number(b.branchId); const delta = qty(b.quantityDelta);
  if (!Number.isInteger(productId) || !Number.isInteger(branchId) || delta === 0) return res.status(400).json({ error: 'productId, branchId and non-zero quantityDelta are required' });
  const type = delta > 0 ? 'adjustment_in' : 'adjustment_out';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3)
      ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=inventory_stock_v2.quantity_on_hand+$3,updated_at=NOW()`, [productId, branchId, delta]);
    const r = await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [productId,branchId,type,delta,cleanText(b.reason)||'Manual stock adjustment',b.userId||null]);
    await client.query('COMMIT'); res.status(201).json({ movement: r.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); res.status(400).json({ error: e.message }); } finally { client.release(); }
});

router.get('/api/v2/inventory/movements', async (req, res) => {
  const productId = Number(req.query.productId || 0); const branchId = Number(req.query.branchId || 0); const params=[]; const where=[];
  if(productId){params.push(productId);where.push(`m.product_id=$${params.length}`);} if(branchId){params.push(branchId);where.push(`m.branch_id=$${params.length}`);}
  const r=await pool.query(`SELECT m.* FROM inventory_movements_v2 m ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY m.created_at DESC LIMIT 500`,params); res.json({movements:r.rows});
});

export default router;
