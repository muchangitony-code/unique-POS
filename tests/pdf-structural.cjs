'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const BRAND = require('../server/document-branding.cjs');
const out = path.join(process.cwd(), 'out');
function run(cmd, args) { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${r.stderr || r.stdout}`); return r.stdout; }
const cases = [];
for (const type of ['invoice', 'quotation']) {
  const prefix = type === 'invoice' ? 'invoice' : 'quotation'; const number = type === 'invoice' ? 'INV-QA-0024' : 'QTN-QA-0024';
  cases.push([`${prefix}-one-item.pdf`, number, 'Acme Electrical Supplies', 1]);
  cases.push([`${prefix}-25-items.pdf`, number, 'Acme Electrical Supplies', null]);
  cases.push([`${prefix}-long-description.pdf`, number, 'Acme Electrical Supplies', 1]);
  cases.push([`${prefix}-long-customer.pdf`, number, 'A Very Long Customer Name For Electrical Solar And General Supplies Trading Company Limited', 1]);
  cases.push([`${prefix}-zero-total.pdf`, number, 'Acme Electrical Supplies', 1]);
  cases.push([`${prefix}-large-amount.pdf`, number, 'Acme Electrical Supplies', 1]);
}
for (const [name, number, customer, expectedPages] of cases) {
  const file = path.join(out, name); if (!fs.existsSync(file)) throw new Error(`Missing fixture ${name}; run node scripts/pdf-fixtures.js first`);
  const info = run('pdfinfo', [file]); const count = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1] || 0); if (count <= 0) throw new Error(`${name}: invalid page count ${count}`);
  if (expectedPages && count !== expectedPages) throw new Error(`${name}: expected ${expectedPages} page(s), got ${count}`);
  if (name.includes('25-items') && count < 2) throw new Error(`${name}: pagination did not create a continuation page`);
  if (name.includes('25-items') && count > 4) throw new Error(`${name}: excessive pagination (${count} pages)`);
  const extracted = run('pdftotext', ['-layout', file, '-']);
  for (const required of [number, customer, BRAND.legalName, BRAND.address, BRAND.phone, BRAND.website]) if (!extracted.includes(required)) throw new Error(`${name}: extracted text missing ${required}`);
  const totals = (extracted.match(/(?:Total due|Estimated total)/g) || []).length; if (totals !== 1) throw new Error(`${name}: expected exactly one final total, found ${totals}`);
  console.log(`[pdf-structural] ${name}: ${count} page(s)`);
}
console.log('[pdf-structural] all invoice/quotation layout assertions passed');
