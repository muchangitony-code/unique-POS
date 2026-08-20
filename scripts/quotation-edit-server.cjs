'use strict';

function patchQuotationEditRoutes(source) {
  if (source.includes('quotation.editable.routes.v1')) return source;
  const match = source.match(/\b(router[A-Za-z0-9_$]*)\.post\("\/quotations",\s*async\s*\(req,\s*res\)\s*=>\s*\{/);
  if (!match) throw new Error('Build: quotation POST route not found for edit routes');
  const router = match[1];
  const injected = `
// quotation.editable.routes.v1
${router}.get("/quotations/:id", requireAuth, async (req, res) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid quotation ID" }); return; }
  const [quotation] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!quotation || !isBranchInScope(req, quotation.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; }
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));
  res.json({ ...quotation, items });
});

${router}.patch("/quotations/:id", requireAuth, async (req, res) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid quotation ID" }); return; }
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Quotation not found" }); return; }
  if (existing.status === "converted") { res.status(409).json({ error: "Converted quotations cannot be edited." }); return; }

  const body = req.body ?? {};
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) { res.status(400).json({ error: "A quotation must contain at least one item." }); return; }
  const customerId = body.customer_id == null || body.customer_id === "" ? null : parseInt(body.customer_id, 10);
  if (customerId !== null) {
    if (!Number.isInteger(customerId)) { res.status(400).json({ error: "Invalid customer ID" }); return; }
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    if (!customer || !isBranchInScope(req, customer.branchId)) { res.status(400).json({ error: "Customer is not available in this branch." }); return; }
  }

  const items = rawItems.map((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price ?? item.unitPrice);
    const discount = Number(item.discount || 0);
    const vatRate = Number(item.vat_rate ?? item.vatRate ?? 16);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Invalid quantity on item " + (index + 1));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Invalid unit price on item " + (index + 1));
    if (!Number.isFinite(discount) || discount < 0) throw new Error("Invalid discount on item " + (index + 1));
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new Error("Invalid VAT rate on item " + (index + 1));
    const lineSubtotal = Math.max(0, quantity * unitPrice - discount);
    const lineVat = lineSubtotal * vatRate / 100;
    return { product_id: item.product_id == null || item.product_id === "" ? null : Number(item.product_id), description: String(item.description || "").trim(), quantity, unit_price: unitPrice, discount, vat_rate: vatRate, unit: String(item.unit || "pcs"), lineSubtotal, lineVat };
  });
  if (items.some(item => !item.description)) { res.status(400).json({ error: "Every quotation item needs a description." }); return; }
  const discountAmount = Math.max(0, Number(body.discount_amount || 0));
  if (!Number.isFinite(discountAmount)) { res.status(400).json({ error: "Invalid quotation discount." }); return; }
  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
  const vatAmount = items.reduce((sum, item) => sum + item.lineVat, 0);
  const total = Math.max(0, subtotal - discountAmount + vatAmount);
  const validUntil = body.valid_until ? new Date(body.valid_until) : existing.validUntil;
  if (body.valid_until && Number.isNaN(validUntil.getTime())) { res.status(400).json({ error: "Invalid valid-until date." }); return; }

  try {
    await db.transaction(async (tx) => {
      await tx.update(quotationsTable).set({ customerId, validUntil, notes: String(body.notes || ""), subtotal: subtotal.toFixed(2), discountAmount: discountAmount.toFixed(2), vatAmount: vatAmount.toFixed(2), total: total.toFixed(2), updatedAt: new Date() }).where(eq(quotationsTable.id, id));
      await tx.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));
      await tx.insert(quotationItemsTable).values(items.map(item => ({ quotationId: id, productId: Number.isFinite(item.product_id) && item.product_id > 0 ? item.product_id : null, description: item.description, quantity: item.quantity, unitPrice: item.unit_price.toFixed(2), discount: item.discount.toFixed(2), vatRate: item.vat_rate.toFixed(2), unit: item.unit })));
    });
    await logAudit(req, { action: "quotation.updated", entityType: "quotation", entityId: id, description: "Updated quotation " + existing.quotationNumber, metadata: { quotation: existing.quotationNumber, previousTotal: existing.total, newTotal: total, itemCount: items.length } });
    const [updated] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
    const updatedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id));
    res.json({ ...updated, items: updatedItems });
  } catch (error) {
    console.error("[quotation-edit] update failed", error);
    res.status(400).json({ error: error?.message || "Unable to update quotation." });
  }
});
`;
  return source.slice(0, match.index) + injected + '\n' + source.slice(match.index);
}

module.exports = { patchQuotationEditRoutes };
