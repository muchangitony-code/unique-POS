'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const patch = fs.readFileSync(path.join(root, 'scripts', 'inventory-v3-runtime-patch.cjs'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'public', 'sales-v3-bridge.js'), 'utf8');

function assertIncludes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

assertIncludes(patch, 'const branchId = Number(req.query.branchId || 0);', 'Runtime inventory patch must read branchId.');
assertIncludes(patch, 's.branch_id = $1', 'Runtime inventory patch must constrain stock by branch.');
assertIncludes(patch, "liveUrl.searchParams.set('branchId', String(branchId));", 'Sales bridge must send branchId.');
assertIncludes(bridge, 'if (!branchId)', 'Sales bridge must never fall back to cross-branch stock.');
assertIncludes(bridge, 'Cache-Control', 'Sales bridge must remain uncached.');

console.log('[branch-inventory-regression] branch-scoped Sales inventory contract verified.');
