'use strict';

function findFunctionEnd(source, start) {
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error('PDF renderer patch: function body opening brace not found');
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
  throw new Error('PDF renderer patch: unterminated renderPdfBuffer function');
}

function patchPdfRenderer(source) {
  const marker = 'async function renderPdfBuffer(payload, paper)';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('PDF renderer patch: could not locate renderPdfBuffer');
  const end = findFunctionEnd(source, start);
  const replacement = `async function renderPdfBuffer(payload, paper) {
  const { renderDocument } = require('./server/pdf/index.cjs');
  const { renderReceiptDocument } = require('./server/pdf/receipt.cjs');
  const { adaptDocumentPayload } = require('./server/pdf/document-adapter.cjs');
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type === 'invoice' || adapted.type === 'quotation') {
    return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company });
  }
  if (adapted.type === 'receipt') {
    return renderReceiptDocument({ doc: adapted.doc, company: adapted.company, paper: paper === '58mm' ? '58mm' : '80mm' });
  }
  throw new Error(\`Unsupported PDF document type: \${adapted.type}\`);
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = { patchPdfRenderer };
