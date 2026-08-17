'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { renderReceiptDocument } = require('../server/pdf/receipt.cjs');
const { spawnSync } = require('node:child_process');
const out = path.join(process.cwd(), 'out');
fs.mkdirSync(out, { recursive: true });
const company = { name: 'Unique Solar Kenya Ltd', address: 'Nairobi, Kenya', phone: '+254 700 000 000', taxId: 'P051234567A' };
const doc = { number: 'RCPT-0024', date: '2026-08-17', customer: { name: 'Walk-in Customer' }, currency: 'KES', items: [{ description: '12W LED Bulb', qty: 2, unitPrice: '100.00', taxRate: 16, discount: '0' }], notes: '' };
function run(cmd, args) { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${r.stderr || r.stdout}`); return r.stdout; }
(async () => {
  for (const paper of ['80mm', '58mm']) {
    const file = path.join(out, `receipt-${paper}.pdf`);
    fs.writeFileSync(file, await renderReceiptDocument({ doc, company, paper }));
    const info = run('pdfinfo', [file]);
    const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1] || 0);
    if (pages !== 1) throw new Error(`${paper}: expected one receipt page, got ${pages}`);
    const text = run('pdftotext', [file, '-']);
    for (const required of ['RCPT-0024', 'Walk-in Customer', '12W LED Bulb', 'KSh 232.00']) if (!text.includes(required)) throw new Error(`${paper}: missing ${required}`);
    console.log(`[pdf-receipt-smoke] ${paper}: PASS`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
