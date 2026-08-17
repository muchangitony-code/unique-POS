'use strict';

const assert = require('node:assert/strict');
const { patchPdfRenderer } = require('./patch-pdf-renderer.cjs');

const source = `async function renderPdfBuffer(payload, paper) {\n  throw new Error('old');\n}\n`;
const patched = patchPdfRenderer(source);
assert.match(patched, /normalizedType\.includes\('invoice'\)/);
assert.match(patched, /normalizedType\.includes\('quotation'\)/);
assert.match(patched, /root\.invoiceNumber/);
assert.match(patched, /root\.quotationNumber/);
assert.match(patched, /root\.documentType/);
console.log('[pdf-production-regression] PASS');
