'use strict';

const assert = require('node:assert/strict');
const { renderPdfBuffer } = require('../server/pdf/index.cjs');
const { adaptDocumentPayload, detectDocumentType } = require('../server/pdf/document-adapter.cjs');
const BRAND = require('../document-branding.cjs');

const base = {
  customer: { name: 'Production Regression Customer', address: 'Nairobi', phone: '0712345678' },
  items: [{ description: 'Solar cable 6mm²', qty: 2, unitPrice: '2500', taxRate: 16, discount: '0' }],
  currency: 'KES',
  company: { logoUrl: BRAND.logo }
};

assert.equal(detectDocumentType({ documentType: 'INVOICE' }), 'invoice');
assert.equal(detectDocumentType({ documentType: 'quotation' }), 'quotation');

for (const type of ['invoice', 'quotation']) {
  const payload = {
    type,
    doc: {
      number: type === 'invoice' ? 'INV-REG-001' : 'QTN-REG-001',
      date: '2026-08-18',
      dueDate: '2026-08-30',
      validUntil: '2026-08-30',
      ...base
    }
  };
  const adapted = adaptDocumentPayload(payload);
  assert.equal(adapted.type, type);
  assert.equal(adapted.company.logoUrl, BRAND.logo);
  const pdf = await renderPdfBuffer(payload, 'a4');
  assert.ok(Buffer.isBuffer(pdf) && pdf.subarray(0, 5).toString() === '%PDF-', `${type} did not return a PDF buffer`);
  assert.ok(pdf.length > 1000, `${type} PDF is unexpectedly small`);
}

console.log('[pdf-production-regression] PASS: invoice and quotation use the authoritative renderer directly');
