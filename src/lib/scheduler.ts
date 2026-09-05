import cron from "node-cron";
import { runBackup } from "./backup";
import { logger } from "./logger";
import { sendBackupFailureEmail, sendBackupSuccessEmail } from "./email";
import { db, businessSettingsTable } from "@workspace/db";

async function getNotificationSettings() {
  const [s] = await db.select().from(businessSettingsTable);
  return s ?? null;
}

function resolveAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * Start all scheduled jobs.
 * Call once at server startup, after migrations have run.
 */
export function startScheduler(): void {
  // Daily database backup at 02:00 Africa/Nairobi (UTC+3)
  cron.schedule(
    "0 2 * * *",
    async () => {
      logger.info("Scheduled backup starting");
      const timestamp = new Date().toLocaleString("en-KE", {
        timeZone: "Africa/Nairobi",
        dateStyle: "medium",
        timeStyle: "short",
      });

      let result: Awaited<ReturnType<typeof runBackup>> | null = null;
      let backupError: Error | null = null;

      try {
        result = await runBackup();
        logger.info({ result }, "Scheduled backup succeeded");
      } catch (err) {
        backupError = err instanceof Error ? err : new Error(String(err));
        logger.error({ err }, "Scheduled backup failed");
      }

      // Send notification email (non-blocking — never let email failure crash the job)
      try {
        const settings = await getNotificationSettings();
        const to = settings?.businessEmail;
        const smtpHost = settings?.smtpHost;

        if (settings && to && smtpHost) {
          const smtp = {
            host: smtpHost,
            port: settings.smtpPort ?? 587,
            user: settings.smtpUser ?? "",
            from: settings.smtpFrom ?? settings.smtpUser ?? "",
          };
          const appUrl = resolveAppUrl();

          if (backupError && settings.backupAlertEnabled) {
            await sendBackupFailureEmail({
              smtp,
              to,
              errorMessage: backupError.message,
              timestamp,
              appUrl,
              companyName: settings.businessName ?? undefined,
            });
          } else if (result && settings.backupSuccessNotify) {
            await sendBackupSuccessEmail({
              smtp,
              to,
              filename: result.filename,
              sizeBytes: result.size,
              timestamp,
              appUrl,
              companyName: settings.businessName ?? undefined,
            });
          }
        }
      } catch (emailErr) {
        logger.warn({ emailErr }, "Failed to send backup notification email");
      }
    },
    { timezone: "Africa/Nairobi" }
  );

  logger.info("Scheduler started — daily backup at 02:00 Africa/Nairobi");
}
