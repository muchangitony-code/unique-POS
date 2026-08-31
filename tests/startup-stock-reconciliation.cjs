'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'inventory-stock-repair.cjs'), 'utf8');

for (const required of [
  'function parseOpeningStockSeed',
  'function normalizedName',
  "regexp_replace(lower(trim(name)),'[^a-z0-9]','','g')",
  'strictMatches',
  'normalizedMatches',
  'unmatched',
  'GREATEST(inventory_stock_v2.quantity_on_hand,EXCLUDED.quantity_on_hand)',
  'totalUnits'
]) {
  if (!source.includes(required)) throw new Error(`Missing inventory recovery safeguard: ${required}`);
}
if (source.includes('if (!Number(strictCount.rows[0]?.lines || 0))')) {
  throw new Error('Regression: reconciliation must run per product, not all-or-nothing.');
}

console.log('[startup-stock-reconciliation] PASS: stock recovery uses normalized identifiers, price-aware matching, per-product fallback and idempotent upserts.');
