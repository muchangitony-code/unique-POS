import type { Request } from "express";
import { eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, branchesTable } from "@workspace/db";
import type { JwtPayload } from "./auth";
import { SUPER_ADMIN_ROLES } from "./permissions";

/**
 * Multi-branch data scoping.
 *
 * - Non-super users are hard-locked to their own branch: every list is filtered
 *   to their branch and every new record is stamped with it. The client cannot
 *   override this.
 * - Super admins (super_admin / business_owner) can view all branches (default)
 *   or focus a single branch by sending an `x-branch-id` header or `branch_id`
 *   query param.
 */
/** Thrown when a request cannot be resolved to a permitted branch. Mapped to an
 *  HTTP status by the global error handler in app.ts. */
export class BranchScopeError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "BranchScopeError";
    this.status = status;
  }
}

export interface BranchScope {
  isSuper: boolean;
  mode: "all" | "single";
  /** The single branch to scope to, or null in "all" mode. */
  branchId: number | null;
  /** The acting user's own branch (may be null for unassigned super admins). */
  userBranchId: number | null;
}

function getUser(req: Request): JwtPayload | undefined {
  return (req as Request & { user?: JwtPayload }).user;
}

export function getBranchScope(req: Request): BranchScope {
  const user = getUser(req);
  const isSuper = !!user && (SUPER_ADMIN_ROLES as readonly string[]).includes(user.role);
  const userBranchId = user?.branchId ?? null;

  if (!isSuper) {
    return { isSuper: false, mode: "single", branchId: userBranchId, userBranchId };
  }

  // Super admin: honour an explicit branch selection, otherwise view all.
  const raw = (req.headers["x-branch-id"] ?? req.query.branch_id) as string | string[] | undefined;
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val || val === "all") {
    return { isSuper: true, mode: "all", branchId: null, userBranchId };
  }
  const n = parseInt(val, 10);
  if (Number.isInteger(n) && n > 0) {
    return { isSuper: true, mode: "single", branchId: n, userBranchId };
  }
  return { isSuper: true, mode: "all", branchId: null, userBranchId };
}

/**
 * Returns a WHERE condition that limits `column` to the request's branch scope,
 * or `undefined` when no filter is needed ("all" mode). A non-super user with no
 * assigned branch matches nothing (fail-closed).
 */
export function branchCondition(column: PgColumn, req: Request): SQL | undefined {
  const scope = getBranchScope(req);
  if (scope.mode === "all") return undefined;
  if (scope.branchId == null) return sql`false`;
  return eq(column, scope.branchId);
}

/** True when a record belonging to `branchId` is visible under the request's scope. */
export function isBranchInScope(req: Request, branchId: number | null): boolean {
  const scope = getBranchScope(req);
  if (scope.mode === "all") return true;
  return branchId != null && branchId === scope.branchId;
}

let cachedDefaultBranchId: number | null = null;

/** The fallback branch (oldest / Main Branch) used when none is otherwise resolvable. */
export async function getDefaultBranchId(): Promise<number | null> {
  if (cachedDefaultBranchId != null) return cachedDefaultBranchId;
  const [row] = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .orderBy(branchesTable.id)
    .limit(1);
  cachedDefaultBranchId = row?.id ?? null;
  return cachedDefaultBranchId;
}

/**
 * Resolves the branch id to stamp on a newly-created record.
 * - Non-super users: always their own branch. A non-super user with no assigned
 *   branch is denied (fail-closed) — it must NOT fall back to the default branch,
 *   or an unassigned cashier/manager could write into Main Branch.
 * - Super admins: an explicit branch (body), else the focused branch, else their
 *   own branch, else the default branch.
 */
export async function resolveWriteBranchId(req: Request, explicit?: number | null): Promise<number> {
  const scope = getBranchScope(req);
  if (!scope.isSuper) {
    if (scope.userBranchId != null) return scope.userBranchId;
    throw new BranchScopeError("Your account is not assigned to a branch. Ask an administrator to assign one.");
  }
  const chosen = explicit ?? scope.branchId ?? scope.userBranchId;
  if (chosen != null) return chosen;
  const def = await getDefaultBranchId();
  if (def == null) throw new BranchScopeError("No branch configured", 500);
  return def;
}
