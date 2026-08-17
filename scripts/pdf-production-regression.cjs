'use strict';

const assert = require('node:assert/strict');
const { adaptDocumentPayload, detectDocumentType } = require('../server/pdf/document-adapter.cjs');
const { patchPdfRenderer } = require('./patch-pdf-renderer.cjs');

const quotation = adaptDocumentPayload({ documentType: 'Quotation', documentNumber: 'QUO-TEST-001', meta: { date: '16/08/2026, 09:17:23', validUntil: '30/08/2026' }, customerName: 'Walk-in Customer', rows: [{ productName: 'Test Item', quantity: 1, unitPrice: '1000', taxRate: 16 }], company: { name: 'Test Company', taxPin: 'P000000000X' } }, 'a4');
assert.equal(detectDocumentType({ documentType: 'INVOICE' }), 'invoice');
assert.equal(detectDocumentType({ documentType: 'quotation' }), 'quotation');
assert.equal(quotation.type, 'quotation');
assert.equal(quotation.doc.number, 'QUO-TEST-001');
assert.equal(quotation.doc.date, '2026-08-16');
assert.equal(quotation.doc.validUntil, '2026-08-30');
assert.equal(quotation.doc.items.length, 1);
assert.equal(quotation.company.taxId, 'P000000000X');
const source = `async function renderPdfBuffer(payload, paper) {\n  throw new Error('old');\n}\n`;
const patched = patchPdfRenderer(source);
assert.match(patched, /require\('\.\/server\/pdf\/index\.cjs'\)/);
assert.match(patched, /require\('\.\/server\/pdf\/document-adapter\.cjs'\)/);
assert.match(patched, /renderDocument\(\{ type: adapted\.type/);
assert.doesNotMatch(patched, /legacy-adapter|renderLegacyDocumentPdf|renderLegacyReceiptPdf/);
console.log('[pdf-production-regression] PASS');
