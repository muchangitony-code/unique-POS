import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, and } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";

const router: IRouter = Router();

function fmt(e: typeof expensesTable.$inferSelect) {
  return { id: e.id, branch_id: e.branchId, description: e.description, amount: Number(e.amount), category: e.category, payment_method: e.paymentMethod, reference: e.reference, notes: e.notes, date: e.date, created_at: e.createdAt };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const { category, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const conditions = [];
  if (category) conditions.push(sql`${expensesTable.category} = ${category}`);
  const bc = branchCondition(expensesTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(expensesTable).where(where);
  const rows = await db.select().from(expensesTable).where(where).orderBy(sql`${expensesTable.createdAt} desc`).limit(l).offset(offset);
  res.json({ data: rows.map(fmt), total: Number(count), page: p, limit: l });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const { description, amount, category, payment_method, reference, notes, date, branch_id } = req.body;
  if (!description || !amount || !category || !date) { res.status(400).json({ error: "description, amount, category and date required" }); return; }
  const branchId = await resolveWriteBranchId(req, branch_id != null ? Number(branch_id) : undefined);
  const [e] = await db.insert(expensesTable).values({ branchId, description, amount: amount.toString(), category, paymentMethod: payment_method ?? "cash", reference, notes, date }).returning();
  await logAudit(req, { action: "expense.created", entityType: "expense", entityId: e.id, description: `Recorded expense "${e.description}" — KES ${Number(e.amount).toLocaleString()} (${e.category})` });
  res.status(201).json(fmt(e));
});

router.get("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e || !isBranchInScope(req, e.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(fmt(e));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { description, amount, category, payment_method, reference, notes, date } = req.body;
  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (description !== undefined) updateData.description = description;
  if (amount !== undefined) updateData.amount = amount.toString();
  if (category !== undefined) updateData.category = category;
  if (payment_method !== undefined) updateData.paymentMethod = payment_method;
  if (reference !== undefined) updateData.reference = reference;
  if (notes !== undefined) updateData.notes = notes;
  if (date !== undefined) updateData.date = date;
  const [e] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, id)).returning();
  await logAudit(req, { action: "expense.updated", entityType: "expense", entityId: e.id, description: `Updated expense "${e.description}" — KES ${Number(e.amount).toLocaleString()}` });
  res.json(fmt(e));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e || !isBranchInScope(req, e.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  await logAudit(req, { action: "expense.deleted", entityType: "expense", entityId: id, description: `Deleted expense "${e?.description ?? id}"` });
  res.sendStatus(204);
});

export default router;
