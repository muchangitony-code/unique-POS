import type { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "./auth";
import { pool } from "@workspace/db";

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
  sales_cashier:  "sales_cashier",
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


export const PERMISSION_MODULES = [
  "pos", "inventory", "products", "customers", "quotations", "invoices",
  "purchases", "suppliers", "reports", "expenses", "users", "settings",
  "branches", "audit_log", "security", "backups"
] as const;
export type PermissionModule = typeof PERMISSION_MODULES[number];

export const DEFAULT_MODULE_TIERS: Record<PermissionModule, FunctionalTier[]> = {
  pos: ["administrator", "sales_cashier"],
  inventory: ["administrator", "manager", "storekeeper", "sales_cashier"],
  products: ["administrator", "manager", "storekeeper", "sales_cashier"],
  customers: ["administrator", "manager", "sales_cashier"],
  quotations: ["administrator", "manager", "sales_cashier"],
  invoices: ["administrator", "manager", "sales_cashier"],
  purchases: ["administrator", "manager", "storekeeper"],
  suppliers: ["administrator", "manager", "storekeeper"],
  reports: ["administrator", "manager"],
  expenses: ["administrator"],
  users: ["administrator"],
  settings: ["administrator"],
  branches: ["administrator", "manager"],
  audit_log: ["administrator"],
  security: ["administrator"],
  backups: ["administrator"],
};

export function requireModuleAccess(moduleName: PermissionModule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (["super_admin", "business_owner"].includes(user.role)) { next(); return; }
    try {
      const result = await pool.query(
        "SELECT allowed FROM user_permission_overrides WHERE user_id = $1 AND module = $2 LIMIT 1",
        [user.userId, moduleName]
      );
      const allowed = result.rows.length
        ? result.rows[0].allowed === true
        : (DEFAULT_MODULE_TIERS[moduleName] ?? []).includes(getTier(user.role) as FunctionalTier);
      if (!allowed) { res.status(403).json({ error: "Permission denied", module: moduleName }); return; }
      next();
    } catch (error) {
      // If the permission store is unavailable, fail closed for non-super-admins.
      res.status(503).json({ error: "Permission service unavailable" });
    }
  };
}
