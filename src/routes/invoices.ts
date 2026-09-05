import { Router, type IRouter } from "express";
import { logAudit } from "../lib/audit";
import { requireRole } from "../lib/permissions";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, invoicePaymentsTable, customersTable, productsTable, stockMovementsTable } from "@workspace/db";
import { nextDocumentNumber } from "../lib/doc-numbers";
import { computeDocumentTotals, type LineItemInput } from "../lib/document-totals";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { applyStockDelta, InsufficientStockError } from "../lib/stock";

const router: IRouter = Router();

async function formatInvoice(invoice: typeof invoicesTable.$inferSelect) {
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
  const productIds = items.map((i) => i.productId);
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  let customerName: string | null = null;
  if (invoice.customerId) {
    const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, invoice.customerId));
    customerName = c?.name ?? null;
  }
  return {
    id: invoice.id, invoice_number: invoice.invoiceNumber, branch_id: invoice.branchId,
    customer_id: invoice.customerId, customer_name: customerName,
    items: items.map((i) => ({ id: i.id, product_id: i.productId, product_name: productMap[i.productId] ?? "Unknown", description: i.description, unit: i.unit, quantity: i.quantity, unit_price: Number(i.unitPrice), discount: Number(i.discount), vat_rate: Number(i.vatRate), total: Number(i.total) })),
    subtotal: Number(invoice.subtotal), discount_amount: Number(invoice.discountAmount), tax_amount: Number(invoice.taxAmount), total: Number(invoice.total),
    amount_paid: Number(invoice.amountPaid), balance_due: Number(invoice.balanceDue),
    status: invoice.status, due_date: invoice.dueDate, notes: invoice.notes, created_at: invoice.createdAt,
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  const { customer_id, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const conditions = [];
  if (customer_id) conditions.push(eq(invoicesTable.customerId, parseInt(customer_id, 10)));
  if (status) conditions.push(sql`${invoicesTable.status} = ${status}`);
  const bc = branchCondition(invoicesTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(invoicesTable).where(where);
  const rows = await db.select().from(invoicesTable).where(where).orderBy(sql`${invoicesTable.createdAt} desc`).limit(l).offset(offset);
  const data = await Promise.all(rows.map(formatInvoice));
  res.json({ data, total: Number(count), page: p, limit: l });
});

router.post("/invoices", async (req, res): Promise<void> => {
  const { customer_id, items, due_date, notes, discount_amount, status } = req.body;
  if (!items?.length) { res.status(400).json({ error: "items required" }); return; }
  const { processedItems, subtotal, taxAmount, discountAmount, total } = computeDocumentTotals(items as LineItemInput[], Number(discount_amount ?? 0));
  const branchId = await resolveWriteBranchId(req, req.body.branch_id != null ? Number(req.body.branch_id) : undefined);
  const invoiceNumber = await nextDocumentNumber("invoice");
  const invStatus = status === "draft" ? "draft" : "sent";
  let invoice: typeof invoicesTable.$inferSelect;
  try {
    invoice = await db.transaction(async (tx) => {
      // Non-draft invoices commit stock — deduct atomically; the transaction rolls back everything on failure.
      const deducted: { product_id: number; quantity: number; before: number; after: number }[] = [];
      if (invStatus !== "draft") {
        for (const item of processedItems) {
          if (!item.product_id) continue;
          const result = await applyStockDelta(branchId, item.product_id, -item.quantity, {}, tx);
          if (!result.ok) throw new InsufficientStockError(item.product_id, result.before);
          deducted.push({ product_id: item.product_id, quantity: item.quantity, before: result.before, after: result.after });
        }
      }
      const [inv] = await tx.insert(invoicesTable).values({
        invoiceNumber, branchId, customerId: customer_id ?? null,
        subtotal: subtotal.toString(), discountAmount: discountAmount.toString(), taxAmount: taxAmount.toString(), total: total.toString(), balanceDue: total.toString(),
        status: invStatus, dueDate: due_date || null, notes,
      }).returning();
      for (const item of processedItems) {
        await tx.insert(invoiceItemsTable).values({ invoiceId: inv.id, productId: item.product_id, description: item.description ?? null, unit: item.unit ?? null, quantity: item.quantity, unitPrice: item.unit_price.toString(), discount: item.discount.toString(), vatRate: item.vat_rate.toString(), total: item.total.toString() });
        const d = deducted.find((x) => x.product_id === item.product_id);
        if (d) {
          await tx.insert(stockMovementsTable).values({ branchId, productId: item.product_id, type: "sale", quantity: -item.quantity, quantityBefore: d.before, quantityAfter: d.after, reference: invoiceNumber, notes: "Direct invoice" });
        }
      }
      // A sent invoice with an outstanding balance increases the customer's balance.
      if (invStatus !== "draft" && customer_id && total > 0) {
        await tx.update(customersTable)
          .set({ balance: sql`${customersTable.balance} + ${total}` })
          .where(eq(customersTable.id, customer_id));
      }
      return inv;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      const [p] = await db.select({ name: productsTable.productName }).from(productsTable).where(eq(productsTable.id, err.productId));
      res.status(409).json({ error: `Insufficient stock for "${p?.name ?? `product #${err.productId}`}" — only ${err.available} available` });
      return;
    }
    throw err;
  }
  await logAudit(req, { action: "invoice.created", entityType: "invoice", entityId: invoice.id, description: `Created invoice ${invoiceNumber} — KES ${total.toLocaleString()}` });
  res.status(201).json(await formatInvoice(invoice));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice || !isBranchInScope(req, invoice.branchId)) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(await formatInvoice(invoice));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status, due_date, notes } = req.body;
  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Invoice not found" }); return; }
  const [invoice] = await db.update(invoicesTable).set({ status, dueDate: due_date, notes }).where(eq(invoicesTable.id, id)).returning();
  res.json(await formatInvoice(invoice));
});

router.post("/invoices/:id/pay", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, method, reference, notes } = req.body;
  if (!amount || !method) { res.status(400).json({ error: "amount and method required" }); return; }
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice || !isBranchInScope(req, invoice.branchId)) { res.status(404).json({ error: "Invoice not found" }); return; }
  const beforeSnap = { status: invoice.status, amount_paid: Number(invoice.amountPaid), balance_due: Number(invoice.balanceDue) };
  await db.insert(invoicePaymentsTable).values({ invoiceId: id, amount: amount.toString(), method, reference, notes });
  const newAmountPaid = Number(invoice.amountPaid) + Number(amount);
  const newBalanceDue = Math.max(0, Number(invoice.total) - newAmountPaid);
  const newStatus = newBalanceDue <= 0 ? "paid" : "partial";
  const [updated] = await db.update(invoicesTable).set({ amountPaid: newAmountPaid.toString(), balanceDue: newBalanceDue.toString(), status: newStatus }).where(eq(invoicesTable.id, id)).returning();
  // Payments reduce the customer's outstanding balance.
  if (invoice.customerId) {
    await db.update(customersTable)
      .set({ balance: sql`GREATEST(0, ${customersTable.balance} - ${Number(amount)})` })
      .where(eq(customersTable.id, invoice.customerId));
  }
  const afterSnap = { status: newStatus, amount_paid: newAmountPaid, balance_due: newBalanceDue };
  await logAudit(req, { action: "invoice.payment", entityType: "invoice", entityId: id, description: `Payment of KES ${Number(amount).toLocaleString()} received for ${invoice.invoiceNumber} via ${method} — status: ${newStatus}`, metadata: { before: beforeSnap, after: afterSnap, reference } });
  res.json(await formatInvoice(updated));
});

export default router;
