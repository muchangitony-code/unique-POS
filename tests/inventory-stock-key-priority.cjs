'use strict';

const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'inventory-stock-repair.cjs'), 'utf8');
for (const expected of [
  "WHEN 'currentstock' THEN 1",
  "WHEN 'openingstock' THEN 2",
  "WHEN 'stock' THEN 3",
  "WHEN 'qty' THEN 4",
  "WHEN 'quantity' THEN 5"
]) {
  if (!source.includes(expected)) throw new Error(`Missing stock-field priority: ${expected}`);
}
if (source.includes("WHERE regexp_replace(lower(e.key),'[^a-z0-9]','','g') IN ('currentstock','openingstock','availableqty','availablequantity','stock','qty','quantity') LIMIT 1")) {
  throw new Error('Regression: stock recovery still relies on arbitrary JSON key order.');
}
console.log('[inventory-stock-key-priority] PASS');
