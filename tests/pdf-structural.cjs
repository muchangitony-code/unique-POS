'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = path.join(process.cwd(), 'out');
const fixtures = [
  ['invoice-one-item.pdf', 'INV-0024', 'Acme Electrical Supplies', 'KSh 5,800.00'],
  ['quotation-one-item.pdf', 'QUO-0024', 'Acme Electrical Supplies', 'KSh 5,800.00'],
  ['invoice-multipage.pdf', 'INV-0024', 'Acme Electrical Supplies', 'KSh 118,900.00'],
  ['invoice-long-description.pdf', 'INV-0024', 'Acme Electrical Supplies', 'KSh 116.00'],
  ['invoice-minimal-customer.pdf', 'INV-0024', 'Walk-in Customer', 'KSh 5,800.00'],
  ['invoice-zero-total.pdf', 'INV-0024', 'Acme Electrical Supplies', 'KSh 0.00'],
  ['invoice-large-amount.pdf', 'INV-0024', 'Acme Electrical Supplies', 'KSh 1,234,567.89']
];
function run(cmd, args) { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${r.stderr || r.stdout}`); return r.stdout; }
for (const [name, number, customer, total] of fixtures) {
  const file = path.join(out, name); if (!fs.existsSync(file)) throw new Error(`Missing fixture ${name}; run node scripts/pdf-fixtures.js first`);
  const info = run('pdfinfo', [file]); const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1] || 0); if (pages <= 0) throw new Error(`${name}: page count is zero`);
  const extracted = run('pdftotext', ['-layout', file, '-']);
  for (const required of [number, customer, total]) if (!extracted.includes(required)) throw new Error(`${name}: extracted text missing ${required}`);
  const matches = [...extracted.matchAll(/GRAND TOTAL\s+([^\n]*?KSh\s+[\d,]+\.\d{2})/g)].map((m) => m[1]);
  if (!matches.length || !matches[matches.length - 1].includes(total)) throw new Error(`${name}: extracted grand total does not match computed total ${total}`);
  console.log(`[pdf-structural] ${name}: ${pages} page(s), total ${total}`);
}
console.log('[pdf-structural] all fixture assertions passed');
