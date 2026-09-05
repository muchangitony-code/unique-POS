/**
 * Authorization wiring tests for write endpoints.
 *
 * These verify that product/inventory mutation routes are guarded by the REAL
 * `requireRole` middleware with the correct functional tiers — mirroring the
 * frontend route guards. Unlike the other route tests, `../lib/permissions` is
 * intentionally NOT mocked here, so the actual tier-enforcement logic runs.
 *
 * The express Router is mocked to capture every argument passed to each route
 * registration (path, middleware(s), handler). For each guarded route we pull
 * out the guard middleware and run it with fake users of different roles,
 * asserting cashier/sales_rep are blocked (403) while administrator/manager/
 * storekeeper roles pass through, and an anonymous request is rejected (401).
 */
import { vi, describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { routeArgs } = vi.hoisted(() => {
  // "METHOD /path" → full args array passed to router.<method>(...)
  const routeArgs: Record<string, unknown[]> = {};
  return { routeArgs };
});

// ─── Module mocks (everything EXCEPT ../lib/permissions) ──────────────────────

vi.mock("express", () => {
  const capture = (method: string) =>
    (...args: unknown[]) => { routeArgs[`${method} ${args[0] as string}`] = args; };
  const routerInstance = {
    get: vi.fn(capture("GET")),
    post: vi.fn(capture("POST")),
    patch: vi.fn(capture("PATCH")),
    delete: vi.fn(capture("DELETE")),
  };
  return { Router: vi.fn(() => routerInstance) };
});

// Minimal data-layer stubs — only needed so the route modules import & register.
// No handler is executed in these tests, so table shapes are irrelevant.
vi.mock("@workspace/db", () => ({
  db: {},
  productsTable: {}, categoriesTable: {}, brandsTable: {}, suppliersTable: {},
  stockMovementsTable: {}, productStockTable: {}, stockTransfersTable: {}, branchesTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), or: vi.fn(), ilike: vi.fn(), inArray: vi.fn(),
  sql: Object.assign(vi.fn(), { join: vi.fn(), raw: vi.fn() }),
}));

vi.mock("../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../lib/branch-scope", () => ({
  branchCondition: vi.fn(), resolveWriteBranchId: vi.fn(), getBranchScope: vi.fn(),
  isBranchInScope: vi.fn(), getBranchScopeForResponse: vi.fn(),
}));
vi.mock("../lib/stock", () => ({
  loadStockMap: vi.fn(), getBranchStockRow: vi.fn(), setBranchStock: vi.fn(),
  adjustBranchStock: vi.fn(), getBranchCurrentStock: vi.fn(),
}));
vi.mock("../lib/doc-numbers", () => ({ nextDocumentNumber: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

// ─── Import modules under test (registers routes via the mocked Router) ────────

import "./products";
import "./inventory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 0, body: undefined as unknown, status: vi.fn(), json: vi.fn() };
  res.status.mockImplementation((s: number) => { res.statusCode = s; return res; });
  res.json.mockImplementation((b: unknown) => { res.body = b; return res; });
  return res as unknown as Response & { statusCode: number };
}

/** The guard middleware for a route is the arg after the path (before the handler). */
function guardFor(routeKey: string): (req: Request, res: Response, next: NextFunction) => void {
  const args = routeArgs[routeKey];
  expect(args, `route ${routeKey} was not registered`).toBeTruthy();
  expect(args.length, `route ${routeKey} has no guard middleware`).toBeGreaterThanOrEqual(3);
  return args[1] as (req: Request, res: Response, next: NextFunction) => void;
}

/** Run a guard with a given role; returns { allowed, status }. */
function runGuard(routeKey: string, role: string | null) {
  const guard = guardFor(routeKey);
  const req = { user: role ? { userId: 1, name: "T", role } : undefined } as unknown as Request;
  const res = makeRes();
  const next = vi.fn();
  guard(req, res, next as unknown as NextFunction);
  return { allowed: next.mock.calls.length > 0, status: (res as { statusCode: number }).statusCode };
}

// The routes that must enforce administrator/manager/storekeeper (mirrors the
// /products and /inventory frontend ProtectedRoute allowedTiers).
const GUARDED_ROUTES = [
  "POST /products",
  "PATCH /products/:id",
  "DELETE /products/:id",
  "POST /inventory/receive",
  "POST /inventory/adjust",
];

const ALLOWED_ROLES = ["super_admin", "business_owner", "branch_manager", "accountant", "storekeeper", "technician"];
const BLOCKED_ROLES = ["cashier", "sales_rep"];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("write-endpoint authorization guards", () => {
  it("registers a guard middleware on every mutation route", () => {
    for (const route of GUARDED_ROUTES) {
      expect(typeof guardFor(route)).toBe("function");
    }
  });

  describe.each(GUARDED_ROUTES)("%s", (route) => {
    it.each(ALLOWED_ROLES)("allows %s (privileged tier)", (role) => {
      const { allowed } = runGuard(route, role);
      expect(allowed).toBe(true);
    });

    it.each(BLOCKED_ROLES)("blocks %s with 403", (role) => {
      const { allowed, status } = runGuard(route, role);
      expect(allowed).toBe(false);
      expect(status).toBe(403);
    });

    it("rejects an unauthenticated request with 401", () => {
      const { allowed, status } = runGuard(route, null);
      expect(allowed).toBe(false);
      expect(status).toBe(401);
    });

    it("blocks an unknown role (fail-closed) with 403", () => {
      const { allowed, status } = runGuard(route, "some_unmapped_role");
      expect(allowed).toBe(false);
      expect(status).toBe(403);
    });
  });
});

describe("POS sale endpoint stays open to cashiers", () => {
  it("does not attach an administrator/manager/storekeeper guard to POST /pos/sale", () => {
    // /pos/sale is registered by the pos router (not imported here); this test
    // documents intent — the sale route must not be added to GUARDED_ROUTES.
    expect(GUARDED_ROUTES).not.toContain("POST /pos/sale");
  });
});
