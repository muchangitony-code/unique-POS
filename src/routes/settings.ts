import { Router, type IRouter } from "express";
import { db, businessSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRole, requireSuperAdmin } from "../lib/permissions";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

type SettingsRow = typeof businessSettingsTable.$inferSelect & {
  securityAlertEnabled?: boolean;
  alertRules?: unknown;
};

function fmt(s: SettingsRow) {
  return {
    id: s.id,
    business_name: s.businessName,
    business_address: s.businessAddress,
    business_phone: s.businessPhone,
    business_email: s.businessEmail,
    tax_number: s.taxNumber,
    currency: s.currency,
    currency_symbol: s.currencySymbol,
    vat_rate: Number(s.vatRate),
    logo_url: s.logoUrl,
    receipt_footer: s.receiptFooter,
    fiscal_year_start: s.fiscalYearStart,
    country: s.country,
    timezone: s.timezone,
    created_at: s.createdAt,
    // SMTP / notification fields
    smtp_host: s.smtpHost,
    smtp_port: s.smtpPort,
    smtp_user: s.smtpUser,
    smtp_from: s.smtpFrom,
    backup_alert_enabled: s.backupAlertEnabled,
    backup_success_notify: s.backupSuccessNotify,
    // Security alert fields
    security_alert_enabled: s.securityAlertEnabled !== false,
    alert_rules: s.alertRules ?? null,
    // Payment settings
    mpesa_paybill: s.mpesaPaybill ?? null,
    mpesa_paybill_account: s.mpesaPaybillAccount ?? null,
    mpesa_till: s.mpesaTill ?? null,
    mpesa_buy_goods: s.mpesaBuyGoods ?? null,
    bank_name: s.bankName ?? null,
    bank_branch: s.bankBranch ?? null,
    bank_account_name: s.bankAccountName ?? null,
    bank_account_number: s.bankAccountNumber ?? null,
    bank_swift_code: s.bankSwiftCode ?? null,
    other_payment_methods: s.otherPaymentMethods ?? null,
    payment_instructions: s.paymentInstructions ?? null,
    // Company branding & document settings
    tagline: s.tagline ?? null,
    website: s.website ?? null,
    vat_number: s.vatNumber ?? null,
    business_phone2: s.businessPhone2 ?? null,
    primary_color: s.primaryColor ?? null,
    secondary_color: s.secondaryColor ?? null,
    stamp_url: s.stampUrl ?? null,
    signature_url: s.signatureUrl ?? null,
    document_footer: s.documentFooter ?? null,
    warranty_text: s.warrantyText ?? null,
    return_policy: s.returnPolicy ?? null,
    quotation_validity_days: s.quotationValidityDays ?? null,
    invoice_payment_terms: s.invoicePaymentTerms ?? null,
    body_font: s.bodyFont ?? null,
    heading_font: s.headingFont ?? null,
    // Security policy & session settings
    session_timeout_minutes: s.sessionTimeoutMinutes ?? 10080,
    password_min_length: s.passwordMinLength ?? 8,
    password_require_uppercase: s.passwordRequireUppercase ?? true,
    password_require_number: s.passwordRequireNumber ?? true,
    password_require_symbol: s.passwordRequireSymbol ?? false,
    max_failed_logins: s.maxFailedLogins ?? 5,
    lockout_minutes: s.lockoutMinutes ?? 15,
  };
}

/** Branding subset that is safe to expose publicly (no payment/SMTP data). */
function fmtBranding(s: SettingsRow) {
  return {
    business_name: s.businessName,
    tagline: s.tagline ?? null,
    business_address: s.businessAddress ?? null,
    business_phone: s.businessPhone ?? null,
    business_phone2: s.businessPhone2 ?? null,
    business_email: s.businessEmail ?? null,
    website: s.website ?? null,
    logo_url: s.logoUrl ?? null,
    primary_color: s.primaryColor ?? null,
    secondary_color: s.secondaryColor ?? null,
    tax_number: s.taxNumber ?? null,
    vat_number: s.vatNumber ?? null,
    document_footer: s.documentFooter ?? null,
    stamp_url: s.stampUrl ?? null,
    signature_url: s.signatureUrl ?? null,
    warranty_text: s.warrantyText ?? null,
    return_policy: s.returnPolicy ?? null,
    body_font: s.bodyFont ?? null,
    heading_font: s.headingFont ?? null,
  };
}

/** Payment field names accepted by PATCH /settings/payment. */
const PAYMENT_FIELDS: Array<[string, keyof typeof businessSettingsTable.$inferInsert]> = [
  ["mpesa_paybill", "mpesaPaybill"],
  ["mpesa_paybill_account", "mpesaPaybillAccount"],
  ["mpesa_till", "mpesaTill"],
  ["mpesa_buy_goods", "mpesaBuyGoods"],
  ["bank_name", "bankName"],
  ["bank_branch", "bankBranch"],
  ["bank_account_name", "bankAccountName"],
  ["bank_account_number", "bankAccountNumber"],
  ["bank_swift_code", "bankSwiftCode"],
  ["other_payment_methods", "otherPaymentMethods"],
  ["payment_instructions", "paymentInstructions"],
];

router.get("/settings", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(businessSettingsTable);
  if (!settings) {
    const [s] = await db.insert(businessSettingsTable).values({}).returning();
    res.json(fmt(s));
    return;
  }
  res.json(fmt(settings));
});

// Public branding — readable without authentication so the login page and
// print/preview windows can render the company logo, name and colours.
// Only exposes non-sensitive branding fields (never payment/SMTP details).
router.get("/settings/branding", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(businessSettingsTable);
  if (!settings) {
    const [s] = await db.insert(businessSettingsTable).values({}).returning();
    res.json(fmtBranding(s));
    return;
  }
  res.json(fmtBranding(settings));
});

router.patch("/settings", requireRole("administrator"), async (req, res): Promise<void> => {
  const {
    business_name, business_address, business_phone, business_email,
    tax_number, currency, currency_symbol, vat_rate, receipt_footer,
    fiscal_year_start, country, timezone,
    smtp_host, smtp_port, smtp_user, smtp_from,
    backup_alert_enabled, backup_success_notify,
    security_alert_enabled, alert_rules,
  } = req.body;

  const updateData: Record<string, unknown> = {};
  if (business_name !== undefined) updateData.businessName = business_name;
  if (business_address !== undefined) updateData.businessAddress = business_address;
  if (business_phone !== undefined) updateData.businessPhone = business_phone;
  if (business_email !== undefined) updateData.businessEmail = business_email;
  if (tax_number !== undefined) updateData.taxNumber = tax_number;
  if (currency !== undefined) updateData.currency = currency;
  if (currency_symbol !== undefined) updateData.currencySymbol = currency_symbol;
  if (vat_rate !== undefined) updateData.vatRate = vat_rate.toString();
  if (receipt_footer !== undefined) updateData.receiptFooter = receipt_footer;
  if (fiscal_year_start !== undefined) updateData.fiscalYearStart = fiscal_year_start;
  if (country !== undefined) updateData.country = country;
  if (timezone !== undefined) updateData.timezone = timezone;
  if (smtp_host !== undefined) updateData.smtpHost = smtp_host || null;
  if (smtp_port !== undefined) updateData.smtpPort = Number(smtp_port);
  if (smtp_user !== undefined) updateData.smtpUser = smtp_user || null;
  if (smtp_from !== undefined) updateData.smtpFrom = smtp_from || null;
  if (backup_alert_enabled !== undefined) updateData.backupAlertEnabled = Boolean(backup_alert_enabled);
  if (backup_success_notify !== undefined) updateData.backupSuccessNotify = Boolean(backup_success_notify);
  if (security_alert_enabled !== undefined) updateData.securityAlertEnabled = Boolean(security_alert_enabled);
  if (alert_rules !== undefined) updateData.alertRules = Array.isArray(alert_rules) ? alert_rules : null;

  const [existing] = await db.select().from(businessSettingsTable);
  let s;
  if (existing) {
    const beforeSnap = fmt(existing);
    [s] = await db.update(businessSettingsTable).set(updateData).where(sql`${businessSettingsTable.id} = ${existing.id}`).returning();
    const afterSnap = fmt(s!);
    // Strip SMTP sensitive fields from snapshots before storing
    const sanitize = (o: Record<string, unknown>) => { const c = { ...o }; delete c.smtp_host; delete c.smtp_user; delete c.smtp_from; return c; };
    await logAudit(req, {
      action: "settings.updated",
      entityType: "settings",
      description: `Updated business settings — changed: ${Object.keys(updateData).join(", ")}`,
      metadata: { before: sanitize(beforeSnap as unknown as Record<string, unknown>), after: sanitize(afterSnap as unknown as Record<string, unknown>) },
    });
  } else {
    [s] = await db.insert(businessSettingsTable).values({}).returning();
    await logAudit(req, {
      action: "settings.updated",
      entityType: "settings",
      description: `Initialised business settings`,
      metadata: {},
    });
  }
  res.json(fmt(s!));
});

// Company branding & document settings — restricted to super administrators.
// These fields drive the app-wide theme, logos, and every printed/emailed
// document, so only owners (super admin / business owner) may change them.
// Reads happen via GET /settings (auth) and the public GET /settings/branding.
router.patch("/settings/branding", requireSuperAdmin, async (req, res): Promise<void> => {
  const {
    logo_url, stamp_url, signature_url,
    tagline, website, vat_number, business_phone2,
    primary_color, secondary_color, body_font, heading_font,
    document_footer, warranty_text, return_policy,
    quotation_validity_days, invoice_payment_terms,
  } = req.body;

  const updateData: Record<string, unknown> = {};
  if (logo_url !== undefined) updateData.logoUrl = logo_url || null;
  if (stamp_url !== undefined) updateData.stampUrl = stamp_url || null;
  if (signature_url !== undefined) updateData.signatureUrl = signature_url || null;
  if (tagline !== undefined) updateData.tagline = tagline || null;
  if (website !== undefined) updateData.website = website || null;
  if (vat_number !== undefined) updateData.vatNumber = vat_number || null;
  if (business_phone2 !== undefined) updateData.businessPhone2 = business_phone2 || null;
  if (primary_color !== undefined) updateData.primaryColor = primary_color || null;
  if (secondary_color !== undefined) updateData.secondaryColor = secondary_color || null;
  if (body_font !== undefined) updateData.bodyFont = body_font || null;
  if (heading_font !== undefined) updateData.headingFont = heading_font || null;
  if (document_footer !== undefined) updateData.documentFooter = document_footer || null;
  if (warranty_text !== undefined) updateData.warrantyText = warranty_text || null;
  if (return_policy !== undefined) updateData.returnPolicy = return_policy || null;
  if (quotation_validity_days !== undefined) updateData.quotationValidityDays = quotation_validity_days === null || quotation_validity_days === "" ? null : Number(quotation_validity_days);
  if (invoice_payment_terms !== undefined) updateData.invoicePaymentTerms = invoice_payment_terms || null;

  const [existing] = await db.select().from(businessSettingsTable);
  let s;
  if (existing) {
    const beforeSnap = fmt(existing);
    [s] = await db.update(businessSettingsTable).set(updateData).where(sql`${businessSettingsTable.id} = ${existing.id}`).returning();
    const afterSnap = fmt(s!);
    await logAudit(req, {
      action: "settings.branding_updated",
      entityType: "settings",
      description: `Updated branding & document settings — changed: ${Object.keys(updateData).join(", ") || "(none)"}`,
      metadata: { before: beforeSnap, after: afterSnap },
    });
  } else {
    [s] = await db.insert(businessSettingsTable).values(updateData).returning();
    await logAudit(req, {
      action: "settings.branding_updated",
      entityType: "settings",
      description: `Initialised branding & document settings`,
      metadata: {},
    });
  }
  res.json(fmt(s!));
});

// Payment settings — restricted to super administrators. All authenticated users
// can READ payment details (via GET /settings) so documents render, but only
// super admins may change them.
router.patch("/settings/payment", requireSuperAdmin, async (req, res): Promise<void> => {
  const updateData: Record<string, unknown> = {};
  for (const [apiKey, col] of PAYMENT_FIELDS) {
    if (req.body[apiKey] !== undefined) {
      const raw = req.body[apiKey];
      updateData[col] = raw === "" || raw === null ? null : String(raw).trim();
    }
  }

  const [existing] = await db.select().from(businessSettingsTable);
  let s;
  if (existing) {
    const beforeSnap = fmt(existing);
    [s] = await db.update(businessSettingsTable).set(updateData).where(sql`${businessSettingsTable.id} = ${existing.id}`).returning();
    const afterSnap = fmt(s!);
    await logAudit(req, {
      action: "settings.payment_updated",
      entityType: "settings",
      description: `Updated payment settings — changed: ${Object.keys(updateData).join(", ") || "(none)"}`,
      metadata: { before: beforeSnap, after: afterSnap },
    });
  } else {
    [s] = await db.insert(businessSettingsTable).values(updateData).returning();
    await logAudit(req, {
      action: "settings.payment_updated",
      entityType: "settings",
      description: `Initialised payment settings`,
      metadata: {},
    });
  }
  res.json(fmt(s!));
});

// Security policy & session settings — restricted to super administrators.
// All authenticated users can READ these (via GET /settings) but only super
// admins may change the org-wide password policy, lockout and session timeout.
router.patch("/settings/security", requireSuperAdmin, async (req, res): Promise<void> => {
  const {
    session_timeout_minutes, password_min_length,
    password_require_uppercase, password_require_number, password_require_symbol,
    max_failed_logins, lockout_minutes,
  } = req.body;

  const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const updateData: Record<string, unknown> = {};
  if (session_timeout_minutes !== undefined) updateData.sessionTimeoutMinutes = clampInt(session_timeout_minutes, 5, 43200, 10080);
  if (password_min_length !== undefined) updateData.passwordMinLength = clampInt(password_min_length, 6, 128, 8);
  if (password_require_uppercase !== undefined) updateData.passwordRequireUppercase = Boolean(password_require_uppercase);
  if (password_require_number !== undefined) updateData.passwordRequireNumber = Boolean(password_require_number);
  if (password_require_symbol !== undefined) updateData.passwordRequireSymbol = Boolean(password_require_symbol);
  if (max_failed_logins !== undefined) updateData.maxFailedLogins = clampInt(max_failed_logins, 0, 20, 5);
  if (lockout_minutes !== undefined) updateData.lockoutMinutes = clampInt(lockout_minutes, 1, 1440, 15);

  const [existing] = await db.select().from(businessSettingsTable);
  let s;
  if (existing) {
    [s] = await db.update(businessSettingsTable).set(updateData).where(sql`${businessSettingsTable.id} = ${existing.id}`).returning();
    await logAudit(req, {
      action: "settings.security_updated",
      entityType: "settings",
      description: `Updated security policy — changed: ${Object.keys(updateData).join(", ") || "(none)"}`,
    });
  } else {
    [s] = await db.insert(businessSettingsTable).values(updateData).returning();
    await logAudit(req, { action: "settings.security_updated", entityType: "settings", description: `Initialised security policy` });
  }
  res.json(fmt(s!));
});

export default router;
