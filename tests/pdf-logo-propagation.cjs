'use strict';

const assert = require('node:assert/strict');
const { adaptDocumentPayload } = require('../server/pdf/document-adapter.cjs');
const { validateDocument, normalizeDocument } = require('../server/pdf/schema.cjs');

const pngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function buildPayload(logoUrl) {
  return {
    type: 'quotation',
    quotationNumber: 'QTN-LOGO-TEST',
    date: '2026-08-17',
    validUntil: '2026-08-31',
    customer: { name: 'Logo Test Customer' },
    items: [{ description: 'Test item', qty: 1, unitPrice: '100.00', taxRate: 0, discount: '0' }],
    currency: 'KES',
    settings: {
      name: 'Unique Solar & General Supplies Limited',
      logoUrl
    }
  };
}

for (const logoUrl of [pngData, '/assets/test-logo.png', 'https://example.test/logo.png']) {
  const adapted = adaptDocumentPayload(buildPayload(logoUrl));
  validateDocument(adapted.type, adapted.doc, adapted.company);
  const normalized = normalizeDocument(adapted.type, adapted.doc, adapted.company);
  assert.ok(normalized.company.logo, `logo was lost during normalization for ${logoUrl.slice(0, 30)}`);
  if (logoUrl === pngData) assert.ok(Buffer.isBuffer(normalized.company.logo), 'data-image PNG must become a Buffer');
  else assert.equal(normalized.company.logo, logoUrl, 'path/URL logo source must survive normalization');
}

console.log('[pdf-logo-propagation] Settings logo survives adapter + schema normalization');
