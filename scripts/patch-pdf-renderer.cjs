'use strict';

function findFunctionEnd(source, start) {
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error('PDF renderer patch: function body opening brace not found');
  let depth = 0, quote = null, template = false, lineComment = false, blockComment = false, escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]; const next = source[i + 1];
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
  const original = source.slice(start, end).replace(marker, 'async function legacyRenderPdfBuffer(payload, paper)');
  const replacement = `${original}\n\nasync function renderPdfBuffer(payload, paper) {\n  const requestedType = payload && (payload.type || payload.documentType || (payload.doc && payload.doc.type));\n  const { renderLegacyDocumentPdf, renderLegacyReceiptPdf } = require('./server/pdf/legacy-adapter.cjs');\n  if (requestedType === 'invoice' || requestedType === 'quotation') return renderLegacyDocumentPdf(payload, paper);\n  if (requestedType === 'receipt' || requestedType === 'sale') return renderLegacyReceiptPdf(payload, paper);\n  return legacyRenderPdfBuffer(payload, paper);\n}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = { patchPdfRenderer };
