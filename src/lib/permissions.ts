import type { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "./auth";

/**
 * Functional role tiers — maps every DB role enum value to one of four tiers.
 * These tiers are the single source of truth for both backend middleware and
 * are mirrored on the frontend in artifacts/unique-pos/src/lib/permissions.ts.
 */
export type FunctionalTier = "administrator" | "manager" | "sales_cashier" | "storekeeper";

export const ROLE_TIER_MAP: Record<string, FunctionalTier> = {
  super_admin:    "administrator",
  business_owner: "administrator",
  branch_manager: "manager",
  accountant:     "manager",
  cashier:        "sales_cashier",
  sales_rep:      "sales_cashier",
  storekeeper:    "storekeeper",
  technician:     "storekeeper",
};

/** Display label shown in the UI for each functional tier. */
export const TIER_LABEL: Record<FunctionalTier, string> = {
  administrator: "Administrator",
  manager:       "Manager",
  sales_cashier: "Sales / Cashier",
  storekeeper:   "Storekeeper",
};

/**
 * Returns the functional tier for a DB role string, or null if the role is
 * unknown. Callers must treat null as denied (fail-closed).
 */
export function getTier(dbRole: string): FunctionalTier | null {
  return ROLE_TIER_MAP[dbRole] ?? null;
}

/**
 * Middleware factory. Allows access only when the authenticated user's
 * functional tier is in the allowedTiers list. Unknown/unmapped roles are
 * denied (fail-closed — no silent escalation for unrecognised role strings).
 */
/**
 * DB roles that count as "super administrators" — the owner-level admins
 * allowed to edit sensitive configuration such as Payment Settings.
 * This is intentionally a DB-role allow-list (not a functional tier) so it can
 * be tightened independently of the broader "administrator" tier.
 */
export const SUPER_ADMIN_ROLES = ["super_admin", "business_owner"] as const;

/**
 * Middleware. Allows access only to super administrators (see SUPER_ADMIN_ROLES).
 * Fail-closed: unknown/unlisted roles are denied.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(SUPER_ADMIN_ROLES as readonly string[]).includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions", required: SUPER_ADMIN_ROLES, your_role: user.role });
    return;
  }
  next();
}

export function requireRole(...allowedTiers: FunctionalTier[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const tier = getTier(user.role);
    if (!tier || !allowedTiers.includes(tier)) {
      res.status(403).json({ error: "Insufficient permissions", required: allowedTiers, your_role: tier ?? "unknown" });
      return;
    }
    next();
  };
}
