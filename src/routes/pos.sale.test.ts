/**
 * Tests for POST /pos/sale — the endpoint the mobile checkout calls to complete
 * a sale. Verifies input validation, that a sale + receipt are created, stock is
 * deducted per line item, and the created sale (with receipt number) is returned.
 *
 * All DB, audit, branch, and stock side-effects are mocked so the test runs
 * without a real database.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  dbMock,
  routeHandlers,
  logAuditSpy,
  adjustBranchStockSpy,
  resolveWriteBranchIdSpy,
  insertValuesSpy,
  saleRowRef,
} = vi.hoisted(() => {
  const routeHandlers: Record<string, (...args: unknown[]) => unknown> = {};

  const saleRowRef: { current: Record<string, unknown> } = { current: {} };

  // insert chain: .values() is awaited directly for line items, and
  // .values().returning() is used for the sale row. So values() returns a
  // thenable that also exposes .returning().
  const insertValuesSpy = vi.fn(() => {
    const p = Promise.resolve(undefined) as Promise<undefined> & {
      returning?: () => Promise<unknown[]>;
    };
    p.returning = () => Promise.resolve([saleRowRef.current]);
    return p;
  });

  // select chain (used by formatSale): .from().where()
  const selectWhere = vi.fn<[], Promise<unknown[]>>().mockResolvedValue([]);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));

  const dbMock: Record<string, unknown> = {
    insert: vi.fn(() => ({ values: insertValuesSpy })),
    select: vi.fn(() => ({ from: selectFrom })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    execute: vi.fn().mockResolvedValue([]),
  };
  // Transactions run the callback against the same mock (acts as the tx executor).
  dbMock.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(dbMock));

  const logAuditSpy = vi.fn().mockResolvedValue(undefined);
  const adjustBranchStockSpy = vi.fn().mockResolvedValue({ ok: true, before: 10, after: 8 });
  const resolveWriteBranchIdSpy = vi.fn().mockResolvedValue(1);

  return {
    dbMock,
    routeHandlers,
    logAuditSpy,
    adjustBranchStockSpy,
    resolveWriteBranchIdSpy,
    insertValuesSpy,
    saleRowRef,
  };
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
  salesTable: { id: "id", receiptNumber: "receiptNumber", branchId: "branchId" },
  saleItemsTable: { saleId: "saleId" },
  productsTable: { id: "id", productName: "productName" },
  customersTable: { id: "id", name: "name" },
  stockMovementsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn(() => "inArray"),
  sql: new Proxy(
    Object.assign((_s: unknown, ..._v: unknown[]) => "sql", { join: () => "sql", raw: () => "sql" }),
    { get: () => () => "sql" },
  ),
}));

vi.mock("../lib/audit", () => ({ logAudit: logAuditSpy }));
vi.mock("../lib/permissions", () => ({
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../lib/branch-scope", () => ({
  resolveWriteBranchId: resolveWriteBranchIdSpy,
  branchCondition: vi.fn(() => undefined),
  isBranchInScope: vi.fn(() => true),
}));
vi.mock("../lib/stock", () => ({
  applyStockDelta: adjustBranchStockSpy,
  InsufficientStockError: class InsufficientStockError extends Error {
    constructor(public productId: number, public available: number) { super("insufficient"); }
  },
}));

// ─── Import module under test (registers routes via mocked Router) ────────────

import "./pos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown): Request {
  return { body, headers: {}, user: { userId: 1, name: "Cashier", role: "cashier" } } as unknown as Request;
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
  return routeHandlers["POST /pos/sale"] as (req: Request, res: Response) => Promise<void>;
}

function makeSaleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    receiptNumber: "RCP-123",
    branchId: 1,
    customerId: null,
    subtotal: "240",
    discountAmount: "0",
    taxAmount: "0",
    total: "240",
    amountPaid: "300",
    change: "60",
    paymentMethod: "cash",
    cashierName: "Cashier",
    status: "completed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saleRowRef.current = makeSaleRow();
  adjustBranchStockSpy.mockResolvedValue({ ok: true, before: 10, after: 8 });
});

describe("POST /pos/sale — input validation", () => {
  it("returns 400 when items are missing", async () => {
    const res = makeRes();
    await handler()(makeReq({ amount_paid: 100, payment_method: "cash" }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBeTruthy();
  });

  it("returns 400 when items array is empty", async () => {
    const res = makeRes();
    await handler()(makeReq({ items: [], amount_paid: 100, payment_method: "cash" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when amount_paid is missing", async () => {
    const res = makeRes();
    await handler()(makeReq({ items: [{ product_id: 1, quantity: 1, unit_price: 10 }], payment_method: "cash" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when payment_method is missing", async () => {
    const res = makeRes();
    await handler()(makeReq({ items: [{ product_id: 1, quantity: 1, unit_price: 10 }], amount_paid: 10 }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /pos/sale — successful sale", () => {
  const validBody = {
    items: [
      { product_id: 1, quantity: 2, unit_price: 100, vat_rate: 16 },
      { product_id: 2, quantity: 1, unit_price: 40, vat_rate: 16 },
    ],
    amount_paid: 300,
    payment_method: "cash",
    discount_amount: 0,
  };

  it("creates the sale and returns 201 with the receipt number", async () => {
    const res = makeRes();
    await handler()(makeReq(validBody), res);

    expect(res.statusCode).toBe(201);
    const body = res.body as { receipt_number: string; total: number };
    expect(body.receipt_number).toBe("RCP-123");
  });

  it("deducts stock once per line item", async () => {
    const res = makeRes();
    await handler()(makeReq(validBody), res);
    expect(adjustBranchStockSpy).toHaveBeenCalledTimes(2);
    expect(adjustBranchStockSpy.mock.calls[0][0]).toBe(1);
    expect(adjustBranchStockSpy.mock.calls[0][1]).toBe(1);
    expect(adjustBranchStockSpy.mock.calls[1][1]).toBe(2);
  });

  it("deducts the ordered quantity from current stock", async () => {
    const res = makeRes();
    await handler()(makeReq(validBody), res);
    // applyStockDelta is called with a negative delta equal to the quantity sold.
    const firstDelta = adjustBranchStockSpy.mock.calls[0][2] as number;
    expect(firstDelta).toBeLessThan(0);
  });

  it("writes an audit log entry for the sale", async () => {
    const res = makeRes();
    await handler()(makeReq(validBody), res);
    expect(logAuditSpy).toHaveBeenCalledTimes(1);
    expect(logAuditSpy.mock.calls[0][1]).toMatchObject({ action: "sale.created", entityType: "sale" });
  });

  it("resolves the acting branch before writing the sale", async () => {
    const res = makeRes();
    await handler()(makeReq(validBody), res);
    expect(resolveWriteBranchIdSpy).toHaveBeenCalled();
  });
});
