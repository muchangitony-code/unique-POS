'use strict';

// This module is intentionally build-time only.  It must never mutate the
// runtime bundle while app.js is starting; startup-time source rewriting was
// the cause of the recurring ReferenceError/patchRuntimeBundle failures.

function patchBranchScopedInventoryCatalogue(source) {
  if (source.includes('[inventory-v3] branch-scoped catalogue installed')) return source;

  const old = `  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const q = text(req.query.q);
      const params = [];
      let where = 'p.is_active = TRUE';
      if (q) {
        params.push(\`%\${q}%\`);
        where += \` AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR COALESCE(p.barcode,'') ILIKE $1)\`;
      }
      const result = await db().query(\`
        SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
               p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
               COALESCE(SUM(s.quantity_on_hand), 0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s ON s.product_id = p.id
        WHERE \${where}
        GROUP BY p.id
        ORDER BY p.name ASC
      \`, params);
      res.set('Cache-Control', 'no-store').json({ products: result.rows });
    } catch (error) {
      console.error('[inventory-v3] list failed', error);
      res.status(500).json({ error: 'Unable to load inventory.' });
    }
  });`;

  const replacement = `  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const q = text(req.query.q);
      const branchId = Number(req.query.branchId || 0);
      if (!Number.isInteger(branchId) || branchId <= 0) {
        return res.status(400).json({ error: 'A valid branchId is required for inventory catalogue requests.' });
      }
      const params = [branchId];
      let where = 'p.is_active = TRUE';
      if (q) {
        params.push(\`%\${q}%\`);
        where += \` AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.barcode,'') ILIKE $2)\`;
      }
      const result = await db().query(\`
        SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.unit,
               p.cost_price, p.selling_price, p.vat_rate, p.reorder_level,
               COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand
        FROM inventory_products_v2 p
        LEFT JOIN inventory_stock_v2 s
          ON s.product_id = p.id AND s.branch_id = $1
        WHERE \${where}
        ORDER BY p.name ASC
      \`, params);
      res.set('Cache-Control', 'no-store').json({ products: result.rows, branch_id: branchId });
    } catch (error) {
      console.error('[inventory-v3] list failed', error);
      res.status(500).json({ error: 'Unable to load inventory.' });
    }
  });`;

  if (!source.includes(old)) throw new Error('Inventory v3 build patch: catalogue route source not found');
  return source.replace(old, replacement) + '\n// [inventory-v3] branch-scoped catalogue installed\n';
}

module.exports = { patchBranchScopedInventoryCatalogue };
