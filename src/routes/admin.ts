import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { JwtPayload } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

type TransactionType = "sale" | "invoice" | "quotation";
type TransactionRef = { type: TransactionType; id: number };

function currentUser(req: Request): JwtPayload | undefined {
  return (req as Request & { user?: JwtPayload }).user;
}

function isAdmin(req: Request): boolean {
  const role = currentUser(req)?.role;
  return role === "administrator" || role === "super_admin";
}

function isSuperAdmin(req: Request): boolean {
  return currentUser(req)?.role === "super_admin";
}

function validRefs(value: unknown): TransactionRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is { type?: unknown; id?: unknown } => !!v && typeof v === "object")
    .map(v => ({ type: v.type as TransactionType, id: Number(v.id) }))
    .filter(v => ["sale", "invoice", "quotation"].includes(v.type) && Number.isInteger(v.id) && v.id > 0);
}

/**
 * GET /api/admin/test-transactions
 * Lists sales, invoices and quotations so an administrator can explicitly
 * mark test records before they become eligible for deletion.
 */
router.get("/admin/test-transactions", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "administrator role required" });
    return;
  }
  try {
    const result = await db.execute(sql`
      SELECT id, 'sale'::text AS type, receipt_number AS reference, created_at, total, branch_id, is_test
      FROM sales
      UNION ALL
      SELECT id, 'invoice'::text AS type, invoice_number AS reference, created_at, total, branch_id, is_test
      FROM invoices
      UNION ALL
      SELECT id, 'quotation'::text AS type, quotation_number AS reference, created_at, total, branch_id, is_test
      FROM quotations
      ORDER BY created_at DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Unable to load transactions", detail: message });
  }
});

/** Mark records as test data. Marking never deletes anything. */
router.post("/admin/test-transactions/mark", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "administrator role required" });
    return;
  }
  const refs = validRefs(req.body?.transactions);
  if (!refs.length) {
    res.status(400).json({ error: "No valid transactions supplied" });
    return;
  }
  try {
    for (const ref of refs) {
      if (ref.type === "sale") await db.execute(sql`UPDATE sales SET is_test = TRUE WHERE id = ${ref.id}`);
      if (ref.type === "invoice") await db.execute(sql`UPDATE invoices SET is_test = TRUE WHERE id = ${ref.id}`);
      if (ref.type === "quotation") await db.execute(sql`UPDATE quotations SET is_test = TRUE WHERE id = ${ref.id}`);
    }
    await logAudit(req, {
      action: "test_data.marked",
      entityType: "transaction",
      description: `Marked ${refs.length} transaction(s) as test data`,
      metadata: { transactions: refs },
    });
    res.json({ ok: true, message: `${refs.length} transaction(s) marked as test data.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Unable to mark test data", detail: message });
  }
});

async function deleteTestRefs(req: Request, refs: TransactionRef[]): Promise<number> {
  let deleted = 0;
  await db.transaction(async tx => {
    for (const ref of refs) {
      if (ref.type === "sale") {
        const items = await tx.execute(sql`SELECT product_id, quantity, branch_id FROM sale_items WHERE sale_id = ${ref.id}`);
        for (const item of items.rows as Array<{ product_id: number; quantity: number; branch_id: number }>) {
          // POS sales deduct on-hand stock. Put the tested quantity back before removing the sale.
          await tx.execute(sql`
            UPDATE product_stock
            SET current_stock = current_stock + ${Number(item.quantity)}
            WHERE product_id = ${Number(item.product_id)} AND branch_id = ${Number(item.branch_id)}
          `);
        }
        await tx.execute(sql`DELETE FROM sale_return_items WHERE sale_return_id IN (SELECT id FROM sale_returns WHERE sale_id = ${ref.id})`);
        await tx.execute(sql`DELETE FROM sale_returns WHERE sale_id = ${ref.id}`);
        await tx.execute(sql`DELETE FROM receipts WHERE sale_id = ${ref.id}`);
        await tx.execute(sql`DELETE FROM sale_items WHERE sale_id = ${ref.id}`);
        const result = await tx.execute(sql`DELETE FROM sales WHERE id = ${ref.id} AND is_test = TRUE`);
        deleted += Number(result.rowCount ?? 0);
      } else if (ref.type === "invoice") {
        await tx.execute(sql`DELETE FROM receipts WHERE invoice_id = ${ref.id}`);
        await tx.execute(sql`DELETE FROM invoice_payments WHERE invoice_id = ${ref.id}`);
        await tx.execute(sql`DELETE FROM invoice_items WHERE invoice_id = ${ref.id}`);
        const result = await tx.execute(sql`DELETE FROM invoices WHERE id = ${ref.id} AND is_test = TRUE`);
        deleted += Number(result.rowCount ?? 0);
      } else {
        await tx.execute(sql`DELETE FROM quotation_items WHERE quotation_id = ${ref.id}`);
        const result = await tx.execute(sql`DELETE FROM quotations WHERE id = ${ref.id} AND is_test = TRUE`);
        deleted += Number(result.rowCount ?? 0);
      }
    }
  });
  return deleted;
}

/** Delete selected records, but only records already marked is_test=true. */
router.post("/admin/test-transactions/delete", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "administrator role required" });
    return;
  }
  const refs = validRefs(req.body?.transactions);
  if (!refs.length) {
    res.status(400).json({ error: "No valid transactions supplied" });
    return;
  }
  try {
    const deleted = await deleteTestRefs(req, refs);
    await logAudit(req, {
      action: "test_data.deleted",
      entityType: "transaction",
      description: `Deleted ${deleted} selected test transaction(s)`,
      metadata: { requested: refs, deleted },
    });
    res.json({ ok: true, deleted, message: `${deleted} test transaction(s) deleted.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Test data deletion failed", detail: message });
  }
});

/** Bulk deletion is Super Admin only and affects marked test data only. */
router.post("/admin/test-transactions/delete-all", async (req: Request, res: Response): Promise<void> => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "super_admin role required for bulk deletion" });
    return;
  }
  if (req.body?.confirmation !== "DELETE ALL TEST DATA") {
    res.status(400).json({ error: "Confirmation phrase required" });
    return;
  }
  try {
    const candidates = await db.execute(sql`
      SELECT id, 'sale'::text AS type FROM sales WHERE is_test = TRUE
      UNION ALL SELECT id, 'invoice'::text AS type FROM invoices WHERE is_test = TRUE
      UNION ALL SELECT id, 'quotation'::text AS type FROM quotations WHERE is_test = TRUE
    `);
    const refs = candidates.rows.map((r: any) => ({ type: r.type as TransactionType, id: Number(r.id) }));
    const deleted = refs.length ? await deleteTestRefs(req, refs) : 0;
    await logAudit(req, {
      action: "test_data.bulk_deleted",
      entityType: "transaction",
      description: `Bulk deleted ${deleted} marked test transaction(s)`,
      metadata: { requested: refs, deleted, confirmation: "DELETE ALL TEST DATA" },
    });
    res.json({ ok: true, deleted, message: `${deleted} marked test transaction(s) deleted.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Bulk test data deletion failed", detail: message });
  }
});

export default router;
