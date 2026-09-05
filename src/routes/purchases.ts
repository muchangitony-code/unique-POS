import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, suppliersTable, productsTable, stockMovementsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { applyStockDelta } from "../lib/stock";

const router: IRouter = Router();

async function formatPurchase(purchase: typeof purchasesTable.$inferSelect) {
  const items = await db.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchaseId, purchase.id));
  const productIds = items.map((i) => i.productId);
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const [supplier] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, purchase.supplierId));
  return {
    id: purchase.id, purchase_number: purchase.purchaseNumber, branch_id: purchase.branchId,
    supplier_id: purchase.supplierId, supplier_name: supplier?.name ?? "Unknown",
    items: items.map((i) => ({ id: i.id, product_id: i.productId, product_name: productMap[i.productId] ?? "Unknown", quantity: i.quantity, unit_cost: Number(i.unitCost), total: Number(i.total) })),
    subtotal: Number(purchase.subtotal), tax_amount: Number(purchase.taxAmount), total: Number(purchase.total),
    status: purchase.status, notes: purchase.notes, expected_date: purchase.expectedDate, received_date: purchase.receivedDate, created_at: purchase.createdAt,
  };
}

router.get("/purchases", async (req, res): Promise<void> => {
  const { supplier_id, status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const conditions = [];
  if (supplier_id) conditions.push(eq(purchasesTable.supplierId, parseInt(supplier_id, 10)));
  if (status) conditions.push(sql`${purchasesTable.status} = ${status}`);
  const bc = branchCondition(purchasesTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(where);
  const rows = await db.select().from(purchasesTable).where(where).orderBy(sql`${purchasesTable.createdAt} desc`).limit(l).offset(offset);
  const data = await Promise.all(rows.map(formatPurchase));
  res.json({ data, total: Number(count), page: p, limit: l });
});

router.post("/purchases", async (req, res): Promise<void> => {
  const { supplier_id, items, notes, expected_date, branch_id } = req.body;
  if (!supplier_id || !items?.length) { res.status(400).json({ error: "supplier_id and items required" }); return; }
  const branchId = await resolveWriteBranchId(req, branch_id != null ? Number(branch_id) : undefined);
  const purchaseNumber = `PO-${Date.now()}`;
  let subtotal = 0;
  for (const item of items) { subtotal += item.quantity * item.unit_cost; }
  const [purchase] = await db.insert(purchasesTable).values({ purchaseNumber, branchId, supplierId: supplier_id, subtotal: subtotal.toString(), total: subtotal.toString(), notes, expectedDate: expected_date }).returning();
  for (const item of items) {
    await db.insert(purchaseItemsTable).values({ purchaseId: purchase.id, productId: item.product_id, quantity: item.quantity, unitCost: item.unit_cost.toString(), total: (item.quantity * item.unit_cost).toString() });
  }
  await logAudit(req, { action: "purchase.created", entityType: "purchase", entityId: purchase.id, description: `Created purchase order ${purchaseNumber} — KES ${subtotal.toLocaleString()} (${items.length} item${items.length !== 1 ? "s" : ""})` });
  res.status(201).json(await formatPurchase(purchase));
});

router.get("/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!purchase || !isBranchInScope(req, purchase.branchId)) { res.status(404).json({ error: "Purchase not found" }); return; }
  res.json(await formatPurchase(purchase));
});

router.patch("/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status, notes, expected_date } = req.body;
  const [existing] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Purchase not found" }); return; }
  const [purchase] = await db.update(purchasesTable).set({ status, notes, expectedDate: expected_date }).where(eq(purchasesTable.id, id)).returning();
  res.json(await formatPurchase(purchase));
});

router.post("/purchases/:id/receive", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!purchase || !isBranchInScope(req, purchase.branchId)) { res.status(404).json({ error: "Purchase not found" }); return; }
  const now = new Date().toISOString().split("T")[0];
  const updated = await db.transaction(async (tx) => {
    // Atomically claim the "received" state; a concurrent request gets zero rows.
    const claimed = await tx.update(purchasesTable)
      .set({ status: "received", receivedDate: now })
      .where(and(eq(purchasesTable.id, id), sql`${purchasesTable.status} <> 'received'`))
      .returning();
    if (!claimed.length) return null;
    const items = await tx.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchaseId, id));
    for (const item of items) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product) {
        const { before, after } = await applyStockDelta(purchase.branchId, item.productId, item.quantity, {}, tx);
        await tx.insert(stockMovementsTable).values({ branchId: purchase.branchId, productId: item.productId, type: "receive", quantity: item.quantity, quantityBefore: before, quantityAfter: after, reference: purchase.purchaseNumber });
      }
    }
    // Receiving stock creates a payable — increase the supplier's balance.
    await tx.update(suppliersTable)
      .set({ balance: sql`${suppliersTable.balance} + ${Number(purchase.total)}` })
      .where(eq(suppliersTable.id, purchase.supplierId));
    return claimed[0];
  });
  if (!updated) { res.status(400).json({ error: "Purchase order already received" }); return; }
  await logAudit(req, { action: "purchase.received", entityType: "purchase", entityId: id, description: `Marked purchase order ${purchase.purchaseNumber} as received — stock updated` });
  res.json(await formatPurchase(updated));
});

export default router;
