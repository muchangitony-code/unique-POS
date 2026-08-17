'use strict';

function findFunctionEnd(source, start) {
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error('PDF renderer migration: function body opening brace not found');
  let depth = 0, quote = null, template = false, lineComment = false, blockComment = false, escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (ch === '\\') { escaped = true; continue; } if (ch === quote) quote = null; continue; }
    if (template) { if (escaped) { escaped = false; continue; } if (ch === '\\') { escaped = true; continue; } if (ch === '`') template = false; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '`') { template = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i + 1; }
  }
  throw new Error('PDF renderer migration: unterminated renderPdfBuffer function');
}

function patchPdfRenderer(source) {
  const marker = 'async function renderPdfBuffer(payload, paper)';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('PDF renderer migration: could not locate renderPdfBuffer');
  const end = findFunctionEnd(source, start);
  const replacement = `async function renderPdfBuffer(payload, paper) {
  const { renderLegacyDocumentPdf, renderLegacyReceiptPdf } = require('./server/pdf/legacy-adapter.cjs');
  const root = payload && typeof payload === 'object' ? payload : {};
  const rawType = root.type || root.documentType || root.document_type || root.docType || root.kind ||
    (root.doc && (root.doc.type || root.doc.documentType || root.doc.document_type || root.doc.docType || root.doc.kind)) ||
    (root.document && (root.document.type || root.document.documentType || root.document.document_type || root.document.docType || root.document.kind));
  const normalizedType = String(rawType || '').trim().toLowerCase().replace(/[\\s_-]+/g, '');
  const looksLikeInvoice = normalizedType.includes('invoice') || root.invoice || root.invoiceId || root.invoiceNumber || root.invoice_number;
  const looksLikeQuotation = normalizedType.includes('quotation') || normalizedType.includes('quote') || root.quotation || root.quotationId || root.quotationNumber || root.quotation_number;
  const looksLikeReceipt = normalizedType.includes('receipt') || normalizedType.includes('sale') || root.receipt || root.receiptId || root.saleId;
  if (looksLikeInvoice && !looksLikeQuotation) return renderLegacyDocumentPdf(payload, paper);
  if (looksLikeQuotation && !looksLikeInvoice) return renderLegacyDocumentPdf(payload, paper);
  if (looksLikeReceipt) return renderLegacyReceiptPdf(payload, paper);
  throw new Error(\`Unsupported PDF document type: \${String(rawType || '(missing)')}\`);
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = { patchPdfRenderer };
