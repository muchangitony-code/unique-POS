/**
 * Security alert rule engine.
 * Called from logAudit after every write; evaluated asynchronously so
 * a slow DB query or email send never blocks the HTTP response.
 */
import { db, adminNotificationsTable, businessSettingsTable } from "@workspace/db";
import { desc, and, gte, sql } from "drizzle-orm";
import { auditLogTable } from "@workspace/db";
import { sendSecurityAlertEmail } from "./email";
import { logger } from "./logger";

// ─── Rule types ──────────────────────────────────────────────────────────────

export type RuleSeverity = "info" | "warning" | "critical";
export type RuleType = "action_match" | "threshold";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: RuleType;
  /** For action_match: exact action string to watch */
  actionPattern?: string;
  /** For threshold: action to count */
  thresholdAction?: string;
  /** For threshold: fire when count reaches this many events in windowMinutes */
  thresholdCount?: number;
  windowMinutes?: number;
  severity: RuleSeverity;
  notifyInApp: boolean;
  notifyEmail: boolean;
}

// ─── Built-in default rules ───────────────────────────────────────────────────

export const DEFAULT_RULES: AlertRule[] = [
  {
    id: "brute-force-login",
    name: "Repeated failed logins",
    description: "Fires when 5 or more failed login attempts occur within 10 minutes — possible brute-force attack.",
    enabled: true,
    type: "threshold",
    thresholdAction: "auth.login_failed",
    thresholdCount: 5,
    windowMinutes: 10,
    severity: "critical",
    notifyInApp: true,
    notifyEmail: true,
  },
  {
    id: "bulk-product-delete",
    name: "Bulk product deletions",
    description: "Fires when 3 or more products are deleted within 5 minutes — may indicate internal misuse.",
    enabled: true,
    type: "threshold",
    thresholdAction: "product.deleted",
    thresholdCount: 3,
    windowMinutes: 5,
    severity: "warning",
    notifyInApp: true,
    notifyEmail: true,
  },
  {
    id: "user-deleted",
    name: "User account deleted",
    description: "Fires whenever a user account is permanently deleted.",
    enabled: true,
    type: "action_match",
    actionPattern: "user.deleted",
    severity: "warning",
    notifyInApp: true,
    notifyEmail: false,
  },
  {
    id: "role-change",
    name: "Role or privilege change",
    description: "Fires whenever a user's role is changed — tracks privilege escalation.",
    enabled: true,
    type: "action_match",
    actionPattern: "user.updated",
    severity: "info",
    notifyInApp: true,
    notifyEmail: false,
  },
  {
    id: "settings-changed",
    name: "Business settings changed",
    description: "Fires whenever core business settings are modified.",
    enabled: false,
    type: "action_match",
    actionPattern: "settings.updated",
    severity: "info",
    notifyInApp: true,
    notifyEmail: false,
  },
];

// ─── Merge saved rules with defaults (adds new defaults, preserves user tweaks) ─

export function mergeRules(saved: AlertRule[] | null | undefined): AlertRule[] {
  if (!saved || saved.length === 0) return DEFAULT_RULES;
  const savedById = new Map(saved.map((r) => [r.id, r]));
  // Start from defaults, overlay any saved config for matching ids
  const merged = DEFAULT_RULES.map((def) => {
    const s = savedById.get(def.id);
    return s ? { ...def, ...s } : def;
  });
  // Append any custom rules not in defaults
  for (const r of saved) {
    if (!DEFAULT_RULES.find((d) => d.id === r.id)) merged.push(r);
  }
  return merged;
}

// ─── In-app notification writer ────────────────────────────────────────────────

async function createNotification(
  title: string,
  body: string,
  severity: RuleSeverity,
  ruleId: string,
  auditLogId?: number | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(adminNotificationsTable).values({
    title,
    body,
    severity,
    ruleId,
    auditLogId: auditLogId ?? null,
    metadata: metadata ?? null,
  });
}

// ─── Threshold helper ─────────────────────────────────────────────────────────

async function countRecentActions(action: string, windowMinutes: number): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(auditLogTable)
    .where(
      and(
        sql`${auditLogTable.action} = ${action}`,
        gte(auditLogTable.createdAt, since),
      ),
    );
  return Number(cnt);
}

// ─── Throttle: avoid duplicate alerts for threshold rules ────────────────────
// We check if we already created a notification for this rule in the last N minutes.

async function wasRecentlyAlerted(ruleId: string, windowMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(adminNotificationsTable)
    .where(
      and(
        sql`${adminNotificationsTable.ruleId} = ${ruleId}`,
        gte(adminNotificationsTable.createdAt, since),
      ),
    );
  return Number(cnt) > 0;
}

// ─── Send security alert email ────────────────────────────────────────────────

async function maybeSendEmail(
  rule: AlertRule,
  title: string,
  body: string,
  settings: { smtpHost?: string | null; smtpPort?: number | null; smtpUser?: string | null; smtpFrom?: string | null; businessEmail?: string | null; businessName?: string | null; securityAlertEnabled?: boolean },
): Promise<void> {
  if (!rule.notifyEmail) return;
  if (!settings.securityAlertEnabled) return;
  if (!settings.smtpHost || !settings.businessEmail) return;

  try {
    await sendSecurityAlertEmail({
      smtp: {
        host: settings.smtpHost,
        port: settings.smtpPort ?? 587,
        user: settings.smtpUser ?? "",
        from: settings.smtpFrom ?? settings.smtpUser ?? "",
      },
      to: settings.businessEmail,
      subject: title,
      body,
      severity: rule.severity,
      appUrl: process.env.APP_URL
        ? process.env.APP_URL.replace(/\/$/, "")
        : "http://localhost",
      companyName: settings.businessName ?? undefined,
    });
  } catch (err) {
    logger.error({ err, ruleId: rule.id }, "Failed to send security alert email — non-fatal");
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface AuditEventMeta {
  action: string;
  auditLogId?: number;
  actorName?: string | null;
  entityType?: string;
  entityId?: string | number;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function evaluateAlertRules(event: AuditEventMeta): Promise<void> {
  try {
    // Fetch settings + rules
    const [settings] = await db.select().from(businessSettingsTable);
    if (!settings) return;

    // Type-safe access for our new fields (added via migration)
    const rawSettings = settings as typeof settings & {
      securityAlertEnabled?: boolean;
      alertRules?: AlertRule[] | null;
    };

    const securityAlertEnabled = rawSettings.securityAlertEnabled !== false; // default true
    if (!securityAlertEnabled) return;

    const rules = mergeRules(rawSettings.alertRules);

    for (const rule of rules) {
      if (!rule.enabled) continue;

      let shouldFire = false;
      let title = "";
      let body = "";

      if (rule.type === "action_match") {
        if (event.action === rule.actionPattern) {
          shouldFire = true;
          title = `[${rule.severity.toUpperCase()}] ${rule.name}`;
          body = `${event.description}${event.actorName ? ` (by ${event.actorName})` : ""}`;
        }
      } else if (rule.type === "threshold") {
        if (event.action === rule.thresholdAction) {
          const count = await countRecentActions(rule.thresholdAction!, rule.windowMinutes ?? 10);
          if (count >= (rule.thresholdCount ?? 5)) {
            // Throttle: don't re-alert if we already fired within the same window
            const alerted = await wasRecentlyAlerted(rule.id, rule.windowMinutes ?? 10);
            if (!alerted) {
              shouldFire = true;
              title = `[${rule.severity.toUpperCase()}] ${rule.name}`;
              body = `${count} "${rule.thresholdAction}" events in the last ${rule.windowMinutes ?? 10} minutes. Last: ${event.description}`;
            }
          }
        }
      }

      if (!shouldFire) continue;

      if (rule.notifyInApp) {
        await createNotification(title, body, rule.severity, rule.id, event.auditLogId ?? null, {
          action: event.action,
          actor: event.actorName,
        });
      }

      await maybeSendEmail(rule, title, body, {
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
        smtpFrom: settings.smtpFrom,
        businessEmail: settings.businessEmail,
        businessName: settings.businessName,
        securityAlertEnabled,
      });
    }
  } catch (err) {
    logger.error({ err }, "Security alert evaluation failed — non-fatal");
  }
}
