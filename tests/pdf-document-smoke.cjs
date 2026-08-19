'use strict';
const assert = require('node:assert/strict');
const { renderDocument } = require('../server/pdf/index.cjs');

const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const company = {
  name: 'Settings Logo Company',
  tagline: 'Document Smoke Test',
  address: 'Nairobi, Kenya',
  phone: '+254 700 000 000',
  website: 'https://example.test',
  logoUrl: logo,
  taxId: 'P000000000X'
};
const base = {
  number: 'DOC-SMOKE-001', date: '2026-08-19', dueDate: '2026-08-30', validUntil: '2026-08-30',
  customer: { name: 'Smoke Test Customer' },
  items: [
    { description: 'Long electrical component description that must wrap inside the document table without overlapping adjacent columns', qty: 2, unitPrice: '1250.00', taxRate: 16, discount: '0' },
    { description: 'Second item', qty: 1, unitPrice: '500.00', taxRate: 0, discount: '0' }
  ],
  currency: 'KES', notes: 'Document smoke test.'
};

(async () => {
  for (const type of ['invoice', 'quotation']) {
    const pdf = await renderDocument({ type, doc: base, company });
    assert.ok(Buffer.isBuffer(pdf) && pdf.subarray(0, 4).toString() === '%PDF', `${type} did not return a PDF buffer`);
    assert.ok(pdf.length > 5000, `${type} PDF is unexpectedly small`);
  }
  const receipt = await renderDocument({ type: 'receipt', doc: base, company, paper: '80mm' });
  assert.ok(Buffer.isBuffer(receipt) && receipt.subarray(0, 4).toString() === '%PDF', 'receipt did not return a PDF buffer');
  assert.ok(receipt.length > 3000, 'receipt PDF is unexpectedly small');
  console.log('[pdf-document-smoke] PASS: invoice, quotation and receipt PDFs render with the settings logo');
})().catch((error) => { console.error(error); process.exit(1); });
