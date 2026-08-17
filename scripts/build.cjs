'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { patchUserManagementRoutes } = require('./user-management-server.cjs');

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
  const requiredMarkers = [
    'async function renderPdfBuffer(payload, paper)',
    'buildDocumentHtml(opts)',
    'selectDocumentLogoPath(settings, branch)',
    'buildDocumentFooter(settings)'
  ];
  const missing = requiredMarkers.filter((marker) => !source.includes(marker));
  if (missing.length) throw new Error(`Shared branding engine missing from index.cjs: ${missing.join(', ')}`);
}

function patchDocumentDeletionRoutes(source) {
  let patched = source;
  const quotationRoute = 'router11.delete("/quotations/:id", async (req, res) => {';
  if (!patched.includes(quotationRoute)) {
    throw new Error('Document deletion patch: could not locate quotation DELETE route');
  }
  patched = patched.replace(
    quotationRoute,
    'router11.delete("/quotations/:id", requireAuth, requireSuperAdmin, async (req, res) => {'
  );
  const quotationDeleteCheck = '  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  res.sendStatus(204);\n});';
  if (!patched.includes(quotationDeleteCheck)) {
    throw new Error('Document deletion patch: could not locate quotation DELETE body');
  }
  patched = patched.replace(
    quotationDeleteCheck,
    '  if (existing.status === "converted") {\n    res.status(409).json({ error: "Converted quotations cannot be deleted. Delete or void the resulting invoice instead." });\n    return;\n  }\n  const { reason } = req.body ?? {};\n  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  await logAudit(req, { action: "quotation.deleted", entityType: "quotation", entityId: id, description: `Permanently deleted quotation ${existing.quotationNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { quotation: existing.quotationNumber, reason: reason ?? null } });\n  res.sendStatus(204);\n});'
  );

  const invoicePayRoute = 'router12.post("/invoices/:id/pay", async (req, res) => {';
  if (!patched.includes(invoicePayRoute)) {
    throw new Error('Document deletion patch: could not locate invoice payment route');
  }
  const invoiceDeleteRoute = `router12.delete("/invoices/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice || !isBranchInScope(req, invoice.branchId)) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (["partial", "paid"].includes(invoice.status)) {
    res.status(409).json({ error: "Paid or partially paid invoices cannot be permanently deleted. Void or reverse the transaction instead." });
    return;
  }
  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));
  if (payments.length) {
    res.status(409).json({ error: "This invoice has payment records and cannot be permanently deleted." });
    return;
  }
  const { reason } = req.body ?? {};
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  if (invoice.status !== "draft") {
    for (const item of items) {
      const product = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product.length) {
        const { before, after } = await adjustBranchStock(invoice.branchId, item.productId, (b) => b + item.quantity);
        await db.insert(stockMovementsTable).values({ branchId: invoice.branchId, productId: item.productId, type: "adjustment", quantity: item.quantity, quantityBefore: before, quantityAfter: after, reference: invoice.invoiceNumber, notes: `Stock restored after deletion of invoice ${invoice.invoiceNumber}` });
      }
    }
  }
  await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  await logAudit(req, { action: "invoice.deleted", entityType: "invoice", entityId: id, description: `Permanently deleted invoice ${invoice.invoiceNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { invoice: invoice.invoiceNumber, status: invoice.status, reason: reason ?? null } });
  res.sendStatus(204);
});
`;
  patched = patched.replace(invoicePayRoute, invoiceDeleteRoute + invoicePayRoute);
  return patched;
}

function buildRuntimeBundle() {
  const source = fs.readFileSync(sourceBundle, 'utf8');
  verifySharedBrandingEngine(source);
  const withUserManagement = patchUserManagementRoutes(source);
  const patched = patchDocumentDeletionRoutes(withUserManagement);
  fs.writeFileSync(runtimeBundle, patched, 'utf8');
}

const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));

buildRuntimeBundle();

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/user-management.js', 'public/administrator-user-management.js', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/bundle-loader.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs', 'scripts/user-management-server.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt', 'index.runtime.cjs'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('[build] Shared branded document engine preserved; user-management routes patched; document deletion routes patched; deterministic runtime bundle generated at index.runtime.cjs');
