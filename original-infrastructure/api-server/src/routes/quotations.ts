import { Router, type IRouter } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, quotationsTable, quotationItemsTable, invoicesTable, invoiceItemsTable, customersTable, productsTable, stockMovementsTable } from "@workspace/db";
import { nextDocumentNumber } from "../lib/doc-numbers";
import { computeDocumentTotals, type LineItemInput } from "../lib/document-totals";
import { logAudit } from "../lib/audit";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { applyStockDelta, InsufficientStockError } from "../lib/stock";

const router: IRouter = Router();

async function formatQuotation(quotation: typeof quotationsTable.$inferSelect) {
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, quotation.id));
  const productIds = items.map((i) => i.productId).filter((id): id is number => id != null);
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  let customerName: string | null = null;
  if (quotation.customerId) {
    const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, quotation.customerId));
    customerName = c?.name ?? null;
  }
  return { id: quotation.id, quotation_number: quotation.quotationNumber, branch_id: quotation.branchId, customer_id: quotation.customerId, customer_name: customerName, items: items.map((i) => ({ id: i.id, product_id: i.productId, product_name: i.productId ? (productMap[i.productId] ?? "Unknown") : null, description: i.description, unit: i.unit, quantity: i.quantity, unit_price: Number(i.unitPrice), discount: Number(i.discount), vat_rate: Number(i.vatRate), total: Number(i.total) })), subtotal: Number(quotation.subtotal), discount_amount: Number(quotation.discountAmount), tax_amount: Number(quotation.taxAmount), total: Number(quotation.total), status: quotation.status, notes: quotation.notes, delivery_time: quotation.deliveryTime, warranty: quotation.warranty, payment_terms: quotation.paymentTerms, valid_until: quotation.validUntil, created_at: quotation.createdAt };
}

router.get("/quotations", async (req, res): Promise<void> => {
  const { customer_id, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10)); const l = Math.min(200, parseInt(limit, 10)); const offset = (p - 1) * l;
  const conditions = []; if (customer_id) conditions.push(eq(quotationsTable.customerId, parseInt(customer_id, 10))); if (status) conditions.push(sql`${quotationsTable.status} = ${status}`);
  const bc = branchCondition(quotationsTable.branchId, req); if (bc) conditions.push(bc); const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(quotationsTable).where(where);
  const rows = await db.select().from(quotationsTable).where(where).orderBy(sql`${quotationsTable.createdAt} desc`).limit(l).offset(offset);
  res.json({ data: await Promise.all(rows.map(formatQuotation)), total: Number(count), page: p, limit: l });
});

router.post("/quotations", async (req, res): Promise<void> => {
  const { customer_id, items, notes, valid_until, delivery_time, warranty, payment_terms, discount_amount, status } = req.body;
  if (!items?.length) { res.status(400).json({ error: "items required" }); return; }
  const { processedItems, subtotal, taxAmount, discountAmount, total } = computeDocumentTotals(items as LineItemInput[], Number(discount_amount ?? 0));
  const branchId = await resolveWriteBranchId(req, req.body.branch_id != null ? Number(req.body.branch_id) : undefined);
  const quotationNumber = await nextDocumentNumber("quotation");
  const [quotation] = await db.insert(quotationsTable).values({ quotationNumber, branchId, customerId: customer_id ?? null, subtotal: subtotal.toString(), discountAmount: discountAmount.toString(), taxAmount: taxAmount.toString(), total: total.toString(), status: status === "sent" ? "sent" : "draft", notes, validUntil: valid_until || null, deliveryTime: delivery_time ?? null, warranty: warranty ?? null, paymentTerms: payment_terms ?? null }).returning();
  for (const item of processedItems) await db.insert(quotationItemsTable).values({ quotationId: quotation.id, productId: item.product_id ?? null, description: item.description ?? null, unit: item.unit ?? null, quantity: item.quantity, unitPrice: item.unit_price.toString(), discount: item.discount.toString(), vatRate: item.vat_rate.toString(), total: item.total.toString() });
  await logAudit(req, { action: "quotation.created", entityType: "quotation", entityId: quotation.id, description: `Created quotation ${quotationNumber} — KES ${total.toLocaleString()}` });
  res.status(201).json(await formatQuotation(quotation));
});

router.get("/quotations/:id", async (req, res): Promise<void> => { const id = parseInt(String(req.params.id), 10); const [q] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)); if (!q || !isBranchInScope(req, q.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; } res.json(await formatQuotation(q)); });
router.patch("/quotations/:id", async (req, res): Promise<void> => { const id = parseInt(String(req.params.id), 10); const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)); if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; } const x = req.body; const [q] = await db.update(quotationsTable).set({ customerId: x.customer_id, status: x.status, notes: x.notes, validUntil: x.valid_until, deliveryTime: x.delivery_time, warranty: x.warranty, paymentTerms: x.payment_terms }).where(eq(quotationsTable.id, id)).returning(); res.json(await formatQuotation(q)); });
router.delete("/quotations/:id", async (req, res): Promise<void> => { const id = parseInt(String(req.params.id), 10); const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)); if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; } await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id)); await db.delete(quotationsTable).where(eq(quotationsTable.id, id)); res.sendStatus(204); });

router.post("/quotations/:id/convert", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10); const [q] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)); if (!q || !isBranchInScope(req, q.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; } if (q.status === "converted") { res.status(409).json({ error: "Quotation already converted" }); return; }
  const invoiceNumber = await nextDocumentNumber("invoice");
  try { const result = await db.transaction(async (tx) => { const claimed = await tx.update(quotationsTable).set({ status: "converted" }).where(and(eq(quotationsTable.id, id), sql`${quotationsTable.status} <> 'converted'`)).returning(); if (!claimed.length) return null; const qItems = await tx.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id)); const deducted: { product_id: number; quantity: number; before: number; after: number }[] = [];
    for (const item of qItems) { if (item.productId == null) continue; const r = await applyStockDelta(q.branchId, item.productId, -item.quantity, {}, tx); if (!r.ok) throw new InsufficientStockError(item.productId, r.before); deducted.push({ product_id: item.productId, quantity: item.quantity, before: r.before, after: r.after }); }
    const [inv] = await tx.insert(invoicesTable).values({ invoiceNumber, branchId: q.branchId, customerId: q.customerId, subtotal: q.subtotal, discountAmount: q.discountAmount, taxAmount: q.taxAmount, total: q.total, balanceDue: q.total, status: "sent", notes: q.notes }).returning();
    for (const item of qItems) { await tx.insert(invoiceItemsTable).values({ invoiceId: inv.id, productId: item.productId, description: item.description, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, vatRate: item.vatRate, total: item.total }); if (item.productId != null) { const d = deducted.find((x) => x.product_id === item.productId); if (d) await tx.insert(stockMovementsTable).values({ branchId: q.branchId, productId: item.productId, type: "sale", quantity: -item.quantity, quantityBefore: d.before, quantityAfter: d.after, reference: invoiceNumber, notes: `Invoice from ${q.quotationNumber}` }); } }
    if (q.customerId && Number(inv.total) > 0) await tx.update(customersTable).set({ balance: sql`${customersTable.balance} + ${Number(inv.total)}` }).where(eq(customersTable.id, q.customerId)); return inv; });
    if (!result) { res.status(409).json({ error: "Quotation already converted" }); return; } await logAudit(req, { action: "quotation.converted", entityType: "invoice", entityId: result.id, description: `Converted ${q.quotationNumber} to invoice ${invoiceNumber}` }); res.status(201).json({ id: result.id, invoice_number: result.invoiceNumber, total: Number(result.total), amount_paid: 0, balance_due: Number(result.balanceDue), status: result.status });
  } catch (err) { if (err instanceof InsufficientStockError) { const [p] = await db.select({ name: productsTable.productName }).from(productsTable).where(eq(productsTable.id, err.productId)); res.status(409).json({ error: `Insufficient stock for "${p?.name ?? `product #${err.productId}`}" — only ${err.available} available` }); return; } throw err; }
});
export default router;
