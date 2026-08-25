'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const INVENTORY_MOUNT_MARKER = 'UNIQUEPOS_INVENTORY_V3_MOUNT_V2';

function prepareRuntimeSource(filename) {
  let source = fs.readFileSync(filename, 'utf8');
  if (source.includes(INVENTORY_MOUNT_MARKER)) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
    || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
  if (!expressMatch) throw new Error('Inventory V3 integration: Express application not found in runtime bundle.');
  const appVar = expressMatch[1];

  let listenIndex = source.lastIndexOf(`${appVar}.listen(`);
  if (listenIndex < 0) {
    const aliasRegex = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${appVar}\\s*;`, 'g');
    const aliases = [...source.matchAll(aliasRegex)];
    if (aliases.length) listenIndex = source.lastIndexOf(`${aliases[aliases.length - 1][1]}.listen(`);
  }
  if (listenIndex < 0) throw new Error('Inventory V3 integration: application listen point not found.');

  const injection = [
    `// ${INVENTORY_MOUNT_MARKER}`,
    "const { mountInventoryV3BranchRoutes } = require('./server/inventory-v3-branch-routes.cjs');",
    "const { mountInventoryV3 } = require('./server/inventory-v3.cjs');",
    `mountInventoryV3BranchRoutes(${appVar});`,
    `mountInventoryV3(${appVar});`,
    ''
  ].join('\n');
  return source.slice(0, listenIndex) + injection + source.slice(listenIndex);
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
