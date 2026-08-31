'use strict';

const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'inventory-ledger-recovery.cjs'), 'utf8');
for (const expected of [
  "WHEN 'currentstock' THEN 1",
  "WHEN 'openingstock' THEN 2",
  "WHEN 'availableqty' THEN 3",
  "WHEN 'availablequantity' THEN 4",
  "WHEN 'stock' THEN 5",
  "WHEN 'qty' THEN 6",
  "WHEN 'quantity' THEN 7"
]) {
  if (!source.includes(expected)) throw new Error(`Missing stock-field priority: ${expected}`);
}
if (!source.includes('ORDER BY CASE regexp_replace(lower(e.key)')) throw new Error('Regression: recovery does not deterministically choose a stock field.');
console.log('[inventory-stock-key-priority] PASS');
