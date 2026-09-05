import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, inArray, sql, and } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, stockMovementsTable, saleReturnsTable, saleReturnItemsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { applyStockDelta, InsufficientStockError } from "../lib/stock";

const router: IRouter = Router();

async function formatSale(sale: typeof salesTable.$inferSelect) {
  const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id));
  const productIds = items.map((i) => i.productId);
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  let customerName: string | null = null;
  if (sale.customerId) {
    const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, sale.customerId));
    customerName = c?.name ?? null;
  }
  return {
    id: sale.id, receipt_number: sale.receiptNumber, branch_id: sale.branchId,
    customer_id: sale.customerId, customer_name: customerName,
    items: items.map((i) => ({ id: i.id, product_id: i.productId, product_name: productMap[i.productId] ?? "Unknown", quantity: i.quantity, unit_price: Number(i.unitPrice), discount: Number(i.discount), vat_rate: Number(i.vatRate), total: Number(i.total) })),
    subtotal: Number(sale.subtotal), discount_amount: Number(sale.discountAmount), tax_amount: Number(sale.taxAmount), total: Number(sale.total),
    amount_paid: Number(sale.amountPaid), change: Number(sale.change),
    payment_method: sale.paymentMethod, cashier_name: sale.cashierName, status: sale.status, created_at: sale.createdAt,
  };
}

router.post("/pos/sale", async (req, res): Promise<void> => {
  const { customer_id, items, discount_amount = 0, amount_paid, payment_method } = req.body;
  if (!items?.length || amount_paid === undefined || !payment_method) { res.status(400).json({ error: "items, amount_paid, and payment_method required" }); return; }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) { res.status(400).json({ error: "Each item quantity must be a positive integer" }); return; }
  }
  if (payment_method === "credit" && !customer_id) { res.status(400).json({ error: "A customer is required for credit sales" }); return; }
  const branchId = await resolveWriteBranchId(req);
  const receiptNumber = `RCP-${Date.now()}`;
  let subtotal = 0;
  for (const item of items) { subtotal += item.quantity * item.unit_price; }
  const total = subtotal - Number(discount_amount);
  const change = Math.max(0, Number(amount_paid) - total);

  const cashierName = (req as { user?: { name?: string } }).user?.name ?? null;
  let sale: typeof salesTable.$inferSelect;
  try {
    sale = await db.transaction(async (tx) => {
      // Atomically deduct stock for every line; the transaction rolls back everything on failure.
      const deducted: { product_id: number; quantity: number; before: number; after: number }[] = [];
      for (const item of items) {
        const result = await applyStockDelta(branchId, item.product_id, -item.quantity, {}, tx);
        if (!result.ok) throw new InsufficientStockError(item.product_id, result.before);
        deducted.push({ product_id: item.product_id, quantity: item.quantity, before: result.before, after: result.after });
      }
      const [s] = await tx.insert(salesTable).values({
        receiptNumber, branchId, customerId: customer_id, subtotal: subtotal.toString(), discountAmount: discount_amount.toString(), total: total.toString(), amountPaid: amount_paid.toString(), change: change.toString(), paymentMethod: payment_method, cashierName,
      }).returning();
      for (const item of items) {
        const lineTotal = item.quantity * item.unit_price;
        await tx.insert(saleItemsTable).values({ saleId: s.id, productId: item.product_id, quantity: item.quantity, unitPrice: item.unit_price.toString(), discount: (item.discount ?? 0).toString(), vatRate: (item.vat_rate ?? 16).toString(), total: lineTotal.toString() });
        const d = deducted.find((x) => x.product_id === item.product_id)!;
        await tx.insert(stockMovementsTable).values({ branchId, productId: item.product_id, type: "sale", quantity: -item.quantity, quantityBefore: d.before, quantityAfter: d.after, reference: receiptNumber });
      }
      // Credit sales increase the customer's outstanding balance by the unpaid amount.
      const unpaid = Math.max(0, total - Number(amount_paid));
      if (customer_id && unpaid > 0) {
        await tx.update(customersTable)
          .set({ balance: sql`${customersTable.balance} + ${unpaid}` })
          .where(eq(customersTable.id, customer_id));
      }
      return s;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      const [p] = await db.select({ name: productsTable.productName }).from(productsTable).where(eq(productsTable.id, err.productId));
      res.status(409).json({ error: `Insufficient stock for "${p?.name ?? `product #${err.productId}`}" — only ${err.available} available` });
      return;
    }
    throw err;
  }
  await logAudit(req, { action: "sale.created", entityType: "sale", entityId: sale.id, description: `Sale ${receiptNumber} — KES ${total.toLocaleString()} (${items.length} item${items.length !== 1 ? "s" : ""}) via ${payment_method}`, metadata: { receipt: receiptNumber } });
  res.status(201).json(await formatSale(sale));
});

// ─── Sale returns ─────────────────────────────────────────────────────────────

router.post("/pos/returns", async (req, res): Promise<void> => {
  const { sale_id, items, reason, refund_method = "cash" } = req.body as { sale_id?: number; items?: { sale_item_id: number; quantity: number }[]; reason?: string; refund_method?: string };
  if (!sale_id || !items?.length) { res.status(400).json({ error: "sale_id and items required" }); return; }
  const [saleCheck] = await db.select().from(salesTable).where(eq(salesTable.id, sale_id));
  if (!saleCheck || !isBranchInScope(req, saleCheck.branchId)) { res.status(404).json({ error: "Sale not found" }); return; }

  const returnNumber = `RTN-${Date.now()}`;
  const createdBy = (req as { user?: { name?: string } }).user?.name ?? null;

  class ReturnValidationError extends Error {}

  let outcome: { ret: typeof saleReturnsTable.$inferSelect; sale: typeof salesTable.$inferSelect; refundTotal: number; lines: { saleItem: typeof saleItemsTable.$inferSelect; quantity: number; lineTotal: number }[] };
  try {
    outcome = await db.transaction(async (tx) => {
      // Lock the sale row so concurrent returns against the same sale serialize.
      await tx.execute(sql`SELECT id FROM sales WHERE id = ${sale_id} FOR UPDATE`);
      const [sale] = await tx.select().from(salesTable).where(eq(salesTable.id, sale_id));
      if (sale.status === "void") throw new ReturnValidationError("Cannot return items from a voided sale");

      const saleItems = await tx.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale_id));
      const itemMap = new Map(saleItems.map((i) => [i.id, i]));

      // Quantities and refund value already returned on this sale
      const prevReturns = await tx.select({ saleItemId: saleReturnItemsTable.saleItemId, qty: sql<number>`sum(${saleReturnItemsTable.quantity})` })
        .from(saleReturnItemsTable)
        .innerJoin(saleReturnsTable, eq(saleReturnItemsTable.returnId, saleReturnsTable.id))
        .where(eq(saleReturnsTable.saleId, sale_id))
        .groupBy(saleReturnItemsTable.saleItemId);
      const returnedMap = new Map(prevReturns.map((r) => [r.saleItemId, Number(r.qty)]));
      const [prevTotals] = await tx.select({ total: sql<string>`coalesce(sum(${saleReturnsTable.total}), 0)` })
        .from(saleReturnsTable).where(eq(saleReturnsTable.saleId, sale_id));
      const prevRefundTotal = Number(prevTotals?.total ?? 0);

      // Validate every line before touching stock
      let refundTotal = 0;
      const lines: { saleItem: typeof saleItemsTable.$inferSelect; quantity: number; lineTotal: number }[] = [];
      for (const item of items) {
        const saleItem = itemMap.get(item.sale_item_id);
        if (!saleItem) throw new ReturnValidationError(`Sale item ${item.sale_item_id} does not belong to this sale`);
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ReturnValidationError("Return quantities must be positive integers");
        const remaining = saleItem.quantity - (returnedMap.get(saleItem.id) ?? 0);
        if (item.quantity > remaining) throw new ReturnValidationError(`Only ${remaining} unit(s) of this item can still be returned`);
        const lineTotal = item.quantity * Number(saleItem.unitPrice);
        refundTotal += lineTotal;
        lines.push({ saleItem, quantity: item.quantity, lineTotal });
      }

      const [ret] = await tx.insert(saleReturnsTable).values({
        returnNumber, saleId: sale_id, branchId: sale.branchId, total: refundTotal.toString(), refundMethod: refund_method, reason: reason ?? null, createdBy,
      }).returning();

      for (const line of lines) {
        await tx.insert(saleReturnItemsTable).values({ returnId: ret.id, saleItemId: line.saleItem.id, productId: line.saleItem.productId, quantity: line.quantity, unitPrice: line.saleItem.unitPrice, total: line.lineTotal.toString() });
        const { before, after } = await applyStockDelta(sale.branchId, line.saleItem.productId, line.quantity, { allowNegative: true }, tx);
        await tx.insert(stockMovementsTable).values({ branchId: sale.branchId, productId: line.saleItem.productId, type: "return", quantity: line.quantity, quantityBefore: before, quantityAfter: after, reference: returnNumber, notes: `Return against ${sale.receiptNumber}` });
      }

      // Reduce the customer's balance only by what is still unpaid on this sale
      // AFTER accounting for reductions from prior returns.
      if (sale.customerId) {
        const unpaidOnSale = Math.max(0, Number(sale.total) - Number(sale.amountPaid));
        const remainingUnpaid = Math.max(0, unpaidOnSale - prevRefundTotal);
        const balanceReduction = Math.min(refundTotal, remainingUnpaid);
        if (balanceReduction > 0) {
          await tx.update(customersTable)
            .set({ balance: sql`GREATEST(0, ${customersTable.balance} - ${balanceReduction})` })
            .where(eq(customersTable.id, sale.customerId));
        }
      }

      // Mark the sale refunded when every unit has now been returned
      const totalSold = saleItems.reduce((s, i) => s + i.quantity, 0);
      const totalReturned = [...returnedMap.values()].reduce((s, q) => s + q, 0) + lines.reduce((s, l) => s + l.quantity, 0);
      if (totalReturned >= totalSold) {
        await tx.update(salesTable).set({ status: "refunded" }).where(eq(salesTable.id, sale_id));
      }
      return { ret, sale, refundTotal, lines };
    });
  } catch (err) {
    if (err instanceof ReturnValidationError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
  const { ret, sale, refundTotal, lines } = outcome;

  await logAudit(req, { action: "sale.returned", entityType: "sale", entityId: sale_id, description: `Return ${returnNumber} against ${sale.receiptNumber} — KES ${refundTotal.toLocaleString()} refunded via ${refund_method}`, metadata: { return_number: returnNumber, reason: reason ?? null } });
  res.status(201).json({
    id: ret.id, return_number: returnNumber, sale_id, receipt_number: sale.receiptNumber, branch_id: sale.branchId,
    total: refundTotal, refund_method, reason: reason ?? null,
    items: lines.map((l) => ({ sale_item_id: l.saleItem.id, product_id: l.saleItem.productId, quantity: l.quantity, unit_price: Number(l.saleItem.unitPrice), total: l.lineTotal })),
    created_at: ret.createdAt,
  });
});

router.get("/pos/returns", async (req, res): Promise<void> => {
  const { page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const where = branchCondition(saleReturnsTable.branchId, req);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(saleReturnsTable).where(where);
  const rows = await db.select().from(saleReturnsTable).where(where).orderBy(sql`${saleReturnsTable.createdAt} desc`).limit(l).offset((p - 1) * l);
  const saleIds = [...new Set(rows.map((r) => r.saleId))];
  const sales = saleIds.length ? await db.select({ id: salesTable.id, receipt: salesTable.receiptNumber }).from(salesTable).where(inArray(salesTable.id, saleIds)) : [];
  const receiptMap = Object.fromEntries(sales.map((s) => [s.id, s.receipt]));
  res.json({
    data: rows.map((r) => ({ id: r.id, return_number: r.returnNumber, sale_id: r.saleId, receipt_number: receiptMap[r.saleId] ?? null, branch_id: r.branchId, total: Number(r.total), refund_method: r.refundMethod, reason: r.reason, created_by: r.createdBy, created_at: r.createdAt })),
    total: Number(count), page: p, limit: l,
  });
});

router.get("/pos/sales", async (req, res): Promise<void> => {
  const { page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const where = branchCondition(salesTable.branchId, req);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(where);
  const rows = await db.select().from(salesTable).where(where).orderBy(sql`${salesTable.createdAt} desc`).limit(l).offset(offset);
  const data = await Promise.all(rows.map(formatSale));
  res.json({ data, total: Number(count), page: p, limit: l });
});

router.get("/pos/sales/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale || !isBranchInScope(req, sale.branchId)) { res.status(404).json({ error: "Sale not found" }); return; }
  res.json(await formatSale(sale));
});

export default router;
