'use strict';
const { importRows, parseFile, buildPreview } = require('./bulk-import-v2.cjs');

// Canonical admin role is `administrator`; `admin` is retained for compatibility
// with older user records that may still carry that role value.
const AUTHORIZED_IMPORT_ROLES = new Set([
  'super_admin',
  'business_owner',
  'administrator',
  'admin',
  'branch_manager',
  'inventory_manager'
]);

function normalizedRole(req) {
  return String(req?.user?.role || '').trim().toLowerCase();
}

function isAuthorizedImportUser(req) {
  return AUTHORIZED_IMPORT_ROLES.has(normalizedRole(req));
}

function authorizeBulkImport(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isAuthorizedImportUser(req)) {
    return res.status(403).json({ error: 'Bulk import is restricted to authorized inventory users.' });
  }
  return next();
}

// Some deployments of UniquePOS do not install Express's JSON body parser before
// the runtime-mounted V2 routes. In that case req.body is undefined even though
// the browser correctly sends application/json. Read the request body here as a
// safe fallback so the upload cannot fail with the misleading "No catalogue file
// was supplied" message.
async function getRequestBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (!req || typeof req.on !== 'function') return {};

  const chunks = [];
  let size = 0;
  const MAX_BODY_BYTES = 100 * 1024 * 1024;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Catalogue upload is too large. Maximum upload size is 100 MB.');
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid upload request. Please select the Excel/CSV file again and retry.');
  }
}

function registerBulkImportV2Routes({ app, pool, requireAuth }) {
  if (!app || !pool) throw new Error('Bulk Import V2 requires application and database pool');
  if (app.__bulkImportV2Mounted) return app;
  app.__bulkImportV2Mounted = true;
  if (typeof requireAuth !== 'function') {
    throw new Error('Bulk Import V2 requires the application authentication middleware.');
  }

  app.post('/api/v2/products/bulk-import/preview', requireAuth, authorizeBulkImport, async (req, res) => {
    try {
      const body = await getRequestBody(req);
      const fileName = String(body?.file_name || 'catalog.csv');
      const encoded = String(body?.file_base64 || '');
      if (!encoded) return res.status(400).json({ error: 'No catalogue file was supplied.' });
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'The catalogue file is empty.' });
      const preview = buildPreview(await parseFile(buffer, fileName));
      if (!preview.total) return res.status(400).json({ error: 'The catalogue contains no product rows.' });
      return res.json({ ok: true, ...preview });
    } catch (error) {
      console.error('[bulk-import-v2] preview failed', error);
      return res.status(400).json({ error: error.message || 'Unable to preview catalogue.' });
    }
  });

  app.post('/api/v2/products/bulk-import', requireAuth, authorizeBulkImport, async (req, res) => {
    try {
      const body = await getRequestBody(req);
      const branchId = Number(body?.branch_id);
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!Number.isInteger(branchId) || branchId <= 0) return res.status(400).json({ error: 'A valid branch is required.' });
      if (!rows.length) return res.status(400).json({ error: 'No valid product rows were supplied.' });
      return res.json({ ok: true, ...await importRows({ pool, rows, branchId, userId: req.user?.id ?? req.user?.userId ?? null }) });
    } catch (error) {
      console.error('[bulk-import-v2]', error);
      return res.status(400).json({ error: error.message || 'Bulk import failed.' });
    }
  });
  return app;
}

// Compatibility export for unit tests; no Express package import is required.
function createBulkImportV2Router({ Router, pool, requireAuth }) {
  if (!Router || !pool) throw new Error('Bulk Import V2 requires Router and database pool');
  if (typeof requireAuth !== 'function') throw new Error('Bulk Import V2 requires the application authentication middleware.');
  const router = Router();

  router.post('/api/v2/products/bulk-import/preview', requireAuth, authorizeBulkImport, async (req, res) => {
    try {
      const body = await getRequestBody(req);
      const fileName = String(body?.file_name || 'catalog.csv');
      const encoded = String(body?.file_base64 || '');
      if (!encoded) return res.status(400).json({ error: 'No catalogue file was supplied.' });
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'The catalogue file is empty.' });
      const preview = buildPreview(await parseFile(buffer, fileName));
      if (!preview.total) return res.status(400).json({ error: 'The catalogue contains no product rows.' });
      return res.json({ ok: true, ...preview });
    } catch (error) {
      console.error('[bulk-import-v2] preview failed', error);
      return res.status(400).json({ error: error.message || 'Unable to preview catalogue.' });
    }
  });

  router.post('/api/v2/products/bulk-import', requireAuth, authorizeBulkImport, async (req, res) => {
    try {
      const body = await getRequestBody(req);
      const branchId = Number(body?.branch_id);
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!Number.isInteger(branchId) || branchId <= 0) return res.status(400).json({ error: 'A valid branch is required.' });
      if (!rows.length) return res.status(400).json({ error: 'No valid product rows were supplied.' });
      return res.json({ ok: true, ...await importRows({ pool, rows, branchId, userId: req.user?.id ?? req.user?.userId ?? null }) });
    } catch (error) {
      console.error('[bulk-import-v2]', error);
      return res.status(400).json({ error: error.message || 'Bulk import failed.' });
    }
  });
  return router;
}

module.exports = {
  AUTHORIZED_IMPORT_ROLES,
  normalizedRole,
  isAuthorizedImportUser,
  authorizeBulkImport,
  getRequestBody,
  registerBulkImportV2Routes,
  createBulkImportV2Router
};
