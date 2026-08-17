'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { patchUserManagementRoutes } = require('./user-management-server.cjs');
const { patchPdfRenderer } = require('./patch-pdf-renderer.cjs');

const root = path.resolve(__dirname, '..');
const fontDir = path.join(root, 'assets', 'fonts');
const regular = path.join(fontDir, 'DejaVuSans.ttf');
const bold = path.join(fontDir, 'DejaVuSans-Bold.ttf');
const sourceBundle = path.join(root, 'index.cjs');
const runtimeBundle = path.join(root, 'index.runtime.cjs');

for (const file of [regular, bold]) {
  if (!fs.existsSync(file)) throw new Error(`Missing PDF font: ${file}`);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Invalid PDF font: ${file}`);
}
if (!fs.existsSync(sourceBundle)) throw new Error(`Missing application bundle: ${sourceBundle}`);

function verifySharedBrandingEngine(source) {
  const requiredMarkers = ['async function renderPdfBuffer(payload, paper)','buildDocumentHtml(opts)','selectDocumentLogoPath(settings, branch)','buildDocumentFooter(settings)'];
  const missing = requiredMarkers.filter((marker) => !source.includes(marker));
  if (missing.length) throw new Error(`Shared branding engine missing from index.cjs: ${missing.join(', ')}`);
}

function patchDocumentDeletionRoutes(source) {
  let patched = source;
  const quotationMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.delete\("\/quotations\/:id", async \(req, res\) => \{/);
  if (!quotationMatch) throw new Error('Document deletion patch: could not locate quotation DELETE route');
  patched = patched.replace(quotationMatch[0], `${quotationMatch[1]}.delete("/quotations/:id", requireAuth, requireSuperAdmin, async (req, res) => {`);
  const quotationDeleteCheck = '  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  res.sendStatus(204);\n});';
  if (!patched.includes(quotationDeleteCheck)) throw new Error('Document deletion patch: could not locate quotation DELETE body');
  patched = patched.replace(quotationDeleteCheck, '  if (existing.status === "converted") {\n    res.status(409).json({ error: "Converted quotations cannot be deleted. Delete or void the resulting invoice instead." });\n    return;\n  }\n  const { reason } = req.body ?? {};\n  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  await logAudit(req, { action: "quotation.deleted", entityType: "quotation", entityId: id, description: `Permanently deleted quotation ${existing.quotationNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { quotation: existing.quotationNumber, reason: reason ?? null } });\n  res.sendStatus(204);\n});');
  const invoicePayMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.post\("\/invoices\/:id\/pay", async \(req, res) => \{/);
  if (!invoicePayMatch) throw new Error('Document deletion patch: could not locate invoice payment route');
  const invoiceRouter = invoicePayMatch[1];
  const invoicePayRoute = invoicePayMatch[0];
  const invoiceDeleteRoute = [
    `${invoiceRouter}.delete("/invoices/:id", requireAuth, requireSuperAdmin, async (req, res) => {`,
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
  return patched.replace(invoicePayRoute, invoiceDeleteRoute + invoicePayRoute);
}

function patchMpesaRoutes(source) {
  if (source.includes('mpesa_stk_push_initiated')) return source;
  const match = source.match(/\b(router[A-Za-z0-9_$]*)\.get\("\/documents\/:type\/:id\/preview"/);
  if (!match) throw new Error('M-Pesa patch: could not locate document API router');
  const routeTemplate = path.join(root, 'server', 'services', 'mpesa', 'runtime-routes.cjs');
  if (!fs.existsSync(routeTemplate)) throw new Error(`Missing M-Pesa runtime routes: ${routeTemplate}`);
  const injected = fs.readFileSync(routeTemplate, 'utf8').replaceAll('__MPESA_ROUTER__', match[1]);
  return source.slice(0, match.index) + injected + '\n\n' + source.slice(match.index);
}

function buildRuntimeBundle() {
  const source = fs.readFileSync(sourceBundle, 'utf8');
  verifySharedBrandingEngine(source);

  // The bundled Express bootstrap is generated code and can change shape between
  // builds. User-management injection is optional when the target bundle does not
  // expose a patchable Express application variable; never let that auxiliary patch
  // prevent the production PDF renderer from being deployed.
  let withUserManagement = source;
  try {
    withUserManagement = patchUserManagementRoutes(source);
  } catch (error) {
    const message = String(error && error.message || error);
    if (/Express app (not found|not found)|could not locate Express application variable|application listen point not found/i.test(message)) {
      console.warn(`[build] User-management runtime patch skipped: ${message}`);
    } else {
      throw error;
    }
  }

  const withDocumentDeletion = patchDocumentDeletionRoutes(withUserManagement);
  const withPdfRenderer = patchPdfRenderer(withDocumentDeletion);
  const patched = patchMpesaRoutes(withPdfRenderer);
  fs.writeFileSync(runtimeBundle, patched, 'utf8');

  const runtime = fs.readFileSync(runtimeBundle, 'utf8');
  if (!runtime.includes('USER_MANAGEMENT_PATCH_V2') && withUserManagement !== source) {
    throw new Error('Build verification: user-management patch was expected but is absent from runtime bundle');
  }
  if (!runtime.includes('legacyRenderPdfBuffer') || !runtime.includes('renderLegacyDocumentPdf')) {
    throw new Error('Build verification: stable PDF renderer was not installed in runtime bundle');
  }
}

const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));
buildRuntimeBundle();

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/mpesa.js', 'public/user-management.js', 'public/administrator-user-management.js', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/stable.cjs', 'server/pdf/receipt.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/bundle-loader.cjs', 'server/pdf/legacy-adapter.cjs',
  'server/services/mpesa/index.cjs', 'server/services/mpesa/auth.cjs', 'server/services/mpesa/stkPush.cjs', 'server/services/mpesa/query.cjs', 'server/services/mpesa/phone.cjs', 'server/services/mpesa/runtime-routes.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs', 'scripts/user-management-server.cjs', 'scripts/patch-pdf-renderer.cjs', 'scripts/pdf-fixtures.js', 'scripts/pdf-receipt-smoke.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt', 'index.runtime.cjs'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('[build] Stable receipt, invoice and quotation PDF renderers installed; shared branding engine preserved; user-management routes patched when supported; document deletion routes patched; M-Pesa routes patched; deterministic runtime bundle generated at index.runtime.cjs');