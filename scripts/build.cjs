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
  const quotationMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.delete\("\/quotations\/:id", async \(req, res\) => \{/);
  if (!quotationMatch) throw new Error('Document deletion patch: could not locate quotation DELETE route');
  patched = patched.replace(quotationMatch[0], `${quotationMatch[1]}.delete("/quotations/:id", requireAuth, requireSuperAdmin, async (req, res) => {`);
  const quotationDeleteCheck = '  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  res.sendStatus(204);\n});';
  if (!patched.includes(quotationDeleteCheck)) throw new Error('Document deletion patch: could not locate quotation DELETE body');
  patched = patched.replace(quotationDeleteCheck, '  if (existing.status === "converted") {\n    res.status(409).json({ error: "Converted quotations cannot be deleted. Delete or void the resulting invoice instead." });\n    return;\n  }\n  const { reason } = req.body ?? {};\n  await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));\n  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));\n  await logAudit(req, { action: "quotation.deleted", entityType: "quotation", entityId: id, description: `Permanently deleted quotation ${existing.quotationNumber}${reason ? " — Reason: " + reason : ""}`, metadata: { quotation: existing.quotationNumber, reason: reason ?? null } });\n  res.sendStatus(204);\n});');

  const invoicePayMatch = patched.match(/\b(router[A-Za-z0-9_$]*)\.post\("\/invoices\/:id\/pay", async \(req, res\) => \{/);
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
    '  res.sendStatus(204);',
    '});', ''
  ].join('\n');
  patched = patched.replace(invoicePayRoute, invoiceDeleteRoute + invoicePayRoute);
  return patched;
}

function patchMpesaRoutes(source) {
  const match = source.match(/\b(router[A-Za-z0-9_$]*)\.get\("\/documents\/:type\/:id\/preview"/);
  if (!match) throw new Error('M-Pesa patch: could not locate document API router');
  const router = match[1];
  if (source.includes('mpesa_stk_push_initiated')) return source;
  const injected = `

// M-Pesa STK Push integration. Kept in the deterministic runtime bundle so the source index remains the application source of truth.
const mpesaService = require('./server/services/mpesa/index.cjs');
const { sql: mpesaSql } = require('drizzle-orm');
function mpesaUserAllowed(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['cashier','sales_rep','branch_manager','accountant','business_owner','super_admin'].includes(role);
}
function mpesaRows(result) { return result?.rows || result || []; }
function mpesaCallbackMessage(code, desc) {
  const map = { 1032:'The customer cancelled the M-Pesa payment.', 2001:'The customer entered an incorrect M-Pesa PIN.', 1:'The customer’s M-Pesa account has insufficient funds.', 1037:'The M-Pesa request timed out or the customer’s phone could not be reached.' };
  return map[Number(code)] || String(desc || 'M-Pesa payment failed.').slice(0, 240);
}
function mpesaConfigSafe() { return mpesaService.mpesaConfig(process.env); }
async function resolveMpesaCallback(checkoutRequestId, resultCode, resultDesc, callbackBody) {
  return db.transaction(async (tx) => {
    const found = mpesaRows(await tx.execute(mpesaSql`SELECT * FROM mpesa_transactions WHERE checkout_request_id = ${checkoutRequestId} FOR UPDATE`))[0];
    if (!found) return { stored:false, status:'unknown' };
    if (found.status === 'success' || found.status === 'failed' || found.status === 'cancelled' || found.status === 'timeout') return { stored:true, status:found.status };
    const metadata = callbackBody?.Body?.stkCallback?.CallbackMetadata?.Item || [];
    const item = (name) => metadata.find(x => x?.Name === name)?.Value;
    const code = Number(resultCode);
    if (code !== 0) {
      const status = code === 1032 ? 'cancelled' : code === 1037 ? 'timeout' : 'failed';
      await tx.execute(mpesaSql`UPDATE mpesa_transactions SET status=${status}, result_code=${code}, result_desc=${String(resultDesc || '').slice(0,500)}, raw_callback=${JSON.stringify(callbackBody)}::jsonb, updated_at=now() WHERE id=${found.id}`);
      return { stored:true, status };
    }
    const receipt = item('MpesaReceiptNumber');
    const txDateRaw = item('TransactionDate');
    const paid = Number(found.amount_kes);
    if (!receipt) throw new Error('Successful M-Pesa callback did not contain a receipt number.');
    const invoiceRows = mpesaRows(await tx.execute(mpesaSql`SELECT id, total, amount_paid, balance_due, status, invoice_number FROM invoices WHERE id=${found.invoice_id} FOR UPDATE`));
    const invoice = invoiceRows[0];
    if (!invoice) throw new Error('Invoice for M-Pesa transaction no longer exists.');
    const balance = Number(invoice.balance_due || 0);
    if (balance <= 0) {
      await tx.execute(mpesaSql`UPDATE mpesa_transactions SET status='success', result_code=0, result_desc=${String(resultDesc || 'Success').slice(0,500)}, mpesa_receipt_number=${String(receipt).slice(0,64)}, transaction_date=${txDateRaw ? String(txDateRaw) : null}, raw_callback=${JSON.stringify(callbackBody)}::jsonb, updated_at=now() WHERE id=${found.id}`);
      return { stored:true, status:'success', receipt };
    }
    const credit = Math.min(paid, balance);
    const duplicate = mpesaRows(await tx.execute(mpesaSql`SELECT id FROM invoice_payments WHERE reference=${String(receipt).slice(0,255)} LIMIT 1`))[0];
    if (!duplicate) await tx.execute(mpesaSql`INSERT INTO invoice_payments (invoice_id, amount, method, reference, notes, created_at) VALUES (${found.invoice_id}, ${credit}, 'mpesa', ${String(receipt).slice(0,255)}, ${'Daraja STK Push checkout ' + checkoutRequestId}, now())`);
    const newPaid = Number(invoice.amount_paid || 0) + (duplicate ? 0 : credit);
    const newBalance = Math.max(0, Number(invoice.total || 0) - newPaid);
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';
    await tx.execute(mpesaSql`UPDATE invoices SET amount_paid=${newPaid}, balance_due=${newBalance}, status=${newStatus} WHERE id=${found.invoice_id}`);
    await tx.execute(mpesaSql`UPDATE mpesa_transactions SET status='success', result_code=0, result_desc=${String(resultDesc || 'Success').slice(0,500)}, mpesa_receipt_number=${String(receipt).slice(0,64)}, transaction_date=${txDateRaw ? String(txDateRaw) : null}, raw_callback=${JSON.stringify(callbackBody)}::jsonb, updated_at=now() WHERE id=${found.id}`);
    return { stored:true, status:'success', receipt, amount:credit };
  });
}

${router}.post("/invoices/:id/mpesa/stk-push", requireAuth, async (req, res) => {
  if (!mpesaUserAllowed(req)) return res.status(403).json({ error:'You are not authorised to request M-Pesa payments.' });
  try {
    const id = Number(req.params.id);
    const invoiceRows = mpesaRows(await db.execute(mpesaSql`SELECT id, invoice_number, total, amount_paid, balance_due, status, branch_id FROM invoices WHERE id=${id} LIMIT 1`));
    const invoice = invoiceRows[0];
    if (!invoice || !isBranchInScope(req, invoice.branch_id ?? invoice.branchId)) return res.status(404).json({ error:'Invoice not found.' });
    const balance = Math.max(0, Number(invoice.total || 0) - Number(invoice.amount_paid || 0));
    if (!['draft','sent','partial','overdue'].includes(String(invoice.status)) || balance <= 0) return res.status(409).json({ error:'This invoice has no payable balance.' });
    const config = mpesaConfigSafe();
    const phone = mpesaService.normalizeMpesaPhone(req.body?.phone);
    const pending = mpesaRows(await db.execute(mpesaSql`SELECT checkout_request_id FROM mpesa_transactions WHERE invoice_id=${id} AND status='pending' AND created_at > now() - interval '60 seconds' ORDER BY created_at DESC LIMIT 1`))[0];
    if (pending) return res.status(409).json({ error:'A payment prompt is already pending for this invoice. Please wait before sending another.', checkoutRequestId:pending.checkout_request_id, status:'pending' });
    const result = await mpesaService.initiateStkPush(config, { phone, amountKes:Math.trunc(balance), invoiceNumber:invoice.invoice_number });
    await db.execute(mpesaSql`INSERT INTO mpesa_transactions (invoice_id, phone, amount_kes, merchant_request_id, checkout_request_id, status) VALUES (${id}, ${phone}, ${Math.trunc(balance)}, ${result.MerchantRequestID || null}, ${result.CheckoutRequestID}, 'pending')`);
    logger.info({ event:'mpesa_stk_push_initiated', invoiceId:id, checkoutRequestId:result.CheckoutRequestID, amount:Math.trunc(balance), environment:config.env, userId:req.user?.id }, 'M-Pesa STK Push initiated');
    return res.json({ checkoutRequestId:result.CheckoutRequestID, status:'pending', maskedPhone:mpesaService.maskMpesaPhone(phone) });
  } catch (error) { logger.error({ err:error, event:'mpesa_stk_push_failed' }, 'M-Pesa STK Push failed'); return res.status(400).json({ error:error.message || 'Unable to initiate M-Pesa payment.' }); }
});

${router}.post("/public/mpesa/callback", async (req, res) => {
  try {
    const body = req.body;
    const callback = body?.Body?.stkCallback;
    if (!callback || typeof callback.CheckoutRequestID !== 'string' || !Number.isInteger(Number(callback.ResultCode)) || typeof callback.ResultDesc !== 'string') throw new Error('Invalid M-Pesa callback payload.');
    logger.info({ event:'mpesa_callback_received', checkoutRequestId:callback.CheckoutRequestID, resultCode:Number(callback.ResultCode) }, 'M-Pesa callback received');
    const resolved = await resolveMpesaCallback(callback.CheckoutRequestID, Number(callback.ResultCode), callback.ResultDesc, body);
    logger.info({ event:'mpesa_callback_resolved', checkoutRequestId:callback.CheckoutRequestID, resultCode:Number(callback.ResultCode), status:resolved.status }, 'M-Pesa callback resolved');
  } catch (error) { logger.error({ err:error, event:'mpesa_callback_processing_error' }, 'M-Pesa callback processing error'); }
  return res.status(200).json({ ResultCode:0, ResultDesc:'Accepted' });
});

${router}.get("/invoices/:id/mpesa/status", requireAuth, async (req, res) => {
  if (!mpesaUserAllowed(req)) return res.status(403).json({ error:'You are not authorised to view M-Pesa payment status.' });
  const id = Number(req.params.id); const checkout = String(req.query.checkoutRequestId || '');
  if (!checkout) return res.status(400).json({ error:'checkoutRequestId is required.' });
  const rows = mpesaRows(await db.execute(mpesaSql`SELECT checkout_request_id, status, amount_kes, result_code, result_desc, mpesa_receipt_number, invoice_id FROM mpesa_transactions WHERE invoice_id=${id} AND checkout_request_id=${checkout} LIMIT 1`));
  const tx = rows[0]; if (!tx) return res.status(404).json({ error:'M-Pesa transaction not found.' });
  if (!isBranchInScope(req, (await db.execute(mpesaSql`SELECT branch_id FROM invoices WHERE id=${id} LIMIT 1`)).rows?.[0]?.branch_id)) return res.status(404).json({ error:'Invoice not found.' });
  const out = { checkoutRequestId:tx.checkout_request_id, status:tx.status };
  if (tx.status === 'success') { out.amount=Number(tx.amount_kes); out.mpesaReceiptNumber=tx.mpesa_receipt_number; }
  else if (tx.status !== 'pending') { out.resultCode=tx.result_code; out.message=mpesaCallbackMessage(tx.result_code, tx.result_desc); }
  return res.json(out);
});

${router}.post("/invoices/:id/mpesa/query", requireAuth, async (req, res) => {
  if (!mpesaUserAllowed(req)) return res.status(403).json({ error:'You are not authorised to query M-Pesa payments.' });
  try {
    const id=Number(req.params.id), checkout=String(req.body?.checkoutRequestId || '');
    const rows=mpesaRows(await db.execute(mpesaSql`SELECT checkout_request_id FROM mpesa_transactions WHERE invoice_id=${id} AND checkout_request_id=${checkout} AND status='pending' LIMIT 1`));
    if (!rows[0]) return res.status(404).json({ error:'Pending M-Pesa transaction not found.' });
    const result=await mpesaService.queryStkPush(mpesaConfigSafe(), { checkoutRequestId:checkout });
    return res.json({ checkoutRequestId:checkout, responseCode:result.ResponseCode ?? null, responseDescription:result.ResponseDescription ?? null, resultCode:result.ResultCode ?? null, resultDesc:result.ResultDesc ?? null });
  } catch (error) { return res.status(400).json({ error:error.message || 'M-Pesa query failed.' }); }
});
`;
  return source.slice(0, match.index) + injected + source.slice(match.index);
}

function buildRuntimeBundle() {
  const source = fs.readFileSync(sourceBundle, 'utf8');
  verifySharedBrandingEngine(source);
  const withUserManagement = patchUserManagementRoutes(source);
  const withDocumentDeletion = patchDocumentDeletionRoutes(withUserManagement);
  const patched = patchMpesaRoutes(withDocumentDeletion);
  fs.writeFileSync(runtimeBundle, patched, 'utf8');
}

const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));

buildRuntimeBundle();

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/mpesa.js', 'public/user-management.js', 'public/administrator-user-management.js', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/bundle-loader.cjs',
  'server/services/mpesa/index.cjs', 'server/services/mpesa/auth.cjs', 'server/services/mpesa/stkPush.cjs', 'server/services/mpesa/query.cjs', 'server/services/mpesa/phone.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs', 'scripts/user-management-server.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt', 'index.runtime.cjs'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('[build] Shared branded document engine preserved; user-management routes patched; document deletion routes patched; M-Pesa routes patched; deterministic runtime bundle generated at index.runtime.cjs');
