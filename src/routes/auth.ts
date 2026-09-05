import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db, usersTable } from "@workspace/db";
import { signToken, hashPassword, comparePassword, requireAuth, type JwtPayload } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { recordLogin } from "../lib/login-history";
import { getSecurityPolicy, validatePassword } from "../lib/security-policy";
import { generateTotpSecret, verifyTotp, buildOtpauthUri } from "../lib/totp";

const router: IRouter = Router();

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branch: user.branch,
    branch_id: user.branchId ?? null,
    phone: user.phone,
    is_active: user.isActive,
    two_factor_enabled: user.totpEnabled ?? false,
    created_at: user.createdAt,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password, totp_code } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.isActive) {
    await recordLogin(req, { userId: user?.id ?? null, email, success: false, reason: user ? "inactive" : "unknown_user" });
    await logAudit(req, { action: "auth.login_failed", entityType: "user", entityId: user?.id, description: `Failed login attempt for "${email}" — user not found or inactive` });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const policy = await getSecurityPolicy();

  // Account lock check.
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    await recordLogin(req, { userId: user.id, email, success: false, reason: "account_locked" });
    res.status(423).json({ error: `Account locked due to failed login attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    await registerFailedAttempt(user.id, policy);
    await recordLogin(req, { userId: user.id, email, success: false, reason: "wrong_password" });
    await logAudit(req, { action: "auth.login_failed", entityType: "user", entityId: user.id, description: `Failed login attempt for "${email}" — wrong password` });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Password OK — enforce 2FA if enabled for this user.
  if (user.totpEnabled && user.totpSecret) {
    if (!totp_code) {
      res.json({ two_factor_required: true });
      return;
    }
    if (!verifyTotp(user.totpSecret, String(totp_code))) {
      await registerFailedAttempt(user.id, policy);
      await recordLogin(req, { userId: user.id, email, success: false, reason: "invalid_2fa" });
      await logAudit(req, { action: "auth.login_failed", entityType: "user", entityId: user.id, description: `Failed 2FA for "${email}"` });
      res.status(401).json({ error: "Invalid authentication code" });
      return;
    }
  }

  // Success — reset lockout counters and issue a token.
  await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, user.id));
  await recordLogin(req, { userId: user.id, email, success: true });
  await logAudit(req, { action: "auth.login", entityType: "user", entityId: user.id, description: `"${user.name}" logged in (${user.role})` });

  const token = signToken(
    { userId: user.id, email: user.email, role: user.role, name: user.name, branchId: user.branchId ?? null },
    policy.sessionTimeoutMinutes * 60,
  );
  res.json({ token, user: publicUser(user) });
});

/**
 * Atomically increment a user's failed-attempt counter and lock the account when it
 * reaches the limit. The increment and the lock decision happen inside a single SQL
 * statement so concurrent bad logins cannot lose updates (undercount) and weaken the
 * lockout. When locking, the counter is reset so the next window starts fresh.
 */
async function registerFailedAttempt(userId: number, policy: { maxFailedLogins: number; lockoutMinutes: number }): Promise<void> {
  const lockoutMs = policy.lockoutMinutes * 60000;
  if (policy.maxFailedLogins > 0) {
    // CASE: if the (incremented) counter reaches the limit, lock and reset to 0;
    // otherwise just increment. Evaluated atomically against the current row value.
    await db.execute(sql`
      UPDATE users
      SET failed_login_attempts = CASE
            WHEN failed_login_attempts + 1 >= ${policy.maxFailedLogins} THEN 0
            ELSE failed_login_attempts + 1
          END,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= ${policy.maxFailedLogins}
              THEN NOW() + (${lockoutMs} || ' milliseconds')::interval
            ELSE locked_until
          END
      WHERE id = ${userId}
    `);
  } else {
    // Lockout disabled — still track the count for visibility.
    await db.execute(sql`
      UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ${userId}
    `);
  }
}

router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Logged out" });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }
  res.json({ message: "If that email exists, a reset link has been sent." });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { password } = req.body ?? {};
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  res.json({ message: "Password reset successful" });
});

// Change the signed-in user's own password. Enforces the org password policy.
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as typeof req & { user?: JwtPayload }).user;
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { current_password, new_password } = req.body ?? {};
  if (!current_password || !new_password) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const ok = await comparePassword(current_password, user.passwordHash);
  if (!ok) { res.status(400).json({ error: "Current password is incorrect" }); return; }

  const policy = await getSecurityPolicy();
  const policyError = validatePassword(new_password, policy);
  if (policyError) { res.status(400).json({ error: policyError }); return; }

  const hash = await hashPassword(new_password);
  await db.update(usersTable).set({ passwordHash: hash, passwordChangedAt: new Date() }).where(eq(usersTable.id, user.id));
  await logAudit(req, { action: "auth.password_changed", entityType: "user", entityId: user.id, description: `"${user.name}" changed their password` });
  res.json({ ok: true });
});

// ─── Two-factor authentication (TOTP) ───────────────────────────────────────

router.get("/auth/2fa/status", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as typeof req & { user?: JwtPayload }).user;
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ enabled: user.totpEnabled ?? false });
});

// Begin 2FA setup: generate a secret + QR code. Not active until verified.
router.post("/auth/2fa/setup", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as typeof req & { user?: JwtPayload }).user;
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const secret = generateTotpSecret();
  await db.update(usersTable).set({ totpSecret: secret, totpEnabled: false }).where(eq(usersTable.id, user.id));

  const otpauthUri = buildOtpauthUri(secret, user.email, "UniquePOS");
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  res.json({ secret, otpauth_uri: otpauthUri, qr_data_url: qrDataUrl });
});

// Confirm and enable 2FA by verifying a code from the authenticator app.
router.post("/auth/2fa/enable", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as typeof req & { user?: JwtPayload }).user;
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { code } = req.body ?? {};
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.totpSecret) { res.status(400).json({ error: "Start 2FA setup first" }); return; }
  if (!code || !verifyTotp(user.totpSecret, String(code))) {
    res.status(400).json({ error: "Invalid code. Make sure your device time is correct and try again." });
    return;
  }
  await db.update(usersTable).set({ totpEnabled: true }).where(eq(usersTable.id, user.id));
  await logAudit(req, { action: "auth.2fa_enabled", entityType: "user", entityId: user.id, description: `"${user.name}" enabled two-factor authentication` });
  res.json({ enabled: true });
});

// Disable 2FA (requires the account password as confirmation).
router.post("/auth/2fa/disable", requireAuth, async (req, res): Promise<void> => {
  const auth = (req as typeof req & { user?: JwtPayload }).user;
  if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { password } = req.body ?? {};
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!password || !(await comparePassword(password, user.passwordHash))) {
    res.status(400).json({ error: "Password is incorrect" });
    return;
  }
  await db.update(usersTable).set({ totpEnabled: false, totpSecret: null }).where(eq(usersTable.id, user.id));
  await logAudit(req, { action: "auth.2fa_disabled", entityType: "user", entityId: user.id, description: `"${user.name}" disabled two-factor authentication` });
  res.json({ enabled: false });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user?: { userId: number } }).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [found] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
  if (!found) { res.status(404).json({ error: "User not found" }); return; }
  res.json(publicUser(found));
});

export default router;
