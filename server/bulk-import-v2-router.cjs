'use strict';

const { importRows, parseFile, buildPreview } = require('./bulk-import-v2.cjs');

function createBulkImportV2Router({ Router, pool, requireAuth }) {
  if (!Router || !pool) throw new Error('Bulk Import V2 requires Router and database pool');
  const router = Router();
  const auth = requireAuth || ((req, res, next) => next());
  const allowedRoles = ['super_admin', 'business_owner', 'branch_manager', 'inventory_manager'];

  router.post('/api/v2/products/bulk-import/preview', auth, async (req, res) => {
    try {
      if (!allowedRoles.includes(req.user?.role)) return res.status(403).json({ error: 'Bulk import is restricted to authorized inventory users.' });
      const fileName = String(req.body?.file_name || 'catalog.csv');
      const encoded = String(req.body?.file_base64 || '');
      if (!encoded) return res.status(400).json({ error: 'No catalogue file was supplied.' });
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'The catalogue file is empty.' });
      const matrix = await parseFile(buffer, fileName);
      const preview = buildPreview(matrix);
      if (!preview.total) return res.status(400).json({ error: 'The catalogue contains no product rows.' });
      return res.json({ ok: true, ...preview });
    } catch (error) {
      console.error('[bulk-import-v2] preview failed', error);
      return res.status(400).json({ error: error.message || 'Unable to preview catalogue.' });
    }
  });

  router.post('/api/v2/products/bulk-import', auth, async (req, res) => {
    try {
      if (!allowedRoles.includes(req.user?.role)) return res.status(403).json({ error: 'Bulk import is restricted to authorized inventory users.' });
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