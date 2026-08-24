'use strict';

const fs = require('node:fs');
const path = require('node:path');

function patchBranchScopedInventoryCatalogue(source) {
  if (source.includes('[inventory-v3] branch-scoped catalogue installed')) return source;

  const old = `  app.get('/api/v3/inventory/products', async (req, res) => {
    try {
      const q = text(req.query.q);
      const params = [];
      let where = 'p.is_active = TRUE';
      if (q) {
        params.push(\`%${q}%\`);
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
        params.push(\`%${q}%\`);
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

  if (!source.includes(old)) throw new Error('Inventory v3 branch patch: catalogue route source not found');
  return source.replace(old, replacement) + `\n// [inventory-v3] branch-scoped catalogue installed\n`;
}

function patchRuntimeBundle() {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'index.runtime.cjs');
  let source = fs.readFileSync(file, 'utf8');
  source = patchBranchScopedInventoryCatalogue(source);
  if (source.includes('[inventory-v3] isolated inventory API mounted')) return fs.writeFileSync(file, source, 'utf8');

  const listen = source.match(/\\b([A-Za-z_$][\\w$]*)\\.listen\\s*\\(/);
  if (!listen) throw new Error('Inventory v3 patch: Express listen point not found');
  const appName = listen[1];
  const injection = `\\nrequire('./server/inventory-v3.cjs').mountInventoryV3(${appName});\\n`;
  source = source.slice(0, listen.index) + injection + source.slice(listen.index);
  fs.writeFileSync(file, source, 'utf8');
  console.log('[inventory-v3-patch] branch-scoped inventory API mounted');
}

module.exports = { patchRuntimeBundle };
