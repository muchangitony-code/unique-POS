import { Router, type IRouter } from "express";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { db, loginHistoryTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /security/login-history — paginated sign-in activity (admin only; the
 * whole /security prefix is guarded by requireRole("administrator") in the
 * route index). Supports ?success=true|false and ?page/?page_size.
 */
router.get("/security/login-history", async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size ?? "25"), 10) || 25));
  const successFilter = req.query.success;

  const conditions = [];
  if (successFilter === "true") conditions.push(eq(loginHistoryTable.success, true));
  if (successFilter === "false") conditions.push(eq(loginHistoryTable.success, false));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginHistoryTable)
    .where(where);

  const rows = await db
    .select()
    .from(loginHistoryTable)
    .where(where)
    .orderBy(desc(loginHistoryTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Failed attempts in the last 24 hours (quick security signal).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ recentFailures }] = await db
    .select({ recentFailures: sql<number>`count(*)::int` })
    .from(loginHistoryTable)
    .where(and(eq(loginHistoryTable.success, false), gte(loginHistoryTable.createdAt, since)));

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      email: r.email,
      success: r.success,
      reason: r.reason,
      ip_address: r.ipAddress,
      user_agent: r.userAgent,
      created_at: r.createdAt,
    })),
    total: count,
    page,
    page_size: pageSize,
    recent_failures_24h: recentFailures,
  });
});

export default router;
