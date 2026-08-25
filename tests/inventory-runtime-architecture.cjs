'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const build = fs.readFileSync(path.join(root, 'scripts', 'build.cjs'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'server', 'pdf', 'bundle-loader.cjs'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'server', 'inventory-v3.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const patcher = path.join(root, 'scripts', 'inventory-v3-runtime-patch.cjs');

if (build.includes('inventory-v3-runtime-patch.cjs') || build.includes('patchBranchScopedInventoryCatalogue')) {
  throw new Error('Inventory architecture regression: build still depends on the deleted runtime patcher.');
}
if (app.includes('inventory-v3-runtime-patch.cjs') || app.includes('patchRuntimeBundle')) {
  throw new Error('Inventory architecture regression: application startup still invokes the deleted runtime patcher.');
}
if (fs.existsSync(patcher)) {
  throw new Error('Inventory architecture regression: inventory-v3-runtime-patch.cjs still exists.');
}
if (!loader.includes('UNIQUEPOS_INVENTORY_V3_MOUNT_V1') || !loader.includes('mountInventoryV3')) {
  throw new Error('Inventory architecture regression: runtime loader does not mount Inventory V3.');
}
if (!inventory.includes("app.get('/api/v3/inventory/products'") || !inventory.includes("app.get('/api/v3/inventory/dashboard'")) {
  throw new Error('Inventory architecture regression: Inventory V3 catalogue/dashboard routes are missing.');
}

console.log('[inventory-architecture] PASS: Inventory V3 is mounted through the runtime loader without the deleted fragile patcher.');
