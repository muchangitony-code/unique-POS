import type { Request } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { logger } from "./logger";
import type { JwtPayload } from "./auth";
import { evaluateAlertRules } from "./security-alerts";

export interface AuditEvent {
  action: string;
  entityType?: string;
  entityId?: string | number;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Errors are caught and logged — a failed audit write
 * must never break the main request flow.
 */
export async function logAudit(req: Request, event: AuditEvent): Promise<void> {
  try {
    const user = (req as Request & { user?: JwtPayload }).user;
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket?.remoteAddress ??
      null;

    const [row] = await db.insert(auditLogTable).values({
      branchId:   user?.branchId ?? null,
      actorId:    user?.userId ?? null,
      actorName:  user?.name   ?? null,
      actorRole:  user?.role   ?? null,
      ipAddress,
      action:      event.action,
      entityType:  event.entityType ?? null,
      entityId:    event.entityId != null ? String(event.entityId) : null,
      description: event.description,
      metadata:    event.metadata ?? null,
    }).returning({ id: auditLogTable.id });

    // Evaluate security alert rules asynchronously — must not block the caller
    setImmediate(() => {
      evaluateAlertRules({
        action:      event.action,
        auditLogId:  row?.id,
        actorName:   user?.name ?? null,
        entityType:  event.entityType,
        entityId:    event.entityId,
        description: event.description,
        metadata:    event.metadata,
      }).catch((err) => logger.error({ err }, "evaluateAlertRules failed — non-fatal"));
    });
  } catch (err) {
    logger.error({ err, event }, "Failed to write audit log — non-fatal");
  }
}
