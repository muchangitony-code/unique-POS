'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { destroyContaminatedV3DataOnce } = require('../inventory-v3-destructive-cutover.cjs');

const RUNTIME_MOUNT_MARKER = 'UNIQUEPOS_RUNTIME_MOUNTS_INVENTORY_V3';

function findExpressAppDeclaration(source) {
  for (const pattern of [
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)\s*;?/m,
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)\s*;?/m
  ]) {
    const match = pattern.exec(source);
    if (match) return { appVar: match[1], end: match.index + match[0].length };
  }
  return null;
}

function applyQuotationPdfFixes(source) {
  const replacements = [
    [',\n        reference: String(invoice.status || "sent")', ''],
    [',\n        reference: String(quotation.status || "draft")', ''],
    ['doc.text(`KRA PIN: ${data.taxPin || "—"}   VAT: ${data.vatNumber || "—"}`, left + 104, doc.y + 2, { width: 255 });', 'doc.text(`KRA PIN: ${data.taxPin || "—"}${data.vatNumber ? `   VAT: ${data.vatNumber}` : ""}`, left + 104, doc.y + 2, { width: 255 });'],
    ['      doc.y += 18;\n      const notesX = left;', '      doc.y += 18;\n      ensurePageSpace(168);\n      const notesX = left;'],
    ['ensurePageSpace(120, drawTableHeader);', 'ensurePageSpace(120);'],
    ['ensurePageSpace(60, drawTableHeader);', 'ensurePageSpace(60);'],
    ['            doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(lbl, left + 12, pyRow, { width: payCardW / 2 - 12 });\n            doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.5).text(val, left + payCardW / 2, pyRow, { width: payCardW / 2 - 12, align: "right" });\n            pyRow += 14;', '            const fieldW = payCardW / 2 - 12;\n            doc.font("Helvetica-Bold").fontSize(8.5);\n            const rowH = Math.max(14, doc.heightOfString(String(val), { width: fieldW, align: "right" }) + 2);\n            doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(lbl, left + 12, pyRow, { width: fieldW });\n            doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.5).text(val, left + payCardW / 2, pyRow, { width: fieldW, align: "right" });\n            pyRow += rowH;'],
    ['            doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(lbl, bankX + 12, byRow, { width: payCardW / 2 - 12 });\n            doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.5).text(val, bankX + payCardW / 2, byRow, { width: payCardW / 2 - 12, align: "right" });\n            byRow += 14;', '            const fieldW = payCardW / 2 - 12;\n            doc.font("Helvetica-Bold").fontSize(8.5);\n            const rowH = Math.max(14, doc.heightOfString(String(val), { width: fieldW, align: "right" }) + 2);\n            doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(lbl, bankX + 12, byRow, { width: fieldW });\n            doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.5).text(val, bankX + payCardW / 2, byRow, { width: fieldW, align: "right" });\n            byRow += rowH;']
  ];

  for (const [from, to] of replacements) {
    if (source.includes(to) && !source.includes(from)) continue;
    if (!source.includes(from)) {
      throw new Error(`Quotation PDF fix anchor not found: ${from.slice(0, 80)}`);
    }
    source = source.replace(from, to);
  }

  return source;
}

function prepareRuntimeSource(filename) {
  let source = fs.readFileSync(filename, 'utf8');

  if (!source.includes(RUNTIME_MOUNT_MARKER)) {
    source = applyQuotationPdfFixes(source);

    const declaration = findExpressAppDeclaration(source);
    if (!declaration) {
      throw new Error('Runtime integration: Express application declaration not found.');
    }

    const { appVar, end } = declaration;
    const code = `
/* ${RUNTIME_MOUNT_MARKER} */
(() => {
  const { mountInventoryV3 } = require('./server/inventory-v3.cjs');
  ${appVar}.use((req,res,next)=>{if(req.body!==undefined||!['POST','PUT','PATCH'].includes(req.method))return next();const type=String(req.headers['content-type']||'').toLowerCase();if(!type.includes('application/json'))return next();let raw='';req.setEncoding('utf8');req.on('data',chunk=>{raw+=chunk;if(raw.length>10485760){res.status(413).json({error:'Request too large'});req.destroy();}});req.on('end',()=>{if(res.headersSent)return;try{req.body=raw?JSON.parse(raw):{};next();}catch(_err){res.status(400).json({error:'Invalid JSON request body'});}});req.on('error',next);});
  ${appVar}.get('/api/healthz',(_req,res)=>res.status(200).json({status:'ok',ok:true,service:'unique-pos',inventory:'v3'}));
  mountInventoryV3(${appVar});
})();
`;
    source = source.slice(0, end) + code + source.slice(end);
  }

  return source;
}

function isRootPdfRendererImport(request, parent, sourceFilename) {
  if (!parent || path.resolve(parent.filename || '') !== path.resolve(sourceFilename)) {
    return false;
  }

  const raw = String(request || '').replace(/\\/g, '/');
  return raw === './server/pdf/a4-renderer' ||
    raw === './server/pdf/a4-renderer.cjs' ||
    raw.endsWith('/server/pdf/a4-renderer') ||
    raw.endsWith('/server/pdf/a4-renderer.cjs');
}

async function loadIndex() {
  const wiped = await destroyContaminatedV3DataOnce();
  if (wiped) console.log('[inventory-v3] destructive clean cutover completed');

  const sourceFilename = path.join(__dirname, '..', '..', 'index.cjs');
  const runtimeFilename = path.join(__dirname, '..', '..', 'index.runtime.cjs');

  try {
    if (fs.existsSync(runtimeFilename)) fs.unlinkSync(runtimeFilename);
  } catch (_) {}

  const source = prepareRuntimeSource(sourceFilename);
  const runtimeModule = new Module(sourceFilename, module);
  runtimeModule.filename = sourceFilename;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(sourceFilename));

  const quotationFacade = require('./quotation-aware-renderer.cjs');
  const originalLoad = Module._load;

  Module._load = function (request, parent, isMain) {
    if (isRootPdfRendererImport(request, parent, sourceFilename)) {
      return quotationFacade;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    runtimeModule._compile(source, sourceFilename);
  } finally {
    Module._load = originalLoad;
  }

  return runtimeModule.exports;
}

module.exports = {
  loadIndex,
  prepareRuntimeSource,
  isRootPdfRendererImport,
  applyQuotationPdfFixes
};
