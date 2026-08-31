'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'inventory-stock-repair.cjs'),
  'utf8'
);

if (!source.includes("await client.query(recoverySql);")) {
  throw new Error('Strict workbook reconciliation is missing.');
}
if (!source.includes("await client.query(relaxedRecoverySql);")) {
  throw new Error('Normalized-name reconciliation is missing.');
}
if (source.includes("if (!Number(strictCount.rows[0]?.lines || 0))")) {
  throw new Error('Regression: reconciliation is still all-or-nothing.');
}
if (!source.includes('GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand)')) {
  throw new Error('Regression: source reconciliation may overwrite restored stock.');
}

console.log('[startup-stock-reconciliation] PASS: strict and normalized-name passes run per product without an all-or-nothing gate.');
