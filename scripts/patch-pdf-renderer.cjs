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
  const rawType = payload && (payload.type || payload.documentType || payload.document_type || (payload.doc && (payload.doc.type || payload.doc.documentType || payload.doc.document_type)) || (payload.document && (payload.document.type || payload.document.documentType || payload.document.document_type)));
  const normalizedType = String(rawType || '').trim().toLowerCase().replace(/[\\s_-]+/g, '');
  if (['invoice', 'invoicedocument', 'invoicepdf'].includes(normalizedType)) return renderLegacyDocumentPdf(payload, paper);
  if (['quotation', 'quote', 'quotationdocument', 'quotationpdf', 'quotepdf'].includes(normalizedType)) return renderLegacyDocumentPdf(payload, paper);
  if (['receipt', 'sale', 'saledocument', 'receiptpdf'].includes(normalizedType)) return renderLegacyReceiptPdf(payload, paper);
  throw new Error(\`Unsupported PDF document type: \${String(rawType || '(missing)')}\`);
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = { patchPdfRenderer };
