'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventory = fs.readFileSync(path.join(root, 'server', 'inventory-v3.cjs'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'server', 'pdf', 'bundle-loader.cjs'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'public', 'sales-v3-bridge.js'), 'utf8');

function assertIncludes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

assertIncludes(inventory, 'const q = text(req.query.q);', 'Inventory catalogue must preserve search handling.');
assertIncludes(inventory, 'inventory_stock_v2', 'Inventory catalogue must read live stock.');
assertIncludes(loader, 'UNIQUEPOS_INVENTORY_V3_MOUNT_V1', 'Runtime loader must install Inventory V3.');
assertIncludes(loader, 'mountInventoryV3', 'Runtime loader must mount the Inventory V3 module.');
assertIncludes(bridge, "liveUrl.searchParams.set('branchId', String(branchId));", 'Sales bridge must send branchId.');
assertIncludes(bridge, 'if (!branchId)', 'Sales bridge must never fall back to cross-branch stock.');
assertIncludes(bridge, 'Cache-Control', 'Sales bridge must remain uncached.');

console.log('[branch-inventory-regression] branch-scoped Sales inventory contract verified.');
