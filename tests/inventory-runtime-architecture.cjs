'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const build = fs.readFileSync(path.join(root, 'scripts', 'build.cjs'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'server', 'pdf', 'bundle-loader.cjs'), 'utf8');
const branchRoutes = fs.readFileSync(path.join(root, 'server', 'inventory-v3-branch-routes.cjs'), 'utf8');
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
if (!loader.includes('UNIQUEPOS_INVENTORY_V3_MOUNT_V3') || !loader.includes('mountInventoryV3BranchRoutes') || !loader.includes('mountInventoryV3')) {
  throw new Error('Inventory architecture regression: runtime loader does not install both branch-scoped and generic Inventory V3 routes.');
}
if (!branchRoutes.includes("app.get('/api/v3/inventory/products'") || !branchRoutes.includes('s.branch_id = $1')) {
  throw new Error('Inventory architecture regression: branch catalogue is not constrained by branch_id.');
}
if (!branchRoutes.includes("app.get('/api/v3/inventory/dashboard'") || !branchRoutes.includes('s.branch_id = $1')) {
  throw new Error('Inventory architecture regression: branch dashboard is not constrained by branch_id.');
}
if (!inventory.includes("app.get('/api/v3/inventory/products'") || !inventory.includes("app.get('/api/v3/inventory/dashboard'")) {
  throw new Error('Inventory architecture regression: Inventory V3 catalogue/dashboard routes are missing.');
}

console.log('[inventory-architecture] PASS: Inventory V3 is mounted with branch-scoped catalogue/dashboard before generic routes and without the deleted fragile patcher.');
