import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, ilike, and, desc } from "drizzle-orm";
import { db, customersTable, partyPaymentsTable, salesTable, invoicesTable } from "@workspace/db";
import { branchCondition, resolveWriteBranchId, isBranchInScope } from "../lib/branch-scope";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function fmt(c: typeof customersTable.$inferSelect) {
  return { id: c.id, branch_id: c.branchId, name: c.name, company: c.company, contact_person: c.contactPerson, email: c.email, phone: c.phone, address: c.address, city: c.city, tax_number: c.taxNumber, credit_limit: Number(c.creditLimit), balance: Number(c.balance), created_at: c.createdAt };
}

router.get("/customers", async (req, res): Promise<void> => {
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));
  const offset = (p - 1) * l;
  const conditions = [];
  if (search) conditions.push(ilike(customersTable.name, `%${search}%`));
  const bc = branchCondition(customersTable.branchId, req);
  if (bc) conditions.push(bc);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(customersTable).where(where);
  const rows = await db.select().from(customersTable).where(where).limit(l).offset(offset).orderBy(customersTable.name);
  res.json({ data: rows.map(fmt), total: Number(count), page: p, limit: l });
});

router.post("/customers", async (req, res): Promise<void> => {
  const { name, company, contact_person, email, phone, address, city, tax_number, credit_limit, branch_id } = req.body;
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const branchId = await resolveWriteBranchId(req, branch_id != null ? Number(branch_id) : undefined);
  const [c] = await db.insert(customersTable).values({ branchId, name, company, contactPerson: contact_person, email, phone, address, city, taxNumber: tax_number, creditLimit: credit_limit?.toString() ?? "0" }).returning();
  res.status(201).json(fmt(c));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !isBranchInScope(req, c.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(fmt(c));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, company, contact_person, email, phone, address, city, tax_number, credit_limit } = req.body;
  const [existing] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (company !== undefined) updateData.company = company;
  if (contact_person !== undefined) updateData.contactPerson = contact_person;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;
  if (address !== undefined) updateData.address = address;
  if (city !== undefined) updateData.city = city;
  if (tax_number !== undefined) updateData.taxNumber = tax_number;
  if (credit_limit !== undefined) updateData.creditLimit = credit_limit.toString();
  const [c] = await db.update(customersTable).set(updateData).where(eq(customersTable.id, id)).returning();
  res.json(fmt(c));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!existing || !isBranchInScope(req, existing.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.sendStatus(204);
});

router.post("/customers/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, method = "cash", reference, notes } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) { res.status(400).json({ error: "amount must be a positive number" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !isBranchInScope(req, c.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  const createdBy = (req as { user?: { name?: string } }).user?.name ?? null;
  const [p] = await db.insert(partyPaymentsTable).values({ partyType: "customer", partyId: id, branchId: c.branchId, amount: amt.toString(), method, reference, notes, createdBy }).returning();
  const [updated] = await db.update(customersTable)
    .set({ balance: sql`GREATEST(0, ${customersTable.balance} - ${amt})` })
    .where(eq(customersTable.id, id)).returning();
  await logAudit(req, { action: "customer.payment", entityType: "customer", entityId: id, description: `Payment of KES ${amt.toLocaleString()} received from "${c.name}" via ${method}`, metadata: { reference: reference ?? null } });
  res.status(201).json({ id: p.id, customer_id: id, amount: amt, method, reference: reference ?? null, notes: notes ?? null, balance: Number(updated.balance), created_at: p.createdAt });
});

router.get("/customers/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !isBranchInScope(req, c.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  const rows = await db.select().from(partyPaymentsTable)
    .where(and(eq(partyPaymentsTable.partyType, "customer"), eq(partyPaymentsTable.partyId, id)))
    .orderBy(desc(partyPaymentsTable.createdAt)).limit(200);
  res.json(rows.map((r) => ({ id: r.id, amount: Number(r.amount), method: r.method, reference: r.reference, notes: r.notes, created_by: r.createdBy, created_at: r.createdAt })));
});

router.get("/customers/:id/ledger", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c || !isBranchInScope(req, c.branchId)) { res.status(404).json({ error: "Customer not found" }); return; }
  const sales = await db.select().from(salesTable).where(eq(salesTable.customerId, id)).orderBy(desc(salesTable.createdAt)).limit(200);
  const invoices = await db.select().from(invoicesTable).where(and(eq(invoicesTable.customerId, id), sql`${invoicesTable.status} != 'draft'`)).orderBy(desc(invoicesTable.createdAt)).limit(200);
  const payments = await db.select().from(partyPaymentsTable)
    .where(and(eq(partyPaymentsTable.partyType, "customer"), eq(partyPaymentsTable.partyId, id)))
    .orderBy(desc(partyPaymentsTable.createdAt)).limit(200);
  const entries = [
    ...sales.map((s) => ({ date: s.createdAt, type: "sale", reference: s.receiptNumber, debit: Number(s.total), credit: Number(s.amountPaid) > Number(s.total) ? Number(s.total) : Number(s.amountPaid), notes: s.paymentMethod })),
    ...invoices.map((i) => ({ date: i.createdAt, type: "invoice", reference: i.invoiceNumber, debit: Number(i.total), credit: Number(i.amountPaid), notes: i.status })),
    ...payments.map((p) => ({ date: p.createdAt, type: "payment", reference: p.reference ?? `PAY-${p.id}`, debit: 0, credit: Number(p.amount), notes: p.method })),
  ].sort((a, b) => new Date(b.date as unknown as string).getTime() - new Date(a.date as unknown as string).getTime());
  res.json(entries);
});

export default router;
