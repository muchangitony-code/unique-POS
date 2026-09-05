/**
 * Tests for PATCH /products/generate-barcodes
 *
 * All DB and audit side-effects are mocked so these tests run without a real
 * database. The express Router is captured via a hoisted mock so we can
 * invoke the route handler directly with fake req/res objects.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  dbMock,
  logAuditSpy,
  routeHandlers,
  selectWhereSpy,
  updateReturning,
} = vi.hoisted(() => {
  // Captured route handlers: "METHOD /path" → handler fn (last arg — after middleware)
  const routeHandlers: Record<string, (...args: unknown[]) => unknown> = {};

  // update chain: .set().where().returning()
  const updateReturning = vi.fn<[], Promise<unknown[]>>().mockResolvedValue([]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  // select chain: .from().where()
  const selectWhereSpy = vi.fn<[], Promise<unknown[]>>().mockResolvedValue([]);
  const selectFrom = vi.fn(() => ({ where: selectWhereSpy }));

  const dbMock = {
    select: vi.fn(() => ({ from: selectFrom })),
    update: vi.fn(() => ({ set: updateSet })),
  };

  const logAuditSpy = vi.fn().mockResolvedValue(undefined);

  return { dbMock, logAuditSpy, routeHandlers, selectWhereSpy, updateReturning };
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
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((...args: unknown[]) => args),
  ilike:   vi.fn(() => "ilike"),
  sql:     new Proxy(
    Object.assign((_s: unknown, ..._v: unknown[]) => "sql", {
      join: () => "sql",
      raw: () => "sql",
    }),
    { get: (_t: unknown, _k: unknown) => () => "sql" },
  ),
  inArray: vi.fn(() => "inArray"),
}));

vi.mock("../lib/audit", () => ({ logAudit: logAuditSpy }));

vi.mock("../lib/permissions", () => ({
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ─── Import module under test (registers routes via mocked Router) ────────────

import { makeBarcode } from "./products";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  body: unknown,
  user: { userId: number; name: string; role: string } = { userId: 1, name: "Admin", role: "administrator" },
): Request {
  return { body, user, headers: {}, socket: {} } as unknown as Request;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes & Response {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockImplementation((s: number) => { res.statusCode = s; return res; });
  res.json.mockImplementation((b: unknown) => { res.body = b; return res; });
  return res as unknown as MockRes & Response;
}

/** Retrieve the captured generate-barcodes route handler. */
function handler() {
  return routeHandlers["PATCH /products/generate-barcodes"] as (req: Request, res: Response) => Promise<void>;
}

// ─── makeBarcode (pure) ───────────────────────────────────────────────────────

describe("makeBarcode — barcode format", () => {
  it("produces a 4-char prefix + 8-digit zero-padded id", () => {
    expect(makeBarcode("PROD", 5)).toBe("PROD00000005");
    expect(makeBarcode("PROD", 5)).toMatch(/^[A-Z0-9]{4}\d{8}$/);
  });

  it("strips non-alphanumeric chars and uppercases prefix", () => {
    expect(makeBarcode("ab-cd!", 42)).toBe("ABCD00000042");
  });

  it("pads a short product code prefix with X", () => {
    expect(makeBarcode("AB", 1).slice(0, 4)).toBe("ABXX");
  });

  it("truncates a long product code prefix to 4 chars", () => {
    const bc = makeBarcode("TOOLONGCODE", 99);
    expect(bc.slice(0, 4)).toBe("TOOL");
    expect(bc).toHaveLength(12);
  });

  it("zero-pads ids shorter than 8 digits", () => {
    expect(makeBarcode("TEST", 1)).toBe("TEST00000001");
    expect(makeBarcode("TEST", 9999999)).toBe("TEST09999999");
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("PATCH /products/generate-barcodes — input validation", () => {
  it("returns 400 when product_ids is missing", async () => {
    const res = makeRes();
    await handler()(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBeTruthy();
  });

  it("returns 400 when product_ids is not an array", async () => {
    const res = makeRes();
    await handler()(makeReq({ product_ids: 42 }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when product_ids contains a non-integer string", async () => {
    const res = makeRes();
    await handler()(makeReq({ product_ids: [1, "abc", 3] }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when product_ids contains zero", async () => {
    const res = makeRes();
    await handler()(makeReq({ product_ids: [0] }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when product_ids contains a negative number", async () => {
    const res = makeRes();
    await handler()(makeReq({ product_ids: [-5] }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ─── Empty-selection fast paths ───────────────────────────────────────────────

describe("PATCH /products/generate-barcodes — empty selection", () => {
  beforeEach(() => {
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    logAuditSpy.mockClear();
  });

  it("returns { updated: 0 } without touching the DB when product_ids is []", async () => {
    const res = makeRes();
    await handler()(makeReq({ product_ids: [] }), res);
    const body = res.body as { updated: number };
    expect(body.updated).toBe(0);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("returns { updated: 0 } and no audit when DB finds no untagged products", async () => {
    selectWhereSpy.mockResolvedValueOnce([]); // all already tagged
    const res = makeRes();
    await handler()(makeReq({ product_ids: [1, 2] }), res);
    const body = res.body as { updated: number; message: string };
    expect(body.updated).toBe(0);
    expect(body.message).toMatch(/already have barcodes/i);
    expect(logAuditSpy).not.toHaveBeenCalled();
  });
});

// ─── Existing barcodes are NOT overwritten ────────────────────────────────────

describe("PATCH /products/generate-barcodes — existing barcodes are never overwritten", () => {
  beforeEach(() => {
    logAuditSpy.mockClear();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    selectWhereSpy.mockReset();
    updateReturning.mockReset();
  });

  it("skips products that already have barcodes — DB WHERE clause excludes them", async () => {
    // IDs 1, 2, 3 requested — DB only returns 1 and 3 (2 already has a barcode)
    selectWhereSpy.mockResolvedValueOnce([
      { id: 1, productCode: "AAAA", productName: "Alpha" },
      { id: 3, productCode: "CCCC", productName: "Charlie" },
    ]);
    updateReturning
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 3 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [1, 2, 3] }), res);

    const body = res.body as { updated: number; products: Array<{ id: number }> };
    expect(body.updated).toBe(2);
    expect(body.products.map((p) => p.id)).toEqual([1, 3]);
  });

  it("returns { updated: 0 } when a race causes the UPDATE to find the barcode already set", async () => {
    // SELECT finds one untagged product…
    selectWhereSpy.mockResolvedValueOnce([
      { id: 5, productCode: "RACE", productName: "Race Product" },
    ]);
    // …but UPDATE finds nothing (another request won the race)
    updateReturning.mockResolvedValueOnce([]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [5] }), res);

    const body = res.body as { updated: number };
    expect(body.updated).toBe(0);
    expect(logAuditSpy).not.toHaveBeenCalled();
  });
});

// ─── Successful generation ────────────────────────────────────────────────────

describe("PATCH /products/generate-barcodes — successful generation", () => {
  beforeEach(() => {
    logAuditSpy.mockClear();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    selectWhereSpy.mockReset();
    updateReturning.mockReset();
  });

  it("returns { updated: N } with the correct count", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 10, productCode: "PROD", productName: "Product One" },
      { id: 20, productCode: "ITEM", productName: "Product Two" },
    ]);
    updateReturning
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 20 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [10, 20] }), res);

    expect((res.body as { updated: number }).updated).toBe(2);
  });

  it("generated barcodes match the <4-char-prefix><8-digit-id> format", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 7, productCode: "TEST", productName: "Test Product" },
    ]);
    updateReturning.mockResolvedValueOnce([{ id: 7 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [7] }), res);

    const body = res.body as { products: Array<{ barcode: string; id: number }> };
    expect(body.products).toHaveLength(1);
    const { barcode } = body.products[0];
    expect(barcode).toMatch(/^[A-Z0-9]{4}\d{8}$/);
    expect(barcode).toBe("TEST00000007");
  });

  it("deduplicates product_ids before processing", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 99, productCode: "DUPL", productName: "Dupe" },
    ]);
    updateReturning.mockResolvedValueOnce([{ id: 99 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [99, 99, 99] }), res);

    expect((res.body as { updated: number }).updated).toBe(1);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("response products list includes product_code, product_name, and barcode", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 3, productCode: "GEAR", productName: "Gear Item" },
    ]);
    updateReturning.mockResolvedValueOnce([{ id: 3 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [3] }), res);

    const body = res.body as {
      products: Array<{ product_code: string; product_name: string; barcode: string }>;
    };
    expect(body.products[0]).toMatchObject({
      product_code: "GEAR",
      product_name: "Gear Item",
      barcode: "GEAR00000003",
    });
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("PATCH /products/generate-barcodes — audit log", () => {
  beforeEach(() => {
    logAuditSpy.mockClear();
    selectWhereSpy.mockReset();
    updateReturning.mockReset();
  });

  it("writes an audit entry with action 'product.barcodes_generated' on success", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 1, productCode: "AUDT", productName: "Audit Product" },
    ]);
    updateReturning.mockResolvedValueOnce([{ id: 1 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [1] }), res);

    expect(logAuditSpy).toHaveBeenCalledTimes(1);
    const [, event] = logAuditSpy.mock.calls[0] as [
      Request,
      { action: string; metadata: { count: number; productIds: number[] } },
    ];
    expect(event.action).toBe("product.barcodes_generated");
    expect(event.metadata.count).toBe(1);
    expect(event.metadata.productIds).toEqual([1]);
  });

  it("does NOT write an audit entry when no products were actually updated", async () => {
    selectWhereSpy.mockResolvedValueOnce([]); // nothing untagged
    const res = makeRes();
    await handler()(makeReq({ product_ids: [1, 2] }), res);
    expect(logAuditSpy).not.toHaveBeenCalled();
  });

  it("audit metadata.count matches the number of products actually updated", async () => {
    selectWhereSpy.mockResolvedValueOnce([
      { id: 10, productCode: "AA10", productName: "P10" },
      { id: 11, productCode: "AA11", productName: "P11" },
      { id: 12, productCode: "AA12", productName: "P12" },
    ]);
    updateReturning
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ id: 12 }]);

    const res = makeRes();
    await handler()(makeReq({ product_ids: [10, 11, 12] }), res);

    const [, event] = logAuditSpy.mock.calls[0] as [Request, { metadata: { count: number } }];
    expect(event.metadata.count).toBe(3);
  });
});

// ─── Role / auth guard ────────────────────────────────────────────────────────

describe("PATCH /products/generate-barcodes — role guard", () => {
  it("requireRole is called with the stock-management roles when the route is registered", async () => {
    const { requireRole } = await import("../lib/permissions");
    expect(requireRole).toHaveBeenCalledWith("administrator", "manager", "storekeeper");
  });
});
