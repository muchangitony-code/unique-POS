'use strict';
const assert = require('node:assert/strict');
const { renderPdfBuffer } = require('../server/pdf/index.cjs');
const { renderReceiptDocument } = require('../server/pdf/receipt.cjs');

const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const settings = {
  name: 'Settings Logo Company',
  businessName: 'Settings Logo Company',
  tagline: 'Document Smoke Test',
  address: 'Nairobi, Kenya',
  phone: '+254 700 000 000',
  email: 'qa@example.test',
  website: 'https://example.test',
  taxPin: 'P000000000X',
  logoUrl: logo
};

function payload(type) {
  return {
    settings,
    branch: { name: 'Main Branch' },
    documentType: type === 'invoice' ? 'Invoice' : 'Quotation',
    documentNumber: type === 'invoice' ? 'DOC-SMOKE-INV-001' : 'DOC-SMOKE-QUO-001',
    customer: {
      name: 'Smoke Test Customer',
      company: '',
      address: 'Nairobi, Kenya',
      phone: '+254 700 000 000',
      email: 'customer@example.test',
      taxNumber: ''
    },
    meta: {
      date: '19/08/2026, 09:17:23',
      dueDate: type === 'invoice' ? '30/08/2026' : '—',
      validUntil: type === 'quotation' ? '30/08/2026' : undefined,
      paymentTerms: 'Due on receipt'
    },
    currency: 'KES',
    notes: 'Document smoke test.',
    rows: [
      { productName: 'Long electrical component description that must wrap inside the document table without overlapping adjacent columns', quantity: '2', unitPrice: '1,250.00', taxRate: '16', discount: '0' },
      { productName: 'Second item', quantity: '1', unitPrice: '500.00', taxRate: '0', discount: '0' }
    ]
  };
}

const receiptDoc = {
  number: 'REC-SMOKE-001',
  date: '2026-08-19',
  customer: { name: 'Smoke Test Customer' },
  items: [
    { description: 'Long electrical component description', qty: 2, unitPrice: '1250.00', taxRate: 16, discount: '0' },
    { description: 'Second item', qty: 1, unitPrice: '500.00', taxRate: 0, discount: '0' }
  ],
  currency: 'KES'
};

(async () => {
  for (const type of ['invoice', 'quotation']) {
    const pdf = await renderPdfBuffer(payload(type), 'a4');
    assert.ok(Buffer.isBuffer(pdf) && pdf.subarray(0, 4).toString() === '%PDF', `${type} did not return a PDF buffer`);
    assert.ok(pdf.length > 5000, `${type} PDF is unexpectedly small`);
  }

  const receipt = await renderReceiptDocument({ doc: receiptDoc, company: settings, paper: '80mm' });
  assert.ok(Buffer.isBuffer(receipt) && receipt.subarray(0, 4).toString() === '%PDF', 'receipt did not return a PDF buffer');
  assert.ok(receipt.length > 3000, 'receipt PDF is unexpectedly small');

  console.log('[pdf-document-smoke] PASS: invoice, quotation and receipt PDFs render with the settings logo');
})().catch((error) => { console.error(error); process.exit(1); });
