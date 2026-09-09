'use strict';
const fs = require('node:fs');
const path = require('node:path');

const bundle = path.resolve(__dirname, '..', 'server', 'index.cjs');
let source = fs.readFileSync(bundle, 'utf8');

const guard = /router\d+\.use\("\/products", requireRole\("administrator", "manager", "storekeeper"\)\);/;
const matches = source.match(guard);

if (matches && matches.length === 1) {
  source = source.replace(guard, (line) => line.replace('"storekeeper"', '"storekeeper", "sales_cashier"'));
  fs.writeFileSync(bundle, source, 'utf8');
  console.log('[build] patched runtime product catalog access for sales_cashier');
} else if (source.includes('requireRole("administrator", "manager", "storekeeper", "sales_cashier")')) {
  console.log('[build] runtime product catalog access already allows sales_cashier');
} else {
  throw new Error('[build] expected compiled /products role guard not found; refusing to deploy unverified POS permissions');
}
