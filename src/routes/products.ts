import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq, sql, and, ilike } from "drizzle-orm";
import { db, productsTable, categoriesTable, brandsTable, suppliersTable, stockMovementsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { getBranchScope, resolveWriteBranchId } from "../lib/branch-scope";
import { loadStockMap, getBranchStockRow, setBranchStock } from "../lib/stock";

const router: IRouter = Router();

function formatProduct(
  p: typeof productsTable.$inferSelect,
  catName?: string | null,
  brandName?: string | null,
  supplierName?: string | null,
  stock?: { current: number; min: number },
) {
  return {
    id: p.id,
    product_code: p.productCode,
    barcode: p.barcode,
    product_name: p.productName,
    description: p.description,
    category_id: p.categoryId,
    category_name: catName ?? null,
    brand_id: p.brandId,
    brand_name: brandName ?? null,
    supplier_id: p.supplierId,
    supplier_name: supplierName ?? null,
    cost_price: Number(p.costPrice),
    selling_price: Number(p.sellingPrice),
    vat_rate: Number(p.vatRate),
    current_stock: stock ? stock.current : p.currentStock,
    min_stock: stock ? stock.min : p.minStock,
    image_url: p.imageUrl,
    unit: p.unit,
    created_at: p.createdAt,
  };
}

/** Resolve current/min stock for a single product under the request's branch scope. */
function stockFor(map: Map<number, { cur: number; min: number | null }>, p: typeof productsTable.$inferSelect): { current: number; min: number } {
  const v = map.get(p.id);
  return { current: v?.cur ?? 0, min: v && v.min != null ? v.min : p.minStock };
}

router.get("/products", async (req, res): Promise<void> => {
  const { search, category_id, brand_id, low_stock, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(200, parseInt(limit, 10));

  const conditions = [];
  if (search) conditions.push(ilike(productsTable.productName, `%${search}%`));
  if (category_id) conditions.push(eq(productsTable.categoryId, parseInt(category_id, 10)));
  if (brand_id) conditions.push(eq(productsTable.brandId, parseInt(brand_id, 10)));
  const where = conditions.length ? and(...conditions) : undefined;

  // The catalog is global; stock is per-branch. Fetch all catalog matches, merge
  // in branch stock, then filter (low-stock) and paginate — stock lives in a
  // separate table so it cannot be filtered/paged in the catalog query itself.
  const allProducts = await db.select().from(productsTable).where(where).orderBy(productsTable.productName);
  const scope = getBranchScope(req);
  const stockMap = await loadStockMap({ branchId: scope.branchId, all: scope.mode === "all" });

  const [categories, brands, suppliers] = await Promise.all([
    db.select().from(categoriesTable),
    db.select().from(brandsTable),
    db.select().from(suppliersTable),
  ]);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const brandMap = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  let formatted = allProducts.map((prod) =>
    formatProduct(prod, prod.categoryId ? catMap[prod.categoryId] : null, prod.brandId ? brandMap[prod.brandId] : null, prod.supplierId ? supplierMap[prod.supplierId] : null, stockFor(stockMap, prod))
  );
  if (low_stock === "true") formatted = formatted.filter((r) => r.current_stock <= r.min_stock);

  const total = formatted.length;
  const offset = (p - 1) * l;
  res.json({ data: formatted.slice(offset, offset + l), total, page: p, limit: l });
});

router.post("/products", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const { product_code, barcode, product_name, description, category_id, brand_id, supplier_id, cost_price, selling_price, vat_rate, current_stock, min_stock, image_url, unit } = req.body;
  if (!product_code || !product_name) { res.status(400).json({ error: "product_code and product_name required" }); return; }
  const [p] = await db.insert(productsTable).values({
    productCode: product_code, barcode, productName: product_name, description,
    categoryId: category_id, brandId: brand_id, supplierId: supplier_id,
    costPrice: cost_price?.toString() ?? "0", sellingPrice: selling_price?.toString() ?? "0",
    vatRate: vat_rate?.toString() ?? "16", currentStock: current_stock ?? 0, minStock: min_stock ?? 0,
    imageUrl: image_url, unit,
  }).returning();
  // Seed the per-branch stock row for the acting branch.
  const branchId = await resolveWriteBranchId(req);
  await setBranchStock(branchId, p.id, current_stock ?? 0, min_stock ?? 0);
  // Record opening stock in the movement history so the audit trail is complete.
  if ((current_stock ?? 0) > 0) {
    await db.insert(stockMovementsTable).values({ branchId, productId: p.id, type: "opening", quantity: current_stock, quantityBefore: 0, quantityAfter: current_stock, reference: `OPEN-${p.productCode}`, notes: "Opening stock" });
  }
  await logAudit(req, { action: "product.created", entityType: "product", entityId: p.id, description: `Created product "${p.productName}" (${p.productCode})` });
  res.status(201).json(formatProduct(p, undefined, undefined, undefined, { current: current_stock ?? 0, min: min_stock ?? 0 }));
});

/** Generate USK-prefixed barcode from product code + id (mirrors frontend generateBarcode) */
export function makeBarcode(productCode: string, productId: number): string {
  const prefix = productCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const suffix = String(productId).padStart(8, '0');
  return `${prefix}${suffix}`;
}

router.patch("/products/generate-barcodes", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  // product_ids is required — callers must explicitly select which products to tag.
  // Products that already have a barcode are always skipped regardless.
  const { product_ids } = req.body as { product_ids?: unknown };

  if (!Array.isArray(product_ids)) {
    res.status(400).json({ error: "product_ids is required and must be a non-empty array of positive integers" });
    return;
  }

  // Require every element to be a positive integer
  const parsed = (product_ids as unknown[]).map((id) => {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : NaN;
  });
  if (parsed.some(isNaN)) {
    res.status(400).json({ error: "product_ids must be an array of positive integers" });
    return;
  }
  if (parsed.length === 0) {
    res.json({ updated: 0, message: "No products selected." });
    return;
  }

  const filterIds = [...new Set(parsed)]; // deduplicate

  // Build condition: in the selection AND no barcode yet
  const noBarcode = sql`${productsTable.barcode} IS NULL OR ${productsTable.barcode} = ''`;
  const where = and(
    noBarcode,
    sql`${productsTable.id} = ANY(ARRAY[${sql.join(filterIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
  );

  const untagged = await db
    .select({ id: productsTable.id, productCode: productsTable.productCode, productName: productsTable.productName })
    .from(productsTable)
    .where(where);

  if (untagged.length === 0) {
    res.json({ updated: 0, message: "All selected products already have barcodes." });
    return;
  }

  // Update each untagged product — re-check barcode is still unset to guard against races
  const updatedIds: number[] = [];
  for (const p of untagged) {
    const barcode = makeBarcode(p.productCode, p.id);
    const rows = await db
      .update(productsTable)
      .set({ barcode })
      .where(and(eq(productsTable.id, p.id), sql`${productsTable.barcode} IS NULL OR ${productsTable.barcode} = ''`))
      .returning({ id: productsTable.id });
    if (rows.length > 0) updatedIds.push(p.id);
  }

  if (updatedIds.length === 0) {
    res.json({ updated: 0, message: "All selected products already have barcodes." });
    return;
  }

  await logAudit(req, {
    action: "product.barcodes_generated",
    entityType: "product",
    entityId: 0,
    description: `Bulk-generated barcodes for ${updatedIds.length} selected product(s)`,
    metadata: { count: updatedIds.length, productIds: updatedIds },
  });

  // Fetch the updated products so the frontend can display the summary
  const updatedIdSet = new Set(updatedIds);
  const updatedProducts = untagged
    .filter((p) => updatedIdSet.has(p.id))
    .map((p) => ({
      id: p.id,
      product_code: p.productCode,
      product_name: p.productName,
      barcode: makeBarcode(p.productCode, p.id),
    }));

  res.json({
    updated: updatedIds.length,
    message: `Generated barcodes for ${updatedIds.length} product(s).`,
    products: updatedProducts,
  });
});

router.get("/products/barcode/:barcode", async (req, res): Promise<void> => {
  const barcode = Array.isArray(req.params.barcode) ? req.params.barcode[0] : req.params.barcode;
  const [p] = await db.select().from(productsTable).where(eq(productsTable.barcode, barcode));
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  const scope = getBranchScope(req);
  const map = await loadStockMap({ branchId: scope.branchId, all: scope.mode === "all" });
  res.json(formatProduct(p, undefined, undefined, undefined, stockFor(map, p)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!p) { res.status(404).json({ error: "Product not found" }); return; }
  const scope = getBranchScope(req);
  const map = await loadStockMap({ branchId: scope.branchId, all: scope.mode === "all" });
  res.json(formatProduct(p, undefined, undefined, undefined, stockFor(map, p)));
});

router.patch("/products/:id", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { product_code, barcode, product_name, description, category_id, brand_id, supplier_id, cost_price, selling_price, vat_rate, current_stock, min_stock, image_url, unit } = req.body;
  const [before] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!before) { res.status(404).json({ error: "Product not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (product_code !== undefined) updateData.productCode = product_code;
  if (barcode !== undefined) updateData.barcode = barcode;
  if (product_name !== undefined) updateData.productName = product_name;
  if (description !== undefined) updateData.description = description;
  if (category_id !== undefined) updateData.categoryId = category_id;
  if (brand_id !== undefined) updateData.brandId = brand_id;
  if (supplier_id !== undefined) updateData.supplierId = supplier_id;
  if (cost_price !== undefined) updateData.costPrice = cost_price.toString();
  if (selling_price !== undefined) updateData.sellingPrice = selling_price.toString();
  if (vat_rate !== undefined) updateData.vatRate = vat_rate.toString();
  if (image_url !== undefined) updateData.imageUrl = image_url;
  if (unit !== undefined) updateData.unit = unit;
  const [p] = Object.keys(updateData).length
    ? await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning()
    : [before];

  // Stock and reorder threshold are per-branch — write them to product_stock for
  // the acting branch, not the global catalog row.
  const branchId = await resolveWriteBranchId(req);
  if (current_stock !== undefined || min_stock !== undefined) {
    const row = await getBranchStockRow(branchId, id);
    const newCur = current_stock !== undefined ? current_stock : (row?.currentStock ?? 0);
    const newMin = min_stock !== undefined ? min_stock : (row?.minStock ?? 0);
    await setBranchStock(branchId, id, newCur, newMin);
  }
  const stockRow = await getBranchStockRow(branchId, id);
  const stock = { current: stockRow?.currentStock ?? 0, min: stockRow?.minStock ?? p.minStock };

  const beforeSnap = formatProduct(before);
  const afterSnap = formatProduct(p, undefined, undefined, undefined, stock);
  await logAudit(req, { action: "product.updated", entityType: "product", entityId: p.id, description: `Updated product "${p.productName}" (${p.productCode})`, metadata: { before: beforeSnap, after: afterSnap } });
  res.json(afterSnap);
});

router.delete("/products/:id", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  await db.delete(productsTable).where(eq(productsTable.id, id));
  await logAudit(req, { action: "product.deleted", entityType: "product", entityId: id, description: `Deleted product "${p?.productName ?? id}"` });
  res.sendStatus(204);
});

export default router;
