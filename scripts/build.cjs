'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { patchUserManagementRoutes } = require('./user-management-server.cjs');

const root = path.resolve(__dirname, '..');
const sourceBundle = path.join(root, 'index.cjs');
const runtimeBundle = path.join(root, 'index.runtime.cjs');
const fontDir = path.join(root, 'assets', 'fonts');
const fonts = [path.join(fontDir, 'DejaVuSans.ttf'), path.join(fontDir, 'DejaVuSans-Bold.ttf')];

function findFunctionEnd(source, start) {
  const open = source.indexOf('{', start); if (open < 0) throw new Error('Build: function opening brace not found');
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
    if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; if (depth === 0) return i + 1; }
  }
  throw new Error('Build: unterminated function');
}

function installPdfEngine(source) {
  const marker = 'async function renderPdfBuffer(payload, paper)'; const start = source.indexOf(marker); if (start < 0) throw new Error('Build: application PDF entrypoint not found'); const end = findFunctionEnd(source, start);
  const replacement = `async function renderPdfBuffer(payload, paper) {
  const { renderDocument } = require('./server/pdf/index.cjs');
  const { renderReceiptDocument } = require('./server/pdf/receipt.cjs');
  const { adaptDocumentPayload } = require('./server/pdf/document-adapter.cjs');
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type === 'invoice' || adapted.type === 'quotation') return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company });
  if (adapted.type === 'receipt') return renderReceiptDocument({ doc: adapted.doc, company: adapted.company, paper: paper === '58mm' ? '58mm' : '80mm' });
  throw new Error('Unsupported PDF document type: ' + adapted.type);
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchDocumentDeletionRoutes(source) {
  let patched = source; const quotationMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.delete\("\/quotations\/:id", async \(req, res\) => \{/); if (!quotationMatch) throw new Error('Build: quotation DELETE route not found'); patched = patched.replace(quotationMatch[0], `${quotationMatch[1]}.delete("/quotations/:id", requireAuth, requireSuperAdmin, async (req, res) => {`);
  const quotationBody = '  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  res.sendStatus(204);\n});'; if (!patched.includes(quotationBody)) throw new Error('Build: quotation DELETE body not found');
  patched = patched.replace(quotationBody, '  if (existing.status === "converted") { res.status(409).json({ error: "Converted quotations cannot be deleted. Delete or void the resulting invoice instead." }); return; }\n  const { reason } = req.body ?? {};\n  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  await logAudit(req, { action: "quotation.deleted", entityType: "quotation", entityId: id, description: `Permanently deleted quotation ${existing.quotationNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { quotation: existing.quotationNumber, reason: reason ?? null } });\n  res.sendStatus(204);\n});');
  const payMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.post\("\/invoices\/:id\/pay",\s*async\s*\(req,\s*res\)\s*=>\s*\{/); if (!payMatch) throw new Error('Build: invoice payment route not found'); const router = payMatch[1];
  const deleteRoute = [
    `${router}.delete("/invoices/:id", requireAuth, requireSuperAdmin, async (req, res) => {`,
    '  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);',
    '  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));',
    '  if (!invoice || !isBranchInScope(req, invoice.branchId)) { res.status(404).json({ error: "Invoice not found" }); return; }',
    '  if (["partial", "paid"].includes(invoice.status)) { res.status(409).json({ error: "Paid or partially paid invoices cannot be permanently deleted. Void or reverse the transaction instead." }); return; }',
    '  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));',
    '  if (payments.length) { res.status(409).json({ error: "This invoice has payment records and cannot be permanently deleted." }); return; }',
    '  const { reason } = req.body ?? {};',
    '  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));',
    '  if (invoice.status !== "draft") { for (const item of items) { const product = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)); if (product.length) { const { before, after } = await adjustBranchStock(invoice.branchId, item.productId, (b) => b + item.quantity); await db.insert(stockMovementsTable).values({ branchId: invoice.branchId, productId: item.productId, type: "adjustment", quantity: item.quantity, quantityBefore: before, quantityAfter: after, reference: invoice.invoiceNumber, notes: `Stock restored after deletion of invoice ${invoice.invoiceNumber}` }); } } }',
    '  await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));',
    '  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));',
    '  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));',
    '  await logAudit(req, { action: "invoice.deleted", entityType: "invoice", entityId: id, description: `Permanently deleted invoice ${invoice.invoiceNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { invoice: invoice.invoiceNumber, status: invoice.status, reason: reason ?? null } });',
    '  res.sendStatus(204);', '});', ''
  ].join('\n');
  return patched.replace(payMatch[0], deleteRoute + payMatch[0]);
}

function patchMpesaRoutes(source) {
  if (source.includes('mpesa_stk_push_initiated')) return source;
  const match = source.match(/\b(router[A-Za-z0-9_$]*)\.get\("\/documents\/:type\/:id\/preview"/); if (!match) throw new Error('Build: document preview router not found for M-Pesa routes');
  const template = path.join(root, 'server', 'services', 'mpesa', 'runtime-routes.cjs'); if (!fs.existsSync(template)) throw new Error(`Build: missing ${template}`);
  const injected = fs.readFileSync(template, 'utf8').replaceAll('__MPESA_ROUTER__', match[1]); return source.slice(0, match.index) + injected + '\n\n' + source.slice(match.index);
}

function buildRuntime() {
  if (!fs.existsSync(sourceBundle)) throw new Error(`Build: missing ${sourceBundle}`); let source = fs.readFileSync(sourceBundle, 'utf8');
  try { source = patchUserManagementRoutes(source); } catch (error) { const message = String(error?.message || error); if (/Express app .*not found|could not locate Express application variable|application listen point not found/i.test(message)) console.warn(`[build] User-management patch skipped: ${message}`); else throw error; }
  source = patchDocumentDeletionRoutes(source); source = installPdfEngine(source); source = patchMpesaRoutes(source); fs.writeFileSync(runtimeBundle, source, 'utf8');
  const runtime = fs.readFileSync(runtimeBundle, 'utf8'); if (!runtime.includes("require('./server/pdf/index.cjs')") || !runtime.includes("require('./server/pdf/document-adapter.cjs')")) throw new Error('Build: authoritative PDF engine missing from runtime bundle');
  for (const stale of ['build-safe.cjs', 'PDF_SVG_LOGO_PATCH', 'renderLegacyDocumentPdf', 'legacyRenderPdfBuffer', 'legacy-adapter.cjs', 'server/pdf/stable.cjs', 'server/pdf/clean.cjs']) if (runtime.includes(stale)) throw new Error(`Build: stale PDF reference remains: ${stale}`);
}

function verifyFiles() {
  const required = ['app.js', 'index.cjs', 'index.runtime.cjs', 'public/index.html', 'public/app.js', 'public/mpesa.js', 'server/document-branding.cjs', 'public/assets/branding/logo.svg', 'public/assets/branding/logo-monochrome.svg', 'server/pdf/index.cjs', 'server/pdf/a4-renderer.cjs', 'server/pdf/receipt.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/document-adapter.cjs', 'server/services/mpesa/runtime-routes.cjs', 'scripts/user-management-server.cjs', 'scripts/pdf-fixtures.js', 'scripts/pdf-receipt-smoke.cjs', 'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt'];
  for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Build: missing required file ${file}`);
  const renderer = fs.readFileSync(path.join(root, 'server/pdf/a4-renderer.cjs'), 'utf8'); if (!renderer.includes("require('../document-branding.cjs')")) throw new Error('Build: A4 renderer is not using shared document branding'); if (renderer.includes('const C = {')) throw new Error('Build: A4 renderer contains a private palette'); if (!renderer.includes('loadLogo(BRAND.logo)')) throw new Error('Build: canonical logo fallback missing');
}

for (const font of fonts) if (!fs.existsSync(font) || !fs.statSync(font).isFile() || fs.statSync(font).size === 0) throw new Error(`Build: invalid PDF font ${font}`);
buildRuntime(); verifyFiles();
for (const file of ['server/document-branding.cjs', 'server/pdf/index.cjs', 'server/pdf/a4-renderer.cjs', 'server/pdf/receipt.cjs', 'server/pdf/schema.cjs', 'server/pdf/document-adapter.cjs', 'scripts/user-management-server.cjs', 'scripts/pdf-fixtures.js', 'index.runtime.cjs']) { const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); }
console.log('[build] authoritative invoice, quotation and receipt PDF engine verified');
