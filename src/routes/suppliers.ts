import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, ilike, and, desc } from "drizzle-orm";
import { db, suppliersTable, partyPaymentsTable, purchasesTable } from "@workspace/db";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function fmt(s: typeof suppliersTable.$inferSelect) {
  return { id: s.id, branch_id: s.branchId, name: s.name, contact_person: s.contactPerson, email: s.email, phone: s.phone, address: s.address, city: s.city, tax_number: s.taxNumber, balance: Number(s.balance), created_at: s.createdAt };
}

router.get("/suppliers", async (req, res): Promise<void> => {
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const conditions = [];
  if (search) conditions.push(ilike(suppliersTable.name, `%${search}%`));
  const bc = branchCondition(suppliersTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(suppliersTable).where(where);
  const rows = await db.select().from(suppliersTable).where(where).limit(l).offset(offset).orderBy(suppliersTable.name);
  res.json({ data: rows.map(fmt), total: Number(count), page: p, limit: l });
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const { name, contact_person, email, phone, address, city, tax_number, branch_id } = req.body;
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const branchId = await resolveWriteBranchId(req, branch_id != null ? Number(branch_id) : undefined);
  const [s] = await db.insert(suppliersTable).values({ branchId, name, contactPerson: contact_person, email, phone, address, city, taxNumber: tax_number }).returning();
  res.status(201).json(fmt(s));
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s || !isBranchInScope(req, s.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(fmt(s));
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, contact_person, email, phone, address, city, tax_number } = req.body;
  const [existing] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (contact_person !== undefined) updateData.contactPerson = contact_person;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;
  if (address !== undefined) updateData.address = address;
  if (city !== undefined) updateData.city = city;
  if (tax_number !== undefined) updateData.taxNumber = tax_number;
  const [s] = await db.update(suppliersTable).set(updateData).where(eq(suppliersTable.id, id)).returning();
  res.json(fmt(s));
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.sendStatus(204);
});

router.post("/suppliers/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, method = "cash", reference, notes } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) { res.status(400).json({ error: "amount must be a positive number" }); return; }
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s || !isBranchInScope(req, s.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  const createdBy = (req as { user?: { name?: string } }).user?.name ?? null;
  const [p] = await db.insert(partyPaymentsTable).values({ partyType: "supplier", partyId: id, branchId: s.branchId, amount: amt.toString(), method, reference, notes, createdBy }).returning();
  const [updated] = await db.update(suppliersTable)
    .set({ balance: sql`GREATEST(0, ${suppliersTable.balance} - ${amt})` })
    .where(eq(suppliersTable.id, id)).returning();
  await logAudit(req, { action: "supplier.payment", entityType: "supplier", entityId: id, description: `Paid KES ${amt.toLocaleString()} to "${s.name}" via ${method}`, metadata: { reference: reference ?? null } });
  res.status(201).json({ id: p.id, supplier_id: id, amount: amt, method, reference: reference ?? null, notes: notes ?? null, balance: Number(updated.balance), created_at: p.createdAt });
});

router.get("/suppliers/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s || !isBranchInScope(req, s.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  const rows = await db.select().from(partyPaymentsTable)
    .where(and(eq(partyPaymentsTable.partyType, "supplier"), eq(partyPaymentsTable.partyId, id)))
    .orderBy(desc(partyPaymentsTable.createdAt)).limit(200);
  res.json(rows.map((r) => ({ id: r.id, amount: Number(r.amount), method: r.method, reference: r.reference, notes: r.notes, created_by: r.createdBy, created_at: r.createdAt })));
});

router.get("/suppliers/:id/ledger", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s || !isBranchInScope(req, s.branchId)) { res.status(404).json({ error: "Supplier not found" }); return; }
  const purchases = await db.select().from(purchasesTable).where(and(eq(purchasesTable.supplierId, id), sql`${purchasesTable.status} = 'received'`)).orderBy(desc(purchasesTable.createdAt)).limit(200);
  const payments = await db.select().from(partyPaymentsTable)
    .where(and(eq(partyPaymentsTable.partyType, "supplier"), eq(partyPaymentsTable.partyId, id)))
    .orderBy(desc(partyPaymentsTable.createdAt)).limit(200);
  const entries = [
    ...purchases.map((p) => ({ date: p.receivedDate ?? p.createdAt, type: "purchase", reference: p.purchaseNumber, debit: Number(p.total), credit: 0, notes: p.status })),
    ...payments.map((p) => ({ date: p.createdAt, type: "payment", reference: p.reference ?? `PAY-${p.id}`, debit: 0, credit: Number(p.amount), notes: p.method })),
  ].sort((a, b) => new Date(b.date as unknown as string).getTime() - new Date(a.date as unknown as string).getTime());
  res.json(entries);
});

export default router;
