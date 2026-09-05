import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { JwtPayload } from "../lib/auth";
import { requireRole } from "../lib/permissions";

const router: IRouter = Router();

/**
 * POST /api/admin/reset-transactional-data
 *
 * One-time production cleanup: truncates all transactional tables
 * (sales, invoices, quotations, purchases, expenses, stock_movements
 * and their child tables) and resets their sequences to 1.
 *
 * Requires a valid super_admin JWT.
 * Business settings, products, categories, brands, and users are untouched.
 */
router.post("/admin/reset-transactional-data", async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "super_admin role required" });
    return;
  }

  try {
    await db.execute(sql`
      TRUNCATE
        sale_items,
        invoice_items,
        invoice_payments,
        quotation_items,
        purchase_items,
        sales,
        invoices,
        quotations,
        purchases,
        expenses,
        stock_movements
      RESTART IDENTITY CASCADE
    `);

    res.json({
      ok: true,
      message: "All transactional data cleared. Sequences reset to 1.",
      cleared: [
        "sales", "sale_items",
        "invoices", "invoice_items", "invoice_payments",
        "quotations", "quotation_items",
        "purchases", "purchase_items",
        "expenses", "stock_movements"
      ]
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Reset failed", detail: message });
  }
});

export default router;
