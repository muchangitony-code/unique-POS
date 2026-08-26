'use strict';

// Injects the fresh Bulk Import V2 API and health endpoint into the generated
// runtime. Keep all local module resolution anchored to the runtime bundle's
// directory so the generated bundle works both from Railway and cPanel.
function patchBulkImportRoutes(source) {
  if (source.includes('BULK_IMPORT_V2_PATCH')) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
    || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
  if (!expressMatch) throw new Error('Bulk import: Express app not found');

  const appVar = expressMatch[1];
  const appStatementEnd = source.indexOf('\n', expressMatch.index);
  if (appStatementEnd < 0) throw new Error('Bulk import: Express application declaration is incomplete');

  const code = [
    '// BULK_IMPORT_V2_PATCH',
    '(function installFreshBulkImport(){',
    "  const path = require('node:path');",
    "  const { Pool } = require('pg');",
    "  const databaseUrlModule = require(path.join(__dirname, 'scripts', 'database-url.cjs'));",
    "  const { createBulkImportV2Router } = require(path.join(__dirname, 'server', 'bulk-import-v2-router.cjs'));",
    '  let bulkPool;',
    '  const getBulkPool = () => {',
    '    if (!bulkPool) { const { databaseUrl } = databaseUrlModule.parseAndValidateDatabaseUrl("bulk-import-v2"); bulkPool = new Pool({ connectionString: databaseUrl, ssl: databaseUrlModule.railwaySsl(databaseUrl), max: 5 }); }',
    '    return bulkPool;',
    '  };',
    `  ${appVar}.get('/api/healthz', (_req,res) => res.status(200).json({ ok:true, service:'unique-pos' }));`,
    `  ${appVar}.use(require('express').json({ limit:'25mb' }));`,
    // Resolve requireAuth lazily. The generated bundle may declare it after
    // the Express app; evaluating the identifier during module initialization
    // would otherwise trigger a temporal-dead-zone failure.
    `  const bulkImportAuth = (req,res,next) => requireAuth(req,res,next);`,
    `  ${appVar}.use(createBulkImportV2Router({ Router: require('express').Router, pool: getBulkPool(), requireAuth: bulkImportAuth }));`,
    '  console.log("[bulk-import-v2] fresh importer and /api/healthz mounted");',
    '})();',
    ''
  ].join('\n');

  return source.slice(0, appStatementEnd + 1) + code + source.slice(appStatementEnd + 1);
}

module.exports = { patchBulkImportRoutes };
