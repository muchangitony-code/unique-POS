import { db, businessSettingsTable } from "@workspace/db";

export interface SecurityPolicy {
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  maxFailedLogins: number;
  lockoutMinutes: number;
}

const DEFAULTS: SecurityPolicy = {
  sessionTimeoutMinutes: 10080,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
};

/** Load the org-wide security policy from business_settings (with safe defaults). */
export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const [s] = await db.select().from(businessSettingsTable);
  if (!s) return { ...DEFAULTS };
  return {
    sessionTimeoutMinutes: s.sessionTimeoutMinutes ?? DEFAULTS.sessionTimeoutMinutes,
    passwordMinLength: s.passwordMinLength ?? DEFAULTS.passwordMinLength,
    passwordRequireUppercase: s.passwordRequireUppercase ?? DEFAULTS.passwordRequireUppercase,
    passwordRequireNumber: s.passwordRequireNumber ?? DEFAULTS.passwordRequireNumber,
    passwordRequireSymbol: s.passwordRequireSymbol ?? DEFAULTS.passwordRequireSymbol,
    maxFailedLogins: s.maxFailedLogins ?? DEFAULTS.maxFailedLogins,
    lockoutMinutes: s.lockoutMinutes ?? DEFAULTS.lockoutMinutes,
  };
}

/** Validate a candidate password against the policy. Returns an error message or null. */
export function validatePassword(password: string, policy: SecurityPolicy): string | null {
  if (!password || password.length < policy.passwordMinLength) {
    return `Password must be at least ${policy.passwordMinLength} characters long.`;
  }
  if (policy.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (policy.passwordRequireNumber && !/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (policy.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one symbol.";
  }
  return null;
}
