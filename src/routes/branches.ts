import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db, branchesTable, salesTable, invoicesTable, quotationsTable, purchasesTable,
  expensesTable, customersTable, suppliersTable, productStockTable, usersTable, stockMovementsTable, auditLogTable,
} from "@workspace/db";
import { requireSuperAdmin } from "../lib/permissions";
import { logAudit } from "../lib/audit";
import { getBranchScope } from "../lib/branch-scope";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

/**
 * Central branch-branding serializer. A persisted logo reference is not treated
 * as a valid display asset until storage confirms the object exists. Missing
 * branch logos are cleared at the API boundary so every consumer naturally
 * falls back to company branding instead of rendering a broken image.
 */
async function fmt(b: typeof branchesTable.$inferSelect) {
  let logoUrl = b.logoUrl;
  if (logoUrl && !/^https?:\/\//i.test(logoUrl) && !/^data:/i.test(logoUrl)) {
    const normalized = objectStorage.normalizeObjectEntityPath(logoUrl);
    if (normalized.startsWith("/objects/") && !(await objectStorage.objectExists(normalized))) {
      logoUrl = null;
    }
  }
  return {
    id: b.id, name: b.name, code: b.code, address: b.address, county: b.county,
    phone: b.phone, phone2: b.phone2, email: b.email, manager: b.manager, kra_pin: b.kraPin,
    paybill_number: b.paybillNumber, paybill_account: b.paybillAccount, till_number: b.tillNumber,
    bank_name: b.bankName, bank_account_name: b.bankAccountName, bank_account_number: b.bankAccountNumber,
    logo_url: logoUrl, receipt_footer: b.receiptFooter, invoice_footer: b.invoiceFooter,
    quotation_footer: b.quotationFooter, is_active: b.isActive, created_at: b.createdAt,
  };
}

function mapBody(body: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: "name", code: "code", address: "address", county: "county", phone: "phone",
    phone2: "phone2", email: "email", manager: "manager", kra_pin: "kraPin",
    paybill_number: "paybillNumber", paybill_account: "paybillAccount", till_number: "tillNumber",
    bank_name: "bankName", bank_account_name: "bankAccountName", bank_account_number: "bankAccountNumber",
    logo_url: "logoUrl", receipt_footer: "receiptFooter", invoice_footer: "invoiceFooter",
    quotation_footer: "quotationFooter", is_active: "isActive",
  };
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) out[col] = body[k];
  return out;
}

router.get("/branches", async (req, res): Promise<void> => {
  const scope = getBranchScope(req);
  const rows = await db.select().from(branchesTable).orderBy(branchesTable.id);
  const visible = scope.isSuper ? rows : rows.filter((b) => b.id === scope.userBranchId);
  res.json(await Promise.all(visible.map(fmt)));
});

router.get("/branches/options", async (_req, res): Promise<void> => {
  const rows = await db.select({ id: branchesTable.id, name: branchesTable.name, code: branchesTable.code, is_active: branchesTable.isActive }).from(branchesTable).orderBy(branchesTable.name);
  res.json(rows);
});

router.get("/branches/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const scope = getBranchScope(req);
  const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!b || (!scope.isSuper && b.id !== scope.userBranchId)) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(await fmt(b));
});

router.post("/branches", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, code } = req.body as Record<string, unknown>;
  if (!name || !code) { res.status(400).json({ error: "name and code required" }); return; }
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.code, String(code)));
  if (existing) { res.status(409).json({ error: "A branch with this code already exists" }); return; }
  const values = mapBody(req.body as Record<string, unknown>);
  const [b] = await db.insert(branchesTable).values(values as typeof branchesTable.$inferInsert).returning();
  await logAudit(req, { action: "branch.created", entityType: "branch", entityId: b.id, description: `Created branch "${b.name}" (${b.code})` });
  res.status(201).json(await fmt(b));
});

router.patch("/branches/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const body = req.body as Record<string, unknown>;
  if (body.code !== undefined && body.code !== existing.code) {
    const [dupe] = await db.select().from(branchesTable).where(eq(branchesTable.code, String(body.code)));
    if (dupe) { res.status(409).json({ error: "A branch with this code already exists" }); return; }
  }
  const values = mapBody(body);
  const [b] = Object.keys(values).length ? await db.update(branchesTable).set(values).where(eq(branchesTable.id, id)).returning() : [existing];
  await logAudit(req, { action: "branch.updated", entityType: "branch", entityId: b.id, description: `Updated branch "${b.name}" (${b.code})` });
  res.json(await fmt(b));
});

router.delete("/branches/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const count = async (t: any, col: any): Promise<number> => {
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(t).where(eq(col, id)); return Number(c);
  };
  const counts: [string, number][] = [
    ["sales", await count(salesTable, salesTable.branchId)], ["invoices", await count(invoicesTable, invoicesTable.branchId)],
    ["quotations", await count(quotationsTable, quotationsTable.branchId)], ["purchases", await count(purchasesTable, purchasesTable.branchId)],
    ["expenses", await count(expensesTable, expensesTable.branchId)], ["customers", await count(customersTable, customersTable.branchId)],
    ["suppliers", await count(suppliersTable, suppliersTable.branchId)], ["stock movements", await count(stockMovementsTable, stockMovementsTable.branchId)],
    ["product stock", await count(productStockTable, productStockTable.branchId)], ["users", await count(usersTable, usersTable.branchId)],
    ["audit records", await count(auditLogTable, auditLogTable.branchId)],
  ];
  const blocker = counts.find(([, n]) => n > 0);
  if (blocker) { res.status(409).json({ error: `Cannot delete a branch that has ${blocker[0]}. Deactivate it instead.`, has_records: true }); return; }
  await db.delete(branchesTable).where(eq(branchesTable.id, id));
  await logAudit(req, { action: "branch.deleted", entityType: "branch", entityId: id, description: `Deleted branch "${existing.name}" (${existing.code})` });
  res.sendStatus(204);
});

export default router;
