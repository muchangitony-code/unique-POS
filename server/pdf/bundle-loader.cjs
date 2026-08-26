'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const INVENTORY_MOUNT_MARKER = 'UNIQUEPOS_INVENTORY_V3_MOUNT_V3';
const BULK_IMPORT_MOUNT_MARKER = 'UNIQUEPOS_BULK_IMPORT_V2_MOUNT_V2';

function prepareRuntimeSource(filename) {
  let source = fs.readFileSync(filename, 'utf8');
  const injections = [];

  if (!source.includes(INVENTORY_MOUNT_MARKER)) {
    const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
      || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
    if (!expressMatch) throw new Error('Inventory V3 integration: Express application not found in runtime bundle.');
    const appVar = expressMatch[1];
    const appStatementEnd = source.indexOf('\n', expressMatch.index);
    if (appStatementEnd < 0) throw new Error('Inventory V3 integration: Express application declaration is incomplete.');
    injections.push({ index: appStatementEnd + 1, code: [
      `// ${INVENTORY_MOUNT_MARKER}`,
      "const { mountInventoryV3BranchRoutes } = require('./server/inventory-v3-branch-routes.cjs');",
      "const { mountInventoryV3 } = require('./server/inventory-v3.cjs');",
      `mountInventoryV3BranchRoutes(${appVar});`,
      `mountInventoryV3(${appVar});`,
      ''
    ].join('\n') });
  }

  if (!source.includes(BULK_IMPORT_MOUNT_MARKER)) {
    const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
      || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
    if (!expressMatch) throw new Error('Bulk Import V2 integration: Express application not found in runtime bundle.');
    const appVar = expressMatch[1];
    const appStatementEnd = source.indexOf('\n', expressMatch.index);
    if (appStatementEnd < 0) throw new Error('Bulk Import V2 integration: Express application declaration is incomplete.');
    injections.push({ index: appStatementEnd + 1, code: [
      `// ${BULK_IMPORT_MOUNT_MARKER}`,
      "const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');",
      "const { registerBulkImportV2Routes } = require('./server/bulk-import-v2-router.cjs');",
      'let __bulkImportV2Pool;',
      'function __getBulkImportV2Pool() {',
      "  if (!__bulkImportV2Pool) { const { Pool: BulkImportPool } = require('pg'); const { databaseUrl } = parseAndValidateDatabaseUrl('bulk-import-v2'); __bulkImportV2Pool = new BulkImportPool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 5 }); }",
      '  return __bulkImportV2Pool;',
      `${appVar}.get('/api/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'unique-pos' }));`,
      `registerBulkImportV2Routes({ app: ${appVar}, pool: __getBulkImportV2Pool(), requireAuth: typeof requireAuth === 'function' ? requireAuth : undefined });`,
      ''
    ].join('\n') });
  }

  injections.sort((a, b) => b.index - a.index);
  for (const injection of injections) source = source.slice(0, injection.index) + injection.code + source.slice(injection.index);
  return source;
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
