'use strict';

/* Single authoritative A4 document entrypoint.
 * Invoices and quotations deliberately share one renderer so no legacy
 * document-specific layout can bypass the current branded design.
 */
const renderer = require('./a4-renderer.cjs');

async function renderPdfBuffer(payload, paper = 'a4') {
  return renderer.renderPdfBuffer(payload, paper);
}

module.exports = { ...renderer, renderPdfBuffer };
