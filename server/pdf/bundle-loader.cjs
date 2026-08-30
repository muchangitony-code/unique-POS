'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const RUNTIME_MOUNT_MARKER = 'UNIQUEPOS_RUNTIME_MOUNTS_CLEAN_V1';
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
  const code = `\n/* ${RUNTIME_MOUNT_MARKER} */\n(() => {\n  const { mountInventoryCore } = require('./server/inventory-core.cjs');\n  const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');\n  const { registerBulkImportV2Routes } = require('./server/bulk-import-v2-router.cjs');\n  ${appVar}.use((req, res, next) => {\n    if (req.body !== undefined || !['POST','PUT','PATCH'].includes(req.method)) return next();\n    const type = String(req.headers['content-type'] || '').toLowerCase();\n    if (!type.includes('application/json')) return next();\n    let raw = '';\n    req.setEncoding('utf8');\n    req.on('data', chunk => { raw += chunk; if (raw.length > 10485760) { res.status(413).json({ error: 'Request too large' }); req.destroy(); } });\n    req.on('end', () => { if (res.headersSent) return; try { req.body = raw ? JSON.parse(raw) : {}; next(); } catch (_err) { res.status(400).json({ error: 'Invalid JSON request body' }); } });\n    req.on('error', next);\n  });\n  let bulkImportPool;\n  const getBulkImportPool = () => {\n    if (!bulkImportPool) { const { Pool: PgPool } = require('pg'); const { databaseUrl } = parseAndValidateDatabaseUrl('bulk-import-v2'); bulkImportPool = new PgPool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 5 }); }\n    return bulkImportPool;\n  };\n  ${appVar}.get('/api/healthz', (_req, res) => res.status(200).json({ status: 'ok', ok: true, service: 'unique-pos' }));\n  mountInventoryCore(${appVar});\n  registerBulkImportV2Routes({ app: ${appVar}, pool: getBulkImportPool(), requireAuth: typeof requireAuth === 'function' ? requireAuth : undefined });\n})();\n`;
  return source.slice(0, end) + code + source.slice(end);
}
function loadIndex() {
  const runtimeFilename = path.join(__dirname, '..', '..', 'index.runtime.cjs');
  const sourceFilename = fs.existsSync(runtimeFilename) ? runtimeFilename : path.join(__dirname, '..', '..', 'index.cjs');
  const source = prepareRuntimeSource(sourceFilename);
  if (source === fs.readFileSync(sourceFilename, 'utf8')) return require(sourceFilename);
  const runtimeModule = new Module(sourceFilename, module);
  runtimeModule.filename = sourceFilename;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(sourceFilename));
  runtimeModule._compile(source, sourceFilename);
  return runtimeModule.exports;
}
module.exports = { loadIndex, prepareRuntimeSource };
