'use strict';

const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'inventory-core.cjs'), 'utf8');

for (const expected of [
  "'openingStock', 'opening_stock', 'currentStock', 'current_stock'",
  "'initialStock', 'initial_stock', 'quantity'",
  "Initial stock on product creation",
  "CASE WHEN id=$2 THEN $3 ELSE 0 END",
  "const openingStock = optionalAmount(openingInput, 'opening stock') ?? 0"
]) {
  if (!source.includes(expected)) throw new Error(`Missing product opening-stock safeguard: ${expected}`);
}

console.log('[product-opening-stock-contract] PASS');
