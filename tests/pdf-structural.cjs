'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = path.join(process.cwd(), 'out');
const fixtures = [];
for (const type of ['invoice', 'quotation']) {
  const prefix = type === 'invoice' ? 'invoice' : 'quotation';
  const number = type === 'invoice' ? 'INV-QA-0024' : 'QTN-QA-0024';
  fixtures.push([`${prefix}-one-item.pdf`, number, 'Acme Electrical Supplies', 'KSh 5,800.00', null]);
  fixtures.push([`${prefix}-25-items.pdf`, number, 'Acme Electrical Supplies', 'KSh 47,125.00', 3]);
  fixtures.push([`${prefix}-long-description.pdf`, number, 'Acme Electrical Supplies', 'KSh 116.00', null]);
  fixtures.push([`${prefix}-long-customer.pdf`, number, 'A Very Long Customer Name For Electrical Solar And General Supplies Trading Company Limited', 'KSh 5,800.00', null]);
  fixtures.push([`${prefix}-zero-total.pdf`, number, 'Acme Electrical Supplies', 'KSh 0.00', null]);
  fixtures.push([`${prefix}-large-amount.pdf`, number, 'Acme Electrical Supplies', 'KSh 1,234,567.89', null]);
}
function run(cmd, args) { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${r.stderr || r.stdout}`); return r.stdout; }
for (const [name, number, customer, total, expectedPages] of fixtures) {
  const file = path.join(out, name);
  if (!fs.existsSync(file)) throw new Error(`Missing fixture ${name}; run node scripts/pdf-fixtures.js first`);
  const info = run('pdfinfo', [file]);
  const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1] || 0);
  if (pages <= 0) throw new Error(`${name}: page count is zero`);
  if (expectedPages && pages !== expectedPages) throw new Error(`${name}: expected ${expectedPages} pages, got ${pages}`);
  const extracted = run('pdftotext', ['-layout', file, '-']);
  for (const required of [number, customer, total]) if (!extracted.includes(required)) throw new Error(`${name}: extracted text missing ${required}`);
  if (!extracted.includes('GRAND TOTAL')) throw new Error(`${name}: missing GRAND TOTAL`);
  const totalOccurrences = (extracted.match(/GRAND TOTAL/g) || []).length;
  if (totalOccurrences !== 1) throw new Error(`${name}: expected one GRAND TOTAL, found ${totalOccurrences}`);
  console.log(`[pdf-structural] ${name}: ${pages} page(s), total ${total}`);
}
console.log('[pdf-structural] all layout assertions passed');
