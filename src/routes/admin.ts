import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { JwtPayload } from "../lib/auth";

const router: IRouter = Router();

/**
 * POST /api/admin/reset-test-sales
 *
 * Clean-start operation for test POS data only.
 * Reverses sale/return stock movements and customer credit effects,
 * then removes all POS sales and sale returns.
 *
 * Products, catalogue, branches, users, opening stock and all non-sale
 * inventory movements are preserved.
 */
router.post("/admin/reset-test-sales", async (req: Request, res: Response): Promise<void> => {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "super_admin role required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const count = async (table: string): Promise<number> => {
        const r = await tx.execute(sql`SELECT count(*)::bigint AS count FROM ${sql.identifier(table)}`);
        return Number(r.rows[0]?.count ?? 0);
      };

      const before = {
        sales: await count("sales"),
        saleItems: await count("sale_items"),
        saleReturns: await count("sale_returns"),
        saleReturnItems: await count("sale_return_items"),
        saleStockMovements: Number((await tx.execute(sql`
          SELECT count(*)::bigint AS count
          FROM stock_movements
          WHERE lower(type) IN ('sale', 'return')
        `)).rows[0]?.count ?? 0),
      };

      // Undo the outstanding credit effect of every test sale. Returns are
      // deducted because they already reduced the customer's balance.
      await tx.execute(sql`
        UPDATE customers c
        SET balance = GREATEST(0, c.balance - x.net_unpaid)
        FROM (
          SELECT s.customer_id,
                 SUM(GREATEST(
                   s.total - s.amount_paid
                   - COALESCE((
                       SELECT SUM(sr.total)
                       FROM sale_returns sr
                       WHERE sr.sale_id = s.id
                     ), 0),
                   0
                 )) AS net_unpaid
          FROM sales s
          WHERE s.customer_id IS NOT NULL
          GROUP BY s.customer_id
        ) x
        WHERE c.id = x.customer_id
      `);

      // Sales reduce stock and returns increase it. Reversing the net of both
      // restores each product/branch to the quantity before testing started.
      await tx.execute(sql`
        UPDATE product_stock ps
        SET current_stock = ps.current_stock - x.net_change
        FROM (
          SELECT product_id, branch_id, SUM(quantity) AS net_change
          FROM stock_movements
          WHERE lower(type) IN ('sale', 'return')
          GROUP BY product_id, branch_id
        ) x
        WHERE ps.product_id = x.product_id
          AND ps.branch_id = x.branch_id
      `);

      await tx.execute(sql`
        DELETE FROM stock_movements
        WHERE lower(type) IN ('sale', 'return')
      `);

      // Remove returns first because they reference sales.
      await tx.execute(sql`TRUNCATE sale_return_items RESTART IDENTITY CASCADE`);
      await tx.execute(sql`TRUNCATE sale_returns RESTART IDENTITY CASCADE`);
      await tx.execute(sql`TRUNCATE sale_items RESTART IDENTITY CASCADE`);
      await tx.execute(sql`TRUNCATE sales RESTART IDENTITY CASCADE`);

      const after = {
        sales: await count("sales"),
        saleItems: await count("sale_items"),
        saleReturns: await count("sale_returns"),
        saleReturnItems: await count("sale_return_items"),
        saleStockMovements: Number((await tx.execute(sql`
          SELECT count(*)::bigint AS count
          FROM stock_movements
          WHERE lower(type) IN ('sale', 'return')
        `)).rows[0]?.count ?? 0),
      };

      if (after.sales !== 0 || after.saleItems !== 0 || after.saleReturns !== 0 ||
          after.saleReturnItems !== 0 || after.saleStockMovements !== 0) {
        throw new Error("Clean-start verification failed; transaction rolled back.");
      }

      return { before, after };
    });

    res.json({
      ok: true,
      message: "All test POS sales removed, sale-related stock restored, and POS is ready for live sales.",
      ...result,
      preserved: [
        "products and product catalogue",
        "categories and brands",
        "branches and users",
        "opening stock",
        "non-sale inventory movements",
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Test-sale reset failed", detail: message });
  }
});

/**
 * The old reset endpoint is intentionally disabled because it referenced the
 * obsolete transactional reset that could affect unrelated documents.
 */
router.post("/admin/reset-transactional-data", async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({
    error: "Endpoint replaced",
    message: "Use POST /api/admin/reset-test-sales for the POS clean-start reset.",
  });
});

export default router;
