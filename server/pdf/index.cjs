'use strict';

// PDF subsystem entrypoint. Quotations and invoices are intentionally isolated.
const { detectDocumentType } = require('./document-adapter.cjs');
const invoiceRenderer = require('./a4-renderer.cjs');
const quotationRenderer = require('./quotation-renderer.cjs');

async function renderPdfBuffer(payload, paper = 'a4') {
  const type = detectDocumentType(payload);
  if (type === 'quotation') return quotationRenderer.renderPdfBuffer(payload, paper);
  return invoiceRenderer.renderPdfBuffer(payload, paper);
}

module.exports = { ...invoiceRenderer, renderPdfBuffer };
