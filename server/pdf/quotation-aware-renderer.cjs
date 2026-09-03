'use strict';

// Compatibility facade for the monolithic runtime entrypoint.
// The production bundle historically imports a4-renderer.cjs directly.
// Keep invoices on that renderer, but route every quotation through the
// isolated renderer before any legacy layout code can touch it.
const base = require('./a4-renderer.cjs');
const quotation = require('./quotation-renderer.cjs');
const { detectDocumentType } = require('./document-adapter.cjs');

async function renderPdfBuffer(payload, paper = 'a4') {
  if (detectDocumentType(payload) === 'quotation') {
    return quotation.renderPdfBuffer(payload, paper);
  }
  return base.renderPdfBuffer(payload, paper);
}

module.exports = { ...base, renderPdfBuffer };
