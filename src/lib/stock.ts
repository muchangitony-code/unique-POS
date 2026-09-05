import { and, eq, sql } from "drizzle-orm";
import { db, productStockTable } from "@workspace/db";

/** Minimal executor interface satisfied by both `db` and a drizzle transaction. */
type Executor = Pick<typeof db, "insert" | "update" | "select">;

/** Thrown inside transactions when a guarded stock deduction fails. */
export class InsufficientStockError extends Error {
  constructor(public productId: number, public available: number) {
    super(`Insufficient stock for product #${productId} — only ${available} available`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Atomically apply a stock delta for a (branch, product) with an optional
 * floor-at-zero guard, using a single conditional UPDATE so concurrent sales
 * cannot oversell. Returns { ok:false } when the guard would be violated
 * (insufficient stock); no change is made in that case.
 */
export async function applyStockDelta(
  branchId: number,
  productId: number,
  delta: number,
  opts: { allowNegative?: boolean } = {},
  dbc: Executor = db,
): Promise<{ ok: boolean; before: number; after: number }> {
  const allowNegative = opts.allowNegative ?? false;
  // Ensure the row exists (idempotent thanks to the unique constraint).
  await dbc
    .insert(productStockTable)
    .values({ branchId, productId, currentStock: 0, minStock: 0 })
    .onConflictDoNothing();
  const guard = allowNegative ? sql`TRUE` : sql`${productStockTable.currentStock} + ${delta} >= 0`;
  const rows = await dbc
    .update(productStockTable)
    .set({ currentStock: sql`${productStockTable.currentStock} + ${delta}` })
    .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId), guard))
    .returning({ after: productStockTable.currentStock });
  if (!rows.length) {
    const [row] = await dbc
      .select({ cur: productStockTable.currentStock })
      .from(productStockTable)
      .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId)));
    const cur = row?.cur ?? 0;
    return { ok: false, before: cur, after: cur };
  }
  const after = rows[0].after;
  return { ok: true, before: after - delta, after };
}

/**
 * Load per-product stock aggregated for a scope.
 * - Single branch: one entry per product with that branch's current & min stock.
 * - All branches (super admin, no branch focus): current is summed across
 *   branches; min is left null (callers fall back to the catalog's min_stock).
 * A non-super user with no branch resolves to an empty map (fail-closed).
 */
export async function loadStockMap(opts: { branchId: number | null; all: boolean }): Promise<Map<number, { cur: number; min: number | null }>> {
  const rows = opts.all
    ? await db.select().from(productStockTable)
    : opts.branchId == null
      ? []
      : await db.select().from(productStockTable).where(eq(productStockTable.branchId, opts.branchId));
  const map = new Map<number, { cur: number; min: number | null }>();
  for (const r of rows) {
    const e = map.get(r.productId) ?? { cur: 0, min: null };
    e.cur += r.currentStock;
    if (!opts.all) e.min = r.minStock;
    map.set(r.productId, e);
  }
  return map;
}

/**
 * Per-branch stock helpers. product_stock is the single source of truth for
 * on-hand quantity; the products table only holds the shared catalog.
 *
 * These use read-modify-write (matching the rest of the codebase). Concurrency
 * hardening is handled separately.
 */

export async function getBranchStockRow(branchId: number, productId: number) {
  const [row] = await db
    .select()
    .from(productStockTable)
    .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId)));
  return row ?? null;
}

export async function getBranchCurrentStock(branchId: number, productId: number): Promise<number> {
  const row = await getBranchStockRow(branchId, productId);
  return row?.currentStock ?? 0;
}

/**
 * Apply a stock change for a (branch, product), creating the row if it does not
 * exist yet. `computeAfter` receives the current quantity and returns the new
 * one. Returns the before/after quantities.
 */
export async function adjustBranchStock(
  branchId: number,
  productId: number,
  computeAfter: (before: number) => number,
): Promise<{ before: number; after: number }> {
  const row = await getBranchStockRow(branchId, productId);
  const before = row?.currentStock ?? 0;
  const after = computeAfter(before);
  if (row) {
    await db
      .update(productStockTable)
      .set({ currentStock: after })
      .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId)));
  } else {
    await db.insert(productStockTable).values({ branchId, productId, currentStock: after, minStock: 0 });
  }
  return { before, after };
}

/** Set the absolute current stock (and optionally min stock) for a branch+product. */
export async function setBranchStock(
  branchId: number,
  productId: number,
  currentStock: number,
  minStock?: number,
): Promise<void> {
  const row = await getBranchStockRow(branchId, productId);
  if (row) {
    await db
      .update(productStockTable)
      .set(minStock === undefined ? { currentStock } : { currentStock, minStock })
      .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId)));
  } else {
    await db.insert(productStockTable).values({ branchId, productId, currentStock, minStock: minStock ?? 0 });
  }
}

/** Set only the min-stock threshold for a branch+product (creates row if needed). */
export async function setBranchMinStock(branchId: number, productId: number, minStock: number): Promise<void> {
  const row = await getBranchStockRow(branchId, productId);
  if (row) {
    await db
      .update(productStockTable)
      .set({ minStock })
      .where(and(eq(productStockTable.branchId, branchId), eq(productStockTable.productId, productId)));
  } else {
    await db.insert(productStockTable).values({ branchId, productId, currentStock: 0, minStock });
  }
}
