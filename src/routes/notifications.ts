import { Router, type IRouter } from "express";
import { db, adminNotificationsTable } from "@workspace/db";
import { desc, sql, eq, isNull, and, gte, lte, type SQL } from "drizzle-orm";

const router: IRouter = Router();

// Drizzle returns camelCase JS keys; serialize to snake_case for the frontend contract.
type DrizzleNotification = typeof adminNotificationsTable.$inferSelect;
function serialize(n: DrizzleNotification) {
  return {
    id:           n.id,
    created_at:   n.createdAt,
    title:        n.title,
    body:         n.body,
    severity:     n.severity,
    rule_id:      n.ruleId,
    audit_log_id: n.auditLogId ?? null,
    metadata:     n.metadata ?? null,
    read_at:      n.readAt ?? null,
  };
}

// GET /notifications — latest 50 admin notifications (newest first)
router.get("/notifications", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt))
    .limit(50);

  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)` })
    .from(adminNotificationsTable)
    .where(isNull(adminNotificationsTable.readAt));

  res.json({ notifications: rows.map(serialize), unread: Number(unread) });
});

// GET /notifications/all — paginated + filtered alert history
router.get("/notifications/all", async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt(String(req.query.page  ?? 1),  10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 25), 10) || 25));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (req.query.severity)  conditions.push(eq(adminNotificationsTable.severity, String(req.query.severity)));
  if (req.query.rule_id)   conditions.push(eq(adminNotificationsTable.ruleId,   String(req.query.rule_id)));
  if (req.query.date_from) conditions.push(gte(adminNotificationsTable.createdAt, new Date(String(req.query.date_from))));
  if (req.query.date_to) {
    const to = new Date(String(req.query.date_to));
    to.setDate(to.getDate() + 1); // inclusive end of day
    conditions.push(lte(adminNotificationsTable.createdAt, to));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }], ruleRows] = await Promise.all([
    db.select().from(adminNotificationsTable)
      .where(where)
      .orderBy(desc(adminNotificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(adminNotificationsTable).where(where),
    db.selectDistinct({ ruleId: adminNotificationsTable.ruleId })
      .from(adminNotificationsTable)
      .orderBy(adminNotificationsTable.ruleId),
  ]);

  res.json({
    data:       rows.map(serialize),
    total:      Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
    rules:      ruleRows.map((r) => r.ruleId),
  });
});

// PATCH /notifications/read-all — mark all as read
router.patch("/notifications/read-all", async (_req, res): Promise<void> => {
  await db
    .update(adminNotificationsTable)
    .set({ readAt: new Date() })
    .where(isNull(adminNotificationsTable.readAt));
  res.json({ ok: true });
});

// PATCH /notifications/:id/read — mark one as read
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(adminNotificationsTable)
    .set({ readAt: new Date() })
    .where(eq(adminNotificationsTable.id, id));
  res.json({ ok: true });
});

// DELETE /notifications — clear all notifications
router.delete("/notifications", async (_req, res): Promise<void> => {
  await db.delete(adminNotificationsTable);
  res.json({ ok: true });
});

export default router;
