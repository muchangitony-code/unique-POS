'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventory = fs.readFileSync(path.join(root, 'server', 'inventory-v3.cjs'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'server', 'pdf', 'bundle-loader.cjs'), 'utf8');

function assertIncludes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

assertIncludes(inventory, "app.get('/api/v3/inventory/products'", 'Inventory V3 catalogue route must be installed.');
assertIncludes(inventory, 'inventory_stock_v3', 'Inventory V3 catalogue must read live V3 stock.');
assertIncludes(inventory, 's.branch_id=$1', 'Inventory V3 catalogue must constrain stock by branch_id.');
assertIncludes(inventory, "app.get('/api/v3/inventory/dashboard'", 'Inventory V3 dashboard route must be installed.');
assertIncludes(inventory, 'LEFT JOIN inventory_stock_v3 s ON s.product_id=p.id AND s.branch_id=$1', 'Inventory V3 dashboard must constrain stock by branch_id.');
assertIncludes(inventory, "app.get('/api/v3/inventory/movements'", 'Inventory V3 movement history route must be installed.');
assertIncludes(inventory, 'WHERE product_id=$1 AND branch_id=$2', 'Inventory V3 movement history must constrain product and branch.');
assertIncludes(loader, 'UNIQUEPOS_RUNTIME_MOUNTS_INVENTORY_V3', 'Runtime loader must install the current Inventory V3 architecture.');
assertIncludes(loader, 'mountInventoryV3', 'Runtime loader must mount Inventory V3.');

console.log('[branch-inventory-regression] current Inventory V3 branch-scoping contract verified.');
