import nodemailer from "nodemailer";
import { logger } from "./logger";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  from: string;
}

export interface BackupFailureEmailOpts {
  smtp: SmtpConfig;
  to: string;
  errorMessage: string;
  timestamp: string;
  appUrl: string;
  companyName?: string;
}

export interface BackupSuccessEmailOpts {
  smtp: SmtpConfig;
  to: string;
  filename: string;
  sizeBytes: number;
  timestamp: string;
  appUrl: string;
  companyName?: string;
}

function createTransport(smtp: SmtpConfig) {
  const password = process.env.SMTP_PASSWORD ?? "";
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: password } : undefined,
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function sendBackupFailureEmail(opts: BackupFailureEmailOpts): Promise<void> {
  const { smtp, to, errorMessage, timestamp, appUrl } = opts;
  const brand = opts.companyName || "UniquePOS";
  const transport = createTransport(smtp);
  const backupsUrl = `${appUrl}#settings/backups`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#ef4444;color:#fff;border-radius:8px 8px 0 0;padding:20px 24px;">
    <h1 style="margin:0;font-size:20px;">⚠️ Database Backup Failed</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p>The scheduled database backup for your ${brand} system failed at <strong>${timestamp}</strong>.</p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;font-family:monospace;color:#b91c1c;word-break:break-all;">${errorMessage}</p>
    </div>

    <p>Please review your backup settings and resolve the issue as soon as possible to avoid data loss.</p>

    <a href="${backupsUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;margin-top:8px;">
      Open Backup Settings →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;margin:0;">
      This alert was sent automatically by ${brand}. To disable failure alerts, visit Settings → Database Backups.
    </p>
  </div>
</body>
</html>`;

  const text = `Database Backup Failed — ${timestamp}\n\nError: ${errorMessage}\n\nPlease check your backup configuration at: ${backupsUrl}`;

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject: `[${brand}] ⚠️ Database backup failed — ${timestamp}`,
    text,
    html,
  });

  logger.info({ to }, "Backup failure alert email sent");
}

export async function sendBackupSuccessEmail(opts: BackupSuccessEmailOpts): Promise<void> {
  const { smtp, to, filename, sizeBytes, timestamp, appUrl } = opts;
  const brand = opts.companyName || "UniquePOS";
  const transport = createTransport(smtp);
  const backupsUrl = `${appUrl}#settings/backups`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#16a34a;color:#fff;border-radius:8px 8px 0 0;padding:20px 24px;">
    <h1 style="margin:0;font-size:20px;">✅ Database Backup Succeeded</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p>Your database was backed up successfully at <strong>${timestamp}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#6b7280;width:120px;">File</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:13px;">${filename}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#6b7280;">Size</td><td style="padding:8px;border:1px solid #e5e7eb;">${formatBytes(sizeBytes)}</td></tr>
    </table>
    <a href="${backupsUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;margin-top:8px;">
      View Backups →
    </a>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;margin:0;">
      To disable success notifications, visit Settings → Database Backups.
    </p>
  </div>
</body>
</html>`;

  const text = `Database Backup Succeeded — ${timestamp}\n\nFile: ${filename}\nSize: ${formatBytes(sizeBytes)}\n\nView backups at: ${backupsUrl}`;

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject: `[${brand}] ✅ Database backup succeeded — ${timestamp}`,
    text,
    html,
  });

  logger.info({ to }, "Backup success notification email sent");
}

// ─── Test email ───────────────────────────────────────────────────────────────

export interface TestEmailOpts {
  smtp: SmtpConfig;
  to: string;
  appUrl: string;
  companyName?: string;
}

export async function sendTestBackupEmail(opts: TestEmailOpts): Promise<void> {
  const { smtp, to, appUrl } = opts;
  const brand = opts.companyName || "UniquePOS";
  const transport = createTransport(smtp);
  const timestamp = new Date().toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#1e3a5f;color:#fff;border-radius:8px 8px 0 0;padding:20px 24px;">
    <h1 style="margin:0;font-size:20px;">✅ Backup Alerts Configured</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p>This is a test email from <strong>${brand}</strong> sent at <strong>${timestamp}</strong>.</p>
    <p>Your backup email notifications are configured correctly. You will receive alerts at this address when scheduled database backups fail or succeed.</p>
    <a href="${appUrl}#settings/backups" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;margin-top:8px;">
      Open Backup Settings →
    </a>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;margin:0;">
      Sent by ${brand} — Settings → Database Backups → Send test email.
    </p>
  </div>
</body>
</html>`;

  const text = `Backup Alerts Configured — ${timestamp}\n\nThis is a test email from ${brand}. Your backup email notifications are configured correctly.\n\n${appUrl}#settings/backups`;

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject: `[${brand}] ✅ Backup alerts are configured correctly`,
    text,
    html,
  });

  logger.info({ to }, "Test backup alert email sent");
}

// ─── Security alert email ─────────────────────────────────────────────────────

export interface SecurityAlertEmailOpts {
  smtp: SmtpConfig;
  to: string;
  subject: string;
  body: string;
  severity: "info" | "warning" | "critical";
  appUrl: string;
  companyName?: string;
}

export async function sendSecurityAlertEmail(opts: SecurityAlertEmailOpts): Promise<void> {
  const { smtp, to, subject, body, severity, appUrl } = opts;
  const brand = opts.companyName || "UniquePOS";
  const transport = createTransport(smtp);

  const severityColor: Record<string, string> = {
    info:     "#2563eb",
    warning:  "#d97706",
    critical: "#ef4444",
  };
  const severityLabel: Record<string, string> = {
    info:     "ℹ️ Info",
    warning:  "⚠️ Warning",
    critical: "🚨 Critical",
  };

  const bg = severityColor[severity] ?? "#2563eb";
  const label = severityLabel[severity] ?? severity;
  const auditUrl = `${appUrl}#audit-log`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:${bg};color:#fff;border-radius:8px 8px 0 0;padding:20px 24px;">
    <h1 style="margin:0;font-size:20px;">${label} — Security Alert</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p style="margin:0 0 16px;">${body}</p>
    <a href="${auditUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">
      View Audit Log →
    </a>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;margin:0;">
      This alert was sent automatically by ${brand}. Configure security alert rules in Settings → Security Alerts.
    </p>
  </div>
</body>
</html>`;

  const textBody = `${label} — Security Alert\n\n${body}\n\nView audit log: ${auditUrl}`;

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject: `[${brand}] ${subject}`,
    text: textBody,
    html,
  });

  logger.info({ to, severity }, "Security alert email sent");
}
