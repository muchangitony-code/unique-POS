'use strict';

/* The quotation PDF module has been retired. This entrypoint remains
 * only for supported document rendering and deliberately refuses quotation
 * payloads so no legacy quotation layout can generate a malformed document.
 */
const renderer = require('./a4-renderer.cjs');

function isQuotation(payload) {
  const type = String(
    payload && (
      payload.documentType ||
      payload.type ||
      payload.document_type ||
      (payload.document && payload.document.type)
    ) || ''
  ).trim().toLowerCase();
  return type === 'quotation' || type === 'quote' || type === 'quotationpdf';
}

async function renderPdfBuffer(payload, paper = 'a4') {
  if (isQuotation(payload)) {
    const error = new Error('Quotation module has been removed.');
    error.statusCode = 410;
    error.code = 'QUOTATION_MODULE_REMOVED';
    throw error;
  }
  return renderer.renderPdfBuffer(payload, paper);
}

module.exports = { ...renderer, renderPdfBuffer, isQuotation };
