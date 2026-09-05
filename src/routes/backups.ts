import { Router, type IRouter, type Request, type Response } from "express";
import { runBackup, listBackups, getBackupStream, restoreBackup } from "../lib/backup";
import { sendBackupFailureEmail, sendBackupSuccessEmail, sendTestBackupEmail } from "../lib/email";
import { db, businessSettingsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router: IRouter = Router();

const ADMIN_ROLES = new Set(["super_admin", "business_owner"]);

/** Sanitize a backup filename — allow only safe characters */
function sanitizeFilename(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "");
}

function isAdmin(req: Request): boolean {
  const user = (req as Request & { user?: JwtPayload }).user;
  return !!user && ADMIN_ROLES.has(user.role);
}

function resolveAppUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // Fall back to the request's own host when APP_URL is not configured.
  return `${req.protocol}://${req.get("host")}`;
}

function nowEAT(): string {
  return new Date().toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** GET /api/admin/backups/status — most recent backup summary for dashboard widget */
router.get("/admin/backups/status", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const backups = await listBackups();
    if (backups.length === 0) {
      res.json({ hasBackup: false, latest: null });
      return;
    }
    const latest = backups[0];
    const ageMs = Date.now() - new Date(latest.createdAt).getTime();
    const stale = ageMs > 48 * 60 * 60 * 1000; // older than 48 hours
    res.json({ hasBackup: true, stale, latest });
  } catch (err) {
    logger.error({ err }, "Failed to get backup status");
    res.status(500).json({ error: "Failed to get backup status" });
  }
});

/** GET /api/admin/backups — list all stored backups */
router.get("/admin/backups", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (err) {
    logger.error({ err }, "Failed to list backups");
    res.status(500).json({ error: "Failed to list backups" });
  }
});

/** POST /api/admin/backups/run — trigger a manual backup immediately */
router.post("/admin/backups/run", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

  const timestamp = nowEAT();

  try {
    const result = await runBackup();

    await logAudit(req, {
      action: "backup.run",
      entityType: "backup",
      description: `Manual backup created: ${result.filename}`,
      metadata: { filename: result.filename, size: result.size },
    });

    res.json({ ok: true, backup: result });

    // Send success notification (non-blocking)
    try {
      const [settings] = await db.select().from(businessSettingsTable);
      if (settings?.businessEmail && settings?.smtpHost && settings?.backupSuccessNotify) {
        await sendBackupSuccessEmail({
          smtp: {
            host: settings.smtpHost,
            port: settings.smtpPort ?? 587,
            user: settings.smtpUser ?? "",
            from: settings.smtpFrom ?? settings.smtpUser ?? "",
          },
          to: settings.businessEmail,
          filename: result.filename,
          sizeBytes: result.size,
          timestamp,
          appUrl: resolveAppUrl(req),
      companyName: settings.businessName ?? undefined,
        });
      }
    } catch (emailErr) {
      logger.warn({ emailErr }, "Failed to send backup success email");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Manual backup failed");
    res.status(500).json({ error: "Backup failed", detail: message });

    // Send failure alert (non-blocking)
    try {
      const [settings] = await db.select().from(businessSettingsTable);
      if (settings?.businessEmail && settings?.smtpHost && settings?.backupAlertEnabled) {
        await sendBackupFailureEmail({
          smtp: {
            host: settings.smtpHost,
            port: settings.smtpPort ?? 587,
            user: settings.smtpUser ?? "",
            from: settings.smtpFrom ?? settings.smtpUser ?? "",
          },
          to: settings.businessEmail,
          errorMessage: message,
          timestamp,
          appUrl: resolveAppUrl(req),
      companyName: settings.businessName ?? undefined,
        });
      }
    } catch (emailErr) {
      logger.warn({ emailErr }, "Failed to send backup failure alert email");
    }
  }
});

/** POST /api/admin/backups/test-email — send a test backup alert email */
router.post("/admin/backups/test-email", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

  try {
    const [settings] = await db.select().from(businessSettingsTable);
    if (!settings?.smtpHost) {
      res.status(400).json({ error: "SMTP is not configured. Add an SMTP host in Settings → Database Backups." });
      return;
    }
    if (!settings?.businessEmail) {
      res.status(400).json({ error: "No business email configured. Add one in Settings → Business Settings." });
      return;
    }

    await sendTestBackupEmail({
      smtp: {
        host: settings.smtpHost,
        port: settings.smtpPort ?? 587,
        user: settings.smtpUser ?? "",
        from: settings.smtpFrom ?? settings.smtpUser ?? "",
      },
      to: settings.businessEmail,
      appUrl: resolveAppUrl(req),
      companyName: settings.businessName ?? undefined,
    });

    await logAudit(req, {
      action: "settings.test_email_sent",
      entityType: "settings",
      description: `Test backup alert email sent to ${settings.businessEmail}`,
    });

    res.json({ ok: true, sentTo: settings.businessEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to send test backup email");
    res.status(500).json({ error: "Failed to send test email", detail: message });
  }
});

/** POST /api/admin/backups/:filename/restore — DESTRUCTIVE: replace all data */
router.post("/admin/backups/:filename/restore", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

  const safeFilename = sanitizeFilename(String(req.params.filename ?? ""));
  if (!safeFilename) { res.status(400).json({ error: "Invalid filename" }); return; }

  // Require an explicit confirmation so a restore can never fire by accident.
  if (req.body?.confirm !== true && req.body?.confirm !== "true") {
    res.status(400).json({ error: "Restore requires explicit confirmation." });
    return;
  }

  try {
    await restoreBackup(safeFilename);
    await logAudit(req, {
      action: "backup.restore",
      entityType: "backup",
      description: `Database restored from backup: ${safeFilename}`,
      metadata: { filename: safeFilename },
    });
    res.json({ ok: true, restored: safeFilename });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, filename: safeFilename }, "Backup restore failed");
    res.status(500).json({ error: "Restore failed", detail: message });
  }
});

/** GET /api/admin/backups/:filename/download — stream a backup file */
router.get("/admin/backups/:filename/download", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

  // Sanitize BEFORE any use — same value goes to both lookup and header
  const safeFilename = sanitizeFilename(String(req.params.filename ?? ""));
  if (!safeFilename) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  try {
    const stream = await getBackupStream(safeFilename);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);

    stream.on("error", (err) => {
      logger.error({ err, filename: safeFilename }, "Backup stream error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Stream failed" });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: message });
  }
});

export default router;
