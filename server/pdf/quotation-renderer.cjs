'use strict';

/* Quotation renderer: delegate to the authoritative A4 renderer to
   reuse its robust pagination and layout logic. This keeps a single
   source of truth for A4 pagination while preserving the legacy
   compatibility facade used by the production bundle. */

const { adaptDocumentPayload } = require('./document-adapter.cjs');
const a4 = require('./a4-renderer.cjs');

async function renderPdfBuffer(payload, paper = 'a4') {
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type !== 'quotation') throw new Error('quotation-renderer only supports quotations');
  // Delegate to the authoritative renderer which handles validation, normalization,
  // pagination, headers/footers, metadata and QR generation.
  return a4.renderDocument({ type: 'quotation', doc: adapted.doc, company: adapted.company });
}

module.exports = { renderPdfBuffer };