'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const INVENTORY_MOUNT_MARKER = 'UNIQUEPOS_INVENTORY_V3_MOUNT_V3';

function prepareRuntimeSource(filename) {
  let source = fs.readFileSync(filename, 'utf8');
  if (source.includes(INVENTORY_MOUNT_MARKER)) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
    || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
  if (!expressMatch) throw new Error('Inventory V3 integration: Express application not found in runtime bundle.');
  const appVar = expressMatch[1];
  const appStatementEnd = source.indexOf('\n', expressMatch.index);
  if (appStatementEnd < 0) throw new Error('Inventory V3 integration: Express application declaration is incomplete.');

  const injection = [
    `// ${INVENTORY_MOUNT_MARKER}`,
    "const { mountInventoryV3BranchRoutes } = require('./server/inventory-v3-branch-routes.cjs');",
    "const { mountInventoryV3 } = require('./server/inventory-v3.cjs');",
    `mountInventoryV3BranchRoutes(${appVar});`,
    `mountInventoryV3(${appVar});`,
    ''
  ].join('\n');
  return source.slice(0, appStatementEnd + 1) + injection + source.slice(appStatementEnd + 1);
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
