'use strict';

const assert = require('node:assert/strict');
const { adaptLegacyPayload } = require('../server/pdf/legacy-adapter.cjs');
const { patchPdfRenderer } = require('./patch-pdf-renderer.cjs');

const adapted = adaptLegacyPayload({
  documentType: 'quotation',
  documentNumber: 'QUO-TEST-001',
  meta: { date: '16/08/2026, 09:17:23', validUntil: '30/08/2026' },
  customerName: 'Walk-in Customer',
  rows: [{ productName: 'Test Item', quantity: 1, unitPrice: '1000', taxRate: 16 }],
  company: { name: 'Test Company', taxPin: 'P000000000X' }
}, 'a4');
assert.equal(adapted.type, 'quotation');
assert.equal(adapted.doc.date, '2026-08-16');
assert.equal(adapted.doc.validUntil, '2026-08-30');
assert.equal(adapted.doc.items.length, 1);
assert.equal(adapted.company.taxId, 'P000000000X');

const source = `async function renderPdfBuffer(payload, paper) {\n  throw new Error('old');\n}\n`;
const patched = patchPdfRenderer(source);
assert.match(patched, /normalizedType\.includes\('invoice'\)/);
assert.match(patched, /normalizedType\.includes\('quotation'\)/);
assert.match(patched, /root\.invoiceNumber/);
assert.match(patched, /root\.quotationNumber/);

console.log('[pdf-production-regression] PASS');
