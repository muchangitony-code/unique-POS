/**
 * Tests for GET /products/barcode/:barcode — the endpoint the mobile scanner
 * calls after decoding a barcode. Verifies it returns the matching product or a
 * 404 when nothing matches.
 *
 * All DB and branch/stock side-effects are mocked so the test runs without a
 * real database. The express Router is captured via a hoisted mock so the route
 * handler can be invoked directly with fake req/res objects.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { dbMock, routeHandlers, selectWhereSpy, loadStockMapSpy, getBranchScopeSpy } =
  vi.hoisted(() => {
    const routeHandlers: Record<string, (...args: unknown[]) => unknown> = {};

    // select chain: .from().where()
    const selectWhereSpy = vi.fn<[], Promise<unknown[]>>().mockResolvedValue([]);
    const selectFrom = vi.fn(() => ({ where: selectWhereSpy }));

    const dbMock = { select: vi.fn(() => ({ from: selectFrom })) };

    const loadStockMapSpy = vi.fn().mockResolvedValue(new Map());
    const getBranchScopeSpy = vi.fn(() => ({ branchId: 1, mode: "branch" as const }));

    return { dbMock, routeHandlers, selectWhereSpy, loadStockMapSpy, getBranchScopeSpy };
  });

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("express", () => {
  const captureHandler = (method: string) =>
    (...args: unknown[]) => {
      const path = args[0] as string;
      routeHandlers[`${method} ${path}`] = args[args.length - 1] as (...a: unknown[]) => unknown;
    };
  const routerInstance = {
    get: vi.fn(captureHandler("GET")),
    post: vi.fn(captureHandler("POST")),
    patch: vi.fn(captureHandler("PATCH")),
    delete: vi.fn(captureHandler("DELETE")),
  };
  return { Router: vi.fn(() => routerInstance) };
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  productsTable: {
    id: "id",
    barcode: "barcode",
    productCode: "productCode",
    productName: "productName",
    categoryId: "categoryId",
    brandId: "brandId",
    supplierId: "supplierId",
    costPrice: "costPrice",
    sellingPrice: "sellingPrice",
    vatRate: "vatRate",
    currentStock: "currentStock",
    minStock: "minStock",
    imageUrl: "imageUrl",
    unit: "unit",
    description: "description",
    createdAt: "createdAt",
  },
  categoriesTable: {},
  brandsTable: {},
  suppliersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...args: unknown[]) => args),
  ilike: vi.fn(() => "ilike"),
  sql: new Proxy(
    Object.assign((_s: unknown, ..._v: unknown[]) => "sql", { join: () => "sql", raw: () => "sql" }),
    { get: () => () => "sql" },
  ),
  inArray: vi.fn(() => "inArray"),
}));

vi.mock("../lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/permissions", () => ({
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/branch-scope", () => ({
  getBranchScope: getBranchScopeSpy,
  resolveWriteBranchId: vi.fn().mockResolvedValue(1),
}));
vi.mock("../lib/stock", () => ({
  loadStockMap: loadStockMapSpy,
  getBranchStockRow: vi.fn().mockResolvedValue(null),
  setBranchStock: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import module under test (registers routes via mocked Router) ────────────

import "./products";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(barcode: string): Request {
  return { params: { barcode }, query: {}, headers: {}, user: { userId: 1, role: "cashier" } } as unknown as Request;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes & Response {
  const res: MockRes = { statusCode: 200, body: undefined, status: vi.fn(), json: vi.fn() };
  res.status.mockImplementation((s: number) => { res.statusCode = s; return res; });
  res.json.mockImplementation((b: unknown) => { res.body = b; return res; });
  return res as unknown as MockRes & Response;
}

function handler() {
  return routeHandlers["GET /products/barcode/:barcode"] as (req: Request, res: Response) => Promise<void>;
}

const PRODUCT_ROW = {
  id: 42,
  productCode: "SKU-42",
  barcode: "TEST00000042",
  productName: "Test Widget",
  description: "A widget",
  categoryId: 1,
  brandId: 2,
  supplierId: 3,
  costPrice: "50",
  sellingPrice: "120",
  vatRate: "16",
  currentStock: 7,
  minStock: 2,
  imageUrl: null,
  unit: "pcs",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  selectWhereSpy.mockResolvedValue([]);
  loadStockMapSpy.mockResolvedValue(new Map());
  getBranchScopeSpy.mockReturnValue({ branchId: 1, mode: "branch" });
});

describe("GET /products/barcode/:barcode — the route is registered", () => {
  it("registers a handler for the barcode lookup path", () => {
    expect(typeof handler()).toBe("function");
  });
});

describe("GET /products/barcode/:barcode — product found", () => {
  it("returns the matching product formatted for the client", async () => {
    selectWhereSpy.mockResolvedValue([PRODUCT_ROW]);
    const res = makeRes();
    await handler()(makeReq("TEST00000042"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { id: number; barcode: string; product_name: string; selling_price: number };
    expect(body.id).toBe(42);
    expect(body.barcode).toBe("TEST00000042");
    expect(body.product_name).toBe("Test Widget");
    expect(body.selling_price).toBe(120);
  });

  it("reflects branch stock from the stock map in current_stock", async () => {
    selectWhereSpy.mockResolvedValue([PRODUCT_ROW]);
    loadStockMapSpy.mockResolvedValue(new Map([[42, { cur: 15, min: 4 }]]));
    const res = makeRes();
    await handler()(makeReq("TEST00000042"), res);

    const body = res.body as { current_stock: number; min_stock: number };
    expect(body.current_stock).toBe(15);
    expect(body.min_stock).toBe(4);
  });
});

describe("GET /products/barcode/:barcode — product not found", () => {
  it("returns 404 with an error message when no product matches", async () => {
    selectWhereSpy.mockResolvedValue([]);
    const res = makeRes();
    await handler()(makeReq("DOESNOTEXIST"), res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("Product not found");
  });
});
