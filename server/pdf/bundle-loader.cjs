'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const RUNTIME_MOUNT_MARKER = 'UNIQUEPOS_RUNTIME_MOUNTS_V7';
function findExpressAppDeclaration(source) {
  const patterns = [/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)\s*;?/m,/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)\s*;?/m];
  for (const pattern of patterns) { const match = pattern.exec(source); if (match) return { appVar: match[1], end: match.index + match[0].length }; }
  return null;
}
function prepareRuntimeSource(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  if (source.includes(RUNTIME_MOUNT_MARKER)) return source;
  const declaration = findExpressAppDeclaration(source);
  if (!declaration) throw new Error('Runtime integration: Express application declaration not found.');
  const { appVar, end } = declaration;
  const code = `\n/* ${RUNTIME_MOUNT_MARKER} */\n(() => {\n  const { mountInventoryV3BranchRoutes } = require('./server/inventory-v3-branch-routes.cjs');\n  const { mountInventoryV3 } = require('./server/inventory-v3.cjs');\n  const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');\n  const { registerBulkImportV2Routes } = require('./server/bulk-import-v2-router.cjs');\n  // Do not require express here: the production bundle may include Express without\n  // exposing it as an installable top-level module. Parse JSON for injected routes directly.\n  ${appVar}.use((req, res, next) => {\n    if (req.body !== undefined || !['POST','PUT','PATCH'].includes(req.method)) return next();\n    const type = String(req.headers['content-type'] || '').toLowerCase();\n    if (!type.includes('application/json')) return next();\n    let raw = '';\n    req.setEncoding('utf8');\n    req.on('data', chunk => { raw += chunk; if (raw.length > 10485760) { res.status(413).json({ error: 'Request too large' }); req.destroy(); } });\n    req.on('end', () => {\n      if (res.headersSent) return;\n      try { req.body = raw ? JSON.parse(raw) : {}; next(); }\n      catch (_err) { res.status(400).json({ error: 'Invalid JSON request body' }); }\n    });\n    req.on('error', next);\n  });\n  let bulkImportPool;\n  const getBulkImportPool = () => {\n    if (!bulkImportPool) {\n      const { Pool: PgPool } = require('pg');\n      const { databaseUrl } = parseAndValidateDatabaseUrl('bulk-import-v2');\n      bulkImportPool = new PgPool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 5 });\n    }\n    return bulkImportPool;\n  };\n  ${appVar}.get('/api/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'unique-pos' }));\n  mountInventoryV3BranchRoutes(${appVar});\n  mountInventoryV3(${appVar});\n  registerBulkImportV2Routes({ app: ${appVar}, pool: getBulkImportPool(), requireAuth: typeof requireAuth === 'function' ? requireAuth : undefined });\n})();\n`;
  return source.slice(0, end) + code + source.slice(end);
}
function loadIndex() {
  const filename = path.join(__dirname, '..', '..', 'index.runtime.cjs');
  const source = prepareRuntimeSource(filename);
  if (source === fs.readFileSync(filename, 'utf8')) return require(filename);
  const runtimeModule = new Module(filename, module);
  runtimeModule.filename = filename;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(filename));
  runtimeModule._compile(source, filename);
  return runtimeModule.exports;
}
module.exports = { loadIndex, prepareRuntimeSource };