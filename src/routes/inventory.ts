import { Router, type IRouter, type Request } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, and, or, inArray } from "drizzle-orm";
import { db, stockMovementsTable, productsTable, categoriesTable, productStockTable, stockTransfersTable, branchesTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { branchCondition, resolveWriteBranchId, getBranchScope, isBranchInScope } from "../lib/branch-scope";
import { adjustBranchStock, getBranchCurrentStock, applyStockDelta } from "../lib/stock";
import { nextDocumentNumber } from "../lib/doc-numbers";
import type { JwtPayload } from "../lib/auth";

function getReqUser(req: Request): JwtPayload | undefined {
  return (req as Request & { user?: JwtPayload }).user;
}

function formatTransfer(
  t: typeof stockTransfersTable.$inferSelect,
  names: { product?: string; source?: string; dest?: string } = {},
) {
  return {
    id: t.id,
    transfer_number: t.transferNumber,
    source_branch_id: t.sourceBranchId,
    source_branch_name: names.source ?? null,
    destination_branch_id: t.destinationBranchId,
    destination_branch_name: names.dest ?? null,
    product_id: t.productId,
    product_name: names.product ?? null,
    quantity: t.quantity,
    status: t.status,
    notes: t.notes,
    transfer_date: t.transferDate,
    initiated_by_id: t.initiatedById,
    initiated_by_name: t.initiatedByName,
    decided_by_id: t.decidedById,
    decided_by_name: t.decidedByName,
    decided_at: t.decidedAt,
    decision_notes: t.decisionNotes,
    created_at: t.createdAt,
  };
}

/** True when the actor may act on a transfer (its source or destination is in their branch scope). */
function canActOnTransfer(req: Request, t: typeof stockTransfersTable.$inferSelect): boolean {
  return isBranchInScope(req, t.sourceBranchId) || isBranchInScope(req, t.destinationBranchId);
}

const router: IRouter = Router();

function formatMovement(m: typeof stockMovementsTable.$inferSelect, productName?: string) {
  return {
    id: m.id,
    branch_id: m.branchId,
    product_id: m.productId,
    product_name: productName ?? "Unknown",
    type: m.type,
    quantity: m.quantity,
    quantity_before: m.quantityBefore,
    quantity_after: m.quantityAfter,
    reference: m.reference,
    notes: m.notes,
    created_by: m.createdBy,
    created_at: m.createdAt,
  };
}

router.get("/inventory/movements", async (req, res): Promise<void> => {
  const { product_id, type, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;

  const conditions = [];
  if (product_id) conditions.push(eq(stockMovementsTable.productId, parseInt(product_id, 10)));
  if (type) conditions.push(sql`${stockMovementsTable.type} = ${type}`);
  const bc = branchCondition(stockMovementsTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(stockMovementsTable).where(where);
  const movements = await db.select().from(stockMovementsTable).where(where).orderBy(sql`${stockMovementsTable.createdAt} desc`).limit(l).offset(offset);

  const productIds = [...new Set(movements.map((m) => m.productId))];
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(sql`${productsTable.id} = ANY(${productIds})`) : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

  res.json({
    data: movements.map((m) => formatMovement(m, productMap[m.productId])),
    total: Number(count),
    page: p,
    limit: l,
  });
});

router.post("/inventory/receive", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const { product_id, quantity, notes, reference } = req.body;
  if (!product_id || !quantity) { res.status(400).json({ error: "product_id and quantity required" }); return; }
  if (!Number.isInteger(quantity) || quantity <= 0) { res.status(400).json({ error: "quantity must be a positive integer" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, product_id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const branchId = await resolveWriteBranchId(req);
  const { before, after } = await adjustBranchStock(branchId, product_id, (b) => b + quantity);
  const [m] = await db.insert(stockMovementsTable).values({
    branchId, productId: product_id, type: "receive", quantity, quantityBefore: before, quantityAfter: after,
    reference: reference ?? `REC-${Date.now()}`, notes,
  }).returning();
  await logAudit(req, { action: "stock.received", entityType: "product", entityId: product_id, description: `Received ${quantity} units of "${product.productName}" — stock ${before} → ${after}`, metadata: { reference } });
  res.status(201).json(formatMovement(m, product.productName));
});

router.post("/inventory/adjust", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const { product_id, quantity, reason, notes } = req.body;
  if (!product_id || quantity === undefined) { res.status(400).json({ error: "product_id and quantity required" }); return; }
  if (!Number.isInteger(quantity) || quantity === 0) { res.status(400).json({ error: "quantity must be a non-zero integer" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, product_id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const branchId = await resolveWriteBranchId(req);
  const result = await applyStockDelta(branchId, product_id, quantity);
  if (!result.ok) { res.status(400).json({ error: `Adjustment would make stock negative — only ${result.before} in stock` }); return; }
  const { before, after } = result;
  const [m] = await db.insert(stockMovementsTable).values({
    branchId, productId: product_id, type: "adjustment", quantity, quantityBefore: before, quantityAfter: after,
    reference: `ADJ-${Date.now()}`, notes: notes ?? reason,
  }).returning();
  await logAudit(req, { action: "stock.adjusted", entityType: "product", entityId: product_id, description: `Adjusted stock of "${product.productName}" by ${quantity > 0 ? "+" : ""}${quantity} — ${before} → ${after}. Reason: ${reason ?? notes ?? "—"}`, metadata: { before: { current_stock: before }, after: { current_stock: after }, reason: reason ?? notes ?? null } });
  res.status(201).json(formatMovement(m, product.productName));
});

// ─── Cross-branch stock transfers (approval workflow) ─────────────────────────

router.get("/inventory/transfers", async (req, res): Promise<void> => {
  const { status, branch_id, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const scope = getBranchScope(req);

  const conditions = [];
  if (status) conditions.push(eq(stockTransfersTable.status, status));

  // Visibility: a transfer is in scope if its source OR destination branch is.
  // Non-super users are hard-locked to their own branch; super admins may focus
  // one branch via ?branch_id, otherwise see all.
  let focusBranch: number | null = null;
  if (scope.mode === "single") {
    if (scope.branchId == null) { res.json({ data: [], total: 0, page: p, limit: l }); return; }
    focusBranch = scope.branchId;
  } else if (branch_id) {
    const n = parseInt(branch_id, 10);
    if (Number.isInteger(n) && n > 0) focusBranch = n;
  }
  if (focusBranch != null) {
    conditions.push(or(eq(stockTransfersTable.sourceBranchId, focusBranch), eq(stockTransfersTable.destinationBranchId, focusBranch)));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(stockTransfersTable).where(where);
  const rows = await db.select().from(stockTransfersTable).where(where).orderBy(sql`${stockTransfersTable.createdAt} desc`).limit(l).offset(offset);

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const branchIds = [...new Set(rows.flatMap((r) => [r.sourceBranchId, r.destinationBranchId]))];
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const branches = branchIds.length ? await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable).where(inArray(branchesTable.id, branchIds)) : [];
  const pMap = Object.fromEntries(products.map((x) => [x.id, x.name]));
  const bMap = Object.fromEntries(branches.map((x) => [x.id, x.name]));

  res.json({
    data: rows.map((t) => formatTransfer(t, { product: pMap[t.productId], source: bMap[t.sourceBranchId], dest: bMap[t.destinationBranchId] })),
    total: Number(count),
    page: p,
    limit: l,
  });
});

router.post("/inventory/transfers", async (req, res): Promise<void> => {
  const { source_branch_id, destination_branch_id, product_id, quantity, transfer_date, notes } = req.body;
  const qty = Number(quantity);
  if (!product_id || !Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: "product_id and a positive quantity are required" }); return; }
  if (!destination_branch_id) { res.status(400).json({ error: "destination_branch_id is required" }); return; }

  const scope = getBranchScope(req);
  // Resolve the source branch under branch-permission rules.
  let sourceBranchId: number;
  if (scope.isSuper) {
    sourceBranchId = Number(source_branch_id);
    if (!Number.isInteger(sourceBranchId) || sourceBranchId <= 0) { res.status(400).json({ error: "source_branch_id is required" }); return; }
  } else {
    if (scope.userBranchId == null) { res.status(403).json({ error: "No branch assigned to your account" }); return; }
    sourceBranchId = scope.userBranchId;
    if (source_branch_id != null && Number(source_branch_id) !== sourceBranchId) {
      res.status(403).json({ error: "You can only create transfers from your own branch" }); return;
    }
  }
  const destBranchId = Number(destination_branch_id);
  if (sourceBranchId === destBranchId) { res.status(400).json({ error: "Source and destination branches must be different" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, product_id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const branches = await db.select().from(branchesTable).where(inArray(branchesTable.id, [sourceBranchId, destBranchId]));
  const src = branches.find((b) => b.id === sourceBranchId);
  const dest = branches.find((b) => b.id === destBranchId);
  if (!src) { res.status(404).json({ error: "Source branch not found" }); return; }
  if (!dest) { res.status(404).json({ error: "Destination branch not found" }); return; }
  if (!dest.isActive) { res.status(400).json({ error: "Destination branch is inactive" }); return; }

  // Guard against transferring more than the source branch holds.
  const available = await getBranchCurrentStock(sourceBranchId, product_id);
  if (available < qty) { res.status(400).json({ error: `Insufficient stock at ${src.name}: ${available} available, ${qty} requested` }); return; }

  const transferNumber = await nextDocumentNumber("transfer");
  const user = getReqUser(req);

  // Hold the stock: decrement the source branch immediately.
  const { before, after } = await adjustBranchStock(sourceBranchId, product_id, (b) => b - qty);
  await db.insert(stockMovementsTable).values({
    branchId: sourceBranchId, productId: product_id, type: "transfer_out", quantity: -qty,
    quantityBefore: before, quantityAfter: after, reference: transferNumber,
    notes: `Transfer to ${dest.name} (pending approval)`, createdBy: user?.name ?? null,
  });

  const [t] = await db.insert(stockTransfersTable).values({
    transferNumber, sourceBranchId, destinationBranchId: destBranchId, productId: product_id, quantity: qty,
    status: "pending", notes: notes ?? null,
    transferDate: transfer_date ? new Date(transfer_date) : new Date(),
    initiatedById: user?.userId ?? null, initiatedByName: user?.name ?? null,
  }).returning();

  await logAudit(req, {
    action: "stock.transfer_created", entityType: "stock_transfer", entityId: t.id,
    description: `Created transfer ${transferNumber}: ${qty} × "${product.productName}" from ${src.name} to ${dest.name} (pending approval)`,
    metadata: { transfer_number: transferNumber, source_branch: src.name, destination_branch: dest.name, quantity: qty, source_stock: { before, after } },
  });

  res.status(201).json(formatTransfer(t, { product: product.productName, source: src.name, dest: dest.name }));
});

router.post("/inventory/transfers/:id/approve", requireRole("administrator", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [t] = await db.select().from(stockTransfersTable).where(eq(stockTransfersTable.id, id));
  if (!t) { res.status(404).json({ error: "Transfer not found" }); return; }
  if (!canActOnTransfer(req, t)) { res.status(403).json({ error: "You cannot act on transfers outside your branch" }); return; }
  if (t.status !== "pending") { res.status(409).json({ error: `Transfer is already ${t.status}` }); return; }

  const user = getReqUser(req);
  // Atomically claim the state transition BEFORE touching stock. Only one
  // concurrent request can flip pending → approved (conditional WHERE), so the
  // destination credit below is applied exactly once — no double-approve or
  // approve/reject double-apply.
  const [updated] = await db.update(stockTransfersTable).set({
    status: "approved", decidedById: user?.userId ?? null, decidedByName: user?.name ?? null, decidedAt: new Date(),
  }).where(and(eq(stockTransfersTable.id, id), eq(stockTransfersTable.status, "pending"))).returning();
  if (!updated) { res.status(409).json({ error: "Transfer has already been processed" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, t.productId));
  const branches = await db.select().from(branchesTable).where(inArray(branchesTable.id, [t.sourceBranchId, t.destinationBranchId]));
  const src = branches.find((b) => b.id === t.sourceBranchId);
  const dest = branches.find((b) => b.id === t.destinationBranchId);

  // Credit the destination branch.
  const { before, after } = await adjustBranchStock(t.destinationBranchId, t.productId, (b) => b + t.quantity);
  await db.insert(stockMovementsTable).values({
    branchId: t.destinationBranchId, productId: t.productId, type: "transfer_in", quantity: t.quantity,
    quantityBefore: before, quantityAfter: after, reference: t.transferNumber,
    notes: `Transfer from ${src?.name ?? t.sourceBranchId} (approved)`, createdBy: user?.name ?? null,
  });

  await logAudit(req, {
    action: "stock.transfer_approved", entityType: "stock_transfer", entityId: id,
    description: `Approved transfer ${t.transferNumber}: ${t.quantity} × "${product?.productName ?? t.productId}" credited to ${dest?.name ?? t.destinationBranchId}`,
    metadata: { transfer_number: t.transferNumber, destination_branch: dest?.name, quantity: t.quantity, destination_stock: { before, after } },
  });

  res.json(formatTransfer(updated, { product: product?.productName, source: src?.name, dest: dest?.name }));
});

router.post("/inventory/transfers/:id/reject", requireRole("administrator", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
  const [t] = await db.select().from(stockTransfersTable).where(eq(stockTransfersTable.id, id));
  if (!t) { res.status(404).json({ error: "Transfer not found" }); return; }
  if (!canActOnTransfer(req, t)) { res.status(403).json({ error: "You cannot act on transfers outside your branch" }); return; }
  if (t.status !== "pending") { res.status(409).json({ error: `Transfer is already ${t.status}` }); return; }

  const user = getReqUser(req);
  // Atomically claim the state transition BEFORE releasing the hold, so the
  // source credit-back is applied exactly once even under concurrent requests.
  const [updated] = await db.update(stockTransfersTable).set({
    status: "rejected", decidedById: user?.userId ?? null, decidedByName: user?.name ?? null, decidedAt: new Date(), decisionNotes: reason,
  }).where(and(eq(stockTransfersTable.id, id), eq(stockTransfersTable.status, "pending"))).returning();
  if (!updated) { res.status(409).json({ error: "Transfer has already been processed" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, t.productId));
  const branches = await db.select().from(branchesTable).where(inArray(branchesTable.id, [t.sourceBranchId, t.destinationBranchId]));
  const src = branches.find((b) => b.id === t.sourceBranchId);
  const dest = branches.find((b) => b.id === t.destinationBranchId);

  // Release the hold: credit the stock back to the source branch.
  const { before, after } = await adjustBranchStock(t.sourceBranchId, t.productId, (b) => b + t.quantity);
  await db.insert(stockMovementsTable).values({
    branchId: t.sourceBranchId, productId: t.productId, type: "transfer_in", quantity: t.quantity,
    quantityBefore: before, quantityAfter: after, reference: t.transferNumber,
    notes: `Transfer rejected — hold released${reason ? `: ${reason}` : ""}`, createdBy: user?.name ?? null,
  });

  await logAudit(req, {
    action: "stock.transfer_rejected", entityType: "stock_transfer", entityId: id,
    description: `Rejected transfer ${t.transferNumber}: ${t.quantity} × "${product?.productName ?? t.productId}" — hold released back to ${src?.name ?? t.sourceBranchId}${reason ? `. Reason: ${reason}` : ""}`,
    metadata: { transfer_number: t.transferNumber, source_branch: src?.name, quantity: t.quantity, source_stock: { before, after }, reason },
  });

  res.json(formatTransfer(updated, { product: product?.productName, source: src?.name, dest: dest?.name }));
});

router.get("/inventory/stock-count", async (req, res): Promise<void> => {
  const { category_id, low_stock_only } = req.query as Record<string, string>;
  const scope = getBranchScope(req);
  // Non-super user with no branch sees nothing (fail-closed).
  if (scope.mode === "single" && scope.branchId == null) { res.json([]); return; }

  const prodConditions = [];
  if (category_id) prodConditions.push(eq(productsTable.categoryId, parseInt(category_id, 10)));
  const products = await db.select().from(productsTable).where(prodConditions.length ? and(...prodConditions) : undefined).orderBy(productsTable.productName);

  // Load per-branch stock for the current scope and aggregate per product.
  const stockRows = scope.mode === "single"
    ? await db.select().from(productStockTable).where(eq(productStockTable.branchId, scope.branchId as number))
    : await db.select().from(productStockTable);
  const stockMap = new Map<number, { cur: number; min: number | null }>();
  for (const r of stockRows) {
    const e = stockMap.get(r.productId) ?? { cur: 0, min: null };
    e.cur += r.currentStock;
    if (scope.mode === "single") e.min = r.minStock;
    stockMap.set(r.productId, e);
  }

  const categories = await db.select().from(categoriesTable);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const rows = products.map((p) => {
    const s = stockMap.get(p.id);
    const currentStock = s?.cur ?? 0;
    const minStock = scope.mode === "single" ? (s?.min ?? p.minStock) : p.minStock;
    return {
      product_id: p.id,
      product_name: p.productName,
      product_code: p.productCode,
      category_name: p.categoryId ? catMap[p.categoryId] : null,
      current_stock: currentStock,
      min_stock: minStock,
      cost_value: currentStock * Number(p.costPrice),
      selling_value: currentStock * Number(p.sellingPrice),
      status: currentStock === 0 ? "out_of_stock" : currentStock <= minStock ? "low" : "ok",
    };
  }).filter((r) => low_stock_only !== "true" || r.current_stock <= r.min_stock);

  res.json(rows);
});

export default router;
