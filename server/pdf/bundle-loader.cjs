'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const RUNTIME_MOUNT_MARKER = 'UNIQUEPOS_RUNTIME_MOUNTS_V4';

function findExpressAppDeclaration(source) {
  const patterns = [
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)\s*;?/m,
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)\s*;?/m
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match) return { appVar: match[1], end: match.index + match[0].length };
  }
  return null;
}

function prepareRuntimeSource(filename) {
  let source = fs.readFileSync(filename, 'utf8');
  if (source.includes(RUNTIME_MOUNT_MARKER)) return source;

  const declaration = findExpressAppDeclaration(source);
  if (!declaration) throw new Error('Runtime integration: Express application declaration not found.');

  const { appVar, end } = declaration;
  const code = `\n/* ${RUNTIME_MOUNT_MARKER} */\n(() => {\n  const { mountInventoryV3BranchRoutes } = require('./server/inventory-v3-branch-routes.cjs');\n  const { mountInventoryV3 } = require('./server/inventory-v3.cjs');\n  const { parseAndValidateDatabaseUrl, railwaySsl } = require('./scripts/database-url.cjs');\n  const { registerBulkImportV2Routes } = require('./server/bulk-import-v2-router.cjs');\n  let bulkImportPool;\n  const getBulkImportPool = () => {\n    if (!bulkImportPool) {\n      const { Pool: PgPool } = require('pg');\n      const { databaseUrl } = parseAndValidateDatabaseUrl('bulk-import-v2');\n      bulkImportPool = new PgPool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 5 });\n    }\n    return bulkImportPool;\n  };\n  ${appVar}.get('/api/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'unique-pos' }));\n  mountInventoryV3BranchRoutes(${appVar});\n  mountInventoryV3(${appVar});\n  registerBulkImportV2Routes({ app: ${appVar}, pool: getBulkImportPool(), requireAuth: typeof requireAuth === 'function' ? requireAuth : undefined });\n})();\n`;

  source = source.slice(0, end) + code + source.slice(end);
  return source;
}

function loadIndex() {
  const filename = path.join(__dirname, '..', '..', 'index.runtime.cjs');
  const source = prepareRuntimeSource(filename);
  if (source === fs.readFileSync(filename, 'utf8')) return require(filename);

  // Compile the transformed source in a fresh module. This avoids changing the
  // on-disk deterministic runtime bundle and keeps all injected declarations
  // scoped inside the runtime-mount IIFE.
  const runtimeModule = new Module(filename, module);
  runtimeModule.filename = filename;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(filename));
  runtimeModule._compile(source, filename);
  return runtimeModule.exports;
}

module.exports = { loadIndex, prepareRuntimeSource };
