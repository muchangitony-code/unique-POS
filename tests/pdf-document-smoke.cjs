'use strict';
const assert = require('node:assert/strict');
const { renderDocument } = require('../server/pdf/index.cjs');
const { renderReceiptDocument } = require('../server/pdf/receipt.cjs');

const company = {
  name: 'Settings Logo Company',
  businessName: 'Settings Logo Company',
  address: 'Nairobi, Kenya',
  phone: '+254 700 000 000',
  email: 'qa@example.test',
  taxId: 'P000000000X'
};

function payload(type) {
  return {
    type,
    doc: {
      number: type === 'invoice' ? 'DOC-SMOKE-INV-001' : 'DOC-SMOKE-QUO-001',
      date: '2026-08-19',
      dueDate: type === 'invoice' ? '2026-08-30' : undefined,
      validUntil: type === 'quotation' ? '2026-08-30' : undefined,
      customer: {
        name: 'Smoke Test Customer',
        address: 'Nairobi, Kenya',
        phone: '+254 700 000 000',
        email: 'customer@example.test',
        taxId: ''
      },
      items: [
        { description: 'Long electrical component description that must wrap inside the document table', qty: 2, unitPrice: '1250.00', taxRate: 16, discount: '0' },
        { description: 'Second item', qty: 1, unitPrice: '500.00', taxRate: 0, discount: '0' }
      ],
      currency: 'KES',
      notes: 'Document smoke test.',
      terms: 'Payment is due according to the stated date.'
    },
    company
  };
}

const receiptDoc = {
  number: 'REC-SMOKE-001',
  date: '2026-08-19',
  customer: { name: 'Smoke Test Customer' },
  items: [
    { description: 'Long electrical component description', qty: 2, unitPrice: '1250', taxRate: 16, discount: '0' },
    { description: 'Second item', qty: 1, unitPrice: '500', taxRate: 0, discount: '0' }
  ],
  currency: 'KES'
};

(async () => {
  for (const type of ['invoice', 'quotation']) {
    const pdf = await renderDocument(payload(type));
    assert.ok(Buffer.isBuffer(pdf) && pdf.subarray(0, 4).toString() === '%PDF', `${type} did not return a PDF buffer`);
    assert.ok(pdf.length > 1000, `${type} PDF is unexpectedly small`);
  }

  const receipt = await renderReceiptDocument({ doc: receiptDoc, company, paper: '80mm' });
  assert.ok(Buffer.isBuffer(receipt) && receipt.subarray(0, 4).toString() === '%PDF', 'receipt did not return a PDF buffer');
  assert.ok(receipt.length > 1000, 'receipt PDF is unexpectedly small');

  console.log('[pdf-document-smoke] PASS: invoice, quotation and receipt PDFs render');
})().catch((error) => { console.error(error); process.exit(1); });
