'use strict';

/*
 * PDF entrypoint for POS documents.
 * Quotations are pre-sale commercial documents and must remain printable and
 * downloadable without any payment, amount-paid or settlement validation.
 */
const renderer = require('./a4-renderer.cjs');

function documentType(payload) {
  return String(
    payload && (
      payload.documentType ||
      payload.type ||
      payload.document_type ||
      (payload.document && payload.document.type)
    ) || ''
  ).trim().toLowerCase();
}

function isQuotation(payload) {
  const type = documentType(payload);
  return type === 'quotation' || type === 'quote' || type === 'quotationpdf';
}

async function renderPdfBuffer(payload, paper = 'a4') {
  return renderer.renderPdfBuffer(payload, paper);
}

module.exports = { ...renderer, renderPdfBuffer, isQuotation, documentType };
