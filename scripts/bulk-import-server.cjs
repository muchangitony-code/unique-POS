'use strict';

// Injects the fresh Bulk Import V2 API and a lightweight health endpoint into
// the generated Express runtime. The runtime bundle does not necessarily own
// the HTTP listen call, so this patch is mounted immediately after the Express
// application is created instead of searching for app.listen().
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
    "  const { Pool } = require('pg');",
    "  const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');",
    "  const { createBulkImportV2Router } = require('./server/bulk-import-v2-router.cjs');",
    '  let bulkPool;',
    '  const getBulkPool = () => {',
    '    if (!bulkPool) { const { databaseUrl } = parseAndValidateDatabaseUrl("bulk-import-v2"); bulkPool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 5 }); }',
    '    return bulkPool;',
    '  };',
    `  ${appVar}.get('/api/healthz', (_req,res) => res.status(200).json({ ok:true, service:'unique-pos' }));`,
    `  ${appVar}.use(require('express').json({ limit:'25mb' }));`,
    `  ${appVar}.use(createBulkImportV2Router({ Router: require('express').Router, pool: getBulkPool(), requireAuth }));`,
    '  console.log("[bulk-import-v2] fresh importer and /api/healthz mounted");',
    '})();',
    ''
  ].join('\n');

  return source.slice(0, appStatementEnd + 1) + code + source.slice(appStatementEnd + 1);
}

module.exports = { patchBulkImportRoutes };
