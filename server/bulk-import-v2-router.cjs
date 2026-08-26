'use strict';

const { importRows } = require('./bulk-import-v2.cjs');

function createBulkImportV2Router({ Router, pool, requireAuth }) {
  if (!Router || !pool) throw new Error('Bulk Import V2 requires Router and database pool');
  const router = Router();

  router.post('/api/v2/products/bulk-import', requireAuth || ((req,res,next)=>next()), async (req,res) => {
    try {
      const role = req.user?.role;
      if (!['super_admin','business_owner','branch_manager','inventory_manager'].includes(role)) {
        return res.status(403).json({ error: 'Bulk import is restricted to authorized inventory users.' });
      }
      const branchId = Number(req.body?.branch_id);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!Number.isInteger(branchId) || branchId <= 0) return res.status(400).json({ error: 'A valid branch is required.' });
      if (!rows.length) return res.status(400).json({ error: 'No valid product rows were supplied.' });
      const result = await importRows({ pool, rows, branchId, userId: req.user?.id || null });
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[bulk-import-v2]', error);
      return res.status(400).json({ error: error.message || 'Bulk import failed.' });
    }
  });

  return router;
}

module.exports = { createBulkImportV2Router };
