/**
 * Frontend mirror of artifacts/api-server/src/lib/permissions.ts.
 * Keep these two files in sync when adding roles.
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

export const TIER_LABEL: Record<FunctionalTier, string> = {
  administrator: "Administrator",
  manager:       "Manager",
  sales_cashier: "Sales / Cashier",
  storekeeper:   "Storekeeper",
};

/** DB role values that belong to each functional tier (for role selectors). */
export const TIER_ROLES: Record<FunctionalTier, string[]> = {
  administrator: ["super_admin", "business_owner"],
  manager:       ["branch_manager", "accountant"],
  sales_cashier: ["cashier", "sales_rep"],
  storekeeper:   ["storekeeper", "technician"],
};

/**
 * Returns the functional tier for a DB role, or null for unknown/unmapped roles.
 * Callers (sidebar, route guard) must treat null as no-access (fail-closed).
 */
export function getTier(dbRole: string | undefined | null): FunctionalTier | null {
  if (!dbRole) return null;
  return ROLE_TIER_MAP[dbRole] ?? null;
}

/**
 * Human-readable tier label for display. Falls back to the raw role string
 * so unknown roles are visible rather than silently blank.
 */
export function getTierLabel(dbRole: string | undefined | null): string {
  const tier = getTier(dbRole);
  if (!tier) return dbRole ?? "Unknown";
  return TIER_LABEL[tier];
}

/**
 * DB roles that count as "Super Admin" — the only roles allowed to manage
 * branches and switch which branch's data they are viewing. Mirrors the
 * server's requireSuperAdmin guard.
 */
export const SUPER_ADMIN_ROLES = new Set(["super_admin", "business_owner"]);

/** True when the role may manage branches and use the branch switcher. */
export function isSuperAdmin(dbRole: string | undefined | null): boolean {
  return !!dbRole && SUPER_ADMIN_ROLES.has(dbRole);
}
