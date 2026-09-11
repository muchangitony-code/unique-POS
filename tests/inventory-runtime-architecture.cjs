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
if (!loader.includes('UNIQUEPOS_RUNTIME_MOUNTS_INVENTORY_V3') || !loader.includes('mountInventoryV3')) {
  throw new Error('Inventory architecture regression: runtime loader does not install Inventory V3 routes.');
}
if (!inventory.includes("app.get('/api/v3/inventory/products'") || !inventory.includes("app.get('/api/v3/inventory/dashboard'")) {
  throw new Error('Inventory architecture regression: Inventory V3 catalogue/dashboard routes are missing.');
}
if (!inventory.includes('s.branch_id=$1') && !inventory.includes('s.branch_id = $1')) {
  throw new Error('Inventory architecture regression: catalogue/dashboard stock queries are not branch-scoped.');
}
if (!inventory.includes('req.query.branchId||1') && !inventory.includes('req.query.branchId')) {
  throw new Error('Inventory architecture regression: branchId is not accepted by Inventory V3 catalogue/dashboard routes.');
}

console.log('[inventory-architecture] PASS: Inventory V3 is mounted through the runtime loader, has catalogue/dashboard routes, and scopes stock by branch.');
