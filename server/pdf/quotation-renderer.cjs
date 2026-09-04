'use strict';

// Quotation rendering is intentionally routed through the same authoritative
// A4 engine as invoices so both documents stay visually and structurally consistent.
const renderer = require('./professional-a4-renderer.cjs');

async function renderPdfBuffer(payload, paper = 'a4') {
  return renderer.renderPdfBuffer(payload, paper);
}

module.exports = { renderPdfBuffer };
