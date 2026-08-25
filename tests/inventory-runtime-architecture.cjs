'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const build = fs.readFileSync(path.join(root, 'scripts', 'build.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const patcher = path.join(root, 'scripts', 'inventory-v3-runtime-patch.cjs');

if (build.includes('inventory-v3-runtime-patch.cjs') || build.includes('patchBranchScopedInventoryCatalogue')) {
  throw new Error('Inventory architecture regression: build still depends on the deleted runtime patcher.');
}
if (app.includes('inventory-v3-runtime-patch.cjs') || app.includes('patchRuntimeBundle')) {
  throw new Error('Inventory architecture regression: application startup still invokes the runtime patcher.');
}
if (fs.existsSync(patcher)) {
  throw new Error('Inventory architecture regression: inventory-v3-runtime-patch.cjs still exists.');
}

console.log('[inventory-architecture] PASS: no Inventory V3 runtime source-rewriter remains.');
