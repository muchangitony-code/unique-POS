import { Router, type IRouter, type Request } from "express";
import { requireRole } from "../lib/permissions";
import { eq, and } from "drizzle-orm";
import { db, productsTable, categoriesTable, brandsTable, suppliersTable, productStockTable, stockMovementsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { resolveWriteBranchId, getBranchScope } from "../lib/branch-scope";
import { setBranchStock, getBranchStockRow } from "../lib/stock";
import type { JwtPayload } from "../lib/auth";
import type Busboy from "busboy";

const router: IRouter = Router();

// In-memory job storage for this process. In production, use a persistent database.
const importJobs = new Map<
  string,
  {
    id: string;
    status: "draft" | "validating" | "ready" | "importing" | "complete" | "error";
    rows: Array<{
      rowNumber: number;
      raw: Record<string, string | undefined>;
      normalized: Record<string, unknown>;
      errors: string[];
    }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      created: number;
      updated: number;
    };
    error?: string;
    createdBy?: string;
    createdAt: Date;
  }
>();

function getReqUser(req: Request): JwtPayload | undefined {
  return (req as Request & { user?: JwtPayload }).user;
}

// Generate a simple job ID
function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Parse CSV content
function parseCSV(content: string): Record<string, string | undefined>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string | undefined> = {};
    headers.forEach((header, i) => {
      row[header] = values[i]?.trim();
    });
    return row;
  });
}

// Parse XLSX file (minimal: read first sheet as CSV)
// For now, we'll only accept CSV. XLSX support would require a library.
async function parseXLSX(_buffer: Buffer): Promise<Record<string, string | undefined>[]> {
  throw new Error("XLSX support not yet implemented. Please use CSV format.");
}

// Normalize column names to internal field keys
function normalizeRow(
  raw: Record<string, string | undefined>,
): Record<string, unknown> & { errors: string[] } {
  const normalized: Record<string, unknown> = {};
  const errors: string[] = [];

  // Column name mapping: common variations to internal keys
  const keyMap: Record<string, string[]> = {
    product_code: ["product code", "productcode", "sku", "code", "itemcode", "product_id"],
    barcode: ["barcode", "bar code", "ean", "upc"],
    product_name: ["product name", "productname", "name", "itemname", "description"],
    category: ["category", "categoryname", "product category"],
    brand: ["brand", "brandname", "manufacturer"],
    supplier: ["supplier", "suppliername", "vendor"],
    unit: ["unit", "uom", "measure"],
    cost_price: ["cost price", "costprice", "cost", "buying price", "purchase price"],
    selling_price: ["selling price", "sellingprice", "sale price", "price", "retail price"],
    vat_rate: ["vat", "vatrate", "tax", "tax rate"],
    min_stock: ["reorder level", "reorderlevel", "minimum stock", "minstock"],
    current_stock: ["opening stock", "openingstock", "current stock", "stock", "qty", "quantity"],
    description: ["description", "details", "notes"],
    image_url: ["image url", "imageurl", "image", "imagepath", "photourl"],
  };

  // Find matching column in raw data for each internal field
  for (const [internalKey, variations] of Object.entries(keyMap)) {
    for (const rawKey of Object.keys(raw)) {
      const rawKeyLower = rawKey.toLowerCase().trim();
      if (variations.some((v) => v === rawKeyLower)) {
        const value = raw[rawKey];
        if (value && value.trim()) {
          normalized[internalKey] = value.trim();
        }
        break;
      }
    }
  }

  // Validate required fields
  if (!normalized.product_name) {
    errors.push("Missing or empty Product Name");
  }

  // Type conversions
  if (normalized.cost_price) {
    const num = parseFloat(String(normalized.cost_price));
    normalized.cost_price = isNaN(num) ? "0" : num.toString();
  }
  if (normalized.selling_price) {
    const num = parseFloat(String(normalized.selling_price));
    normalized.selling_price = isNaN(num) ? "0" : num.toString();
  }
  if (normalized.vat_rate) {
    const num = parseFloat(String(normalized.vat_rate));
    normalized.vat_rate = isNaN(num) ? "16" : num.toString();
  }
  if (normalized.min_stock) {
    const num = parseInt(String(normalized.min_stock), 10);
    normalized.min_stock = isNaN(num) ? "0" : num.toString();
  }
  if (normalized.current_stock) {
    const num = parseInt(String(normalized.current_stock), 10);
    normalized.current_stock = isNaN(num) ? "0" : num.toString();
  }

  return { ...normalized, errors };
}

// Upload and parse endpoint: validates CSV/XLSX and creates a job
router.post("/products/imports/upload-and-parse", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  // Expect multipart form with 'file' field
  const Busboy = (await import("busboy")).default;
  const bb = Busboy({ headers: req.headers });

  let fileBuffer: Buffer | null = null;
  let fileName: string | null = null;
  let sourceName: string | null = null;

  bb.on("file", (_fieldname, file, info) => {
    fileName = info.filename;
    const chunks: Buffer[] = [];
    file.on("data", (chunk) => chunks.push(chunk));
    file.on("end", () => {
      fileBuffer = Buffer.concat(chunks);
    });
  });

  bb.on("field", (fieldname, value) => {
    if (fieldname === "source_name") sourceName = value;
  });

  bb.on("close", async () => {
    try {
      if (!fileBuffer) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Determine file type and parse
      const ext = fileName ? fileName.toLowerCase().split(".").pop() : "";
      let rows: Record<string, string | undefined>[] = [];

      if (ext === "csv" || ext === "txt") {
        rows = parseCSV(fileBuffer.toString("utf8"));
      } else if (ext === "xlsx" || ext === "xls") {
        rows = await parseXLSX(fileBuffer);
      } else {
        res.status(400).json({ error: "Unsupported file type. Use CSV, XLS, or XLSX." });
        return;
      }

      if (!rows.length) {
        res.status(400).json({ error: "No data rows found in file" });
        return;
      }

      // Normalize and validate all rows
      const jobId = generateJobId();
      const normalized = rows.map((raw, index) => {
        const { errors, ...data } = normalizeRow(raw);
        return {
          rowNumber: index + 2, // +2: index 0 is header, row numbers start at 1
          raw,
          normalized: data,
          errors,
        };
      });

      const validCount = normalized.filter((r) => r.errors.length === 0).length;
      const invalidCount = normalized.length - validCount;

      const job = {
        id: jobId,
        status: "ready" as const,
        rows: normalized,
        summary: {
          total: normalized.length,
          valid: validCount,
          invalid: invalidCount,
          created: 0,
          updated: 0,
        },
        createdBy: getReqUser(req)?.name,
        createdAt: new Date(),
      };

      importJobs.set(jobId, job);

      res.status(201).json({
        id: jobId,
        job: { id: jobId },
        data: { id: jobId },
        summary: job.summary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "File parsing failed";
      res.status(400).json({ error: message });
    }
  });

  bb.on("error", (err) => {
    res.status(400).json({ error: `Upload failed: ${err.message}` });
  });

  req.pipe(bb);
});

// Start import endpoint: executes the job
router.post("/products/imports/:jobId/start", requireRole("administrator", "manager", "storekeeper"), async (req, res): Promise<void> => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = importJobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "ready") {
    res.status(409).json({ error: `Job is ${job.status}, cannot start again` });
    return;
  }

  try {
    job.status = "importing";
    const scope = getBranchScope(req);
    const branchId = await resolveWriteBranchId(req);
    const user = getReqUser(req);

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    // Fetch related entities once
    const categories = await db.select().from(categoriesTable);
    const brands = await db.select().from(brandsTable);
    const suppliers = await db.select().from(suppliersTable);
    const catMap = Object.fromEntries(categories.map((c) => [c.name?.toLowerCase(), c.id]));
    const brandMap = Object.fromEntries(brands.map((b) => [b.name?.toLowerCase(), b.id]));
    const supplierMap = Object.fromEntries(suppliers.map((s) => [s.name?.toLowerCase(), s.id]));

    // Process each valid row
    for (const row of job.rows) {
      if (row.errors.length > 0) continue;

      const normalized = row.normalized as Record<string, unknown>;
      const productName = String(normalized.product_name || "");
      const productCode = String(normalized.product_code || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

      try {
        // Check for duplicate by product code or name
        const existing = await db.select().from(productsTable).where(
          eq(productsTable.productCode, productCode),
        );

        if (existing.length > 0) {
          // Update existing product
          const product = existing[0];
          await db
            .update(productsTable)
            .set({
              productName,
              barcode: normalized.barcode ? String(normalized.barcode) : product.barcode,
              costPrice: normalized.cost_price ? String(normalized.cost_price) : product.costPrice,
              sellingPrice: normalized.selling_price ? String(normalized.selling_price) : product.sellingPrice,
              vatRate: normalized.vat_rate ? String(normalized.vat_rate) : product.vatRate,
              unit: normalized.unit ? String(normalized.unit) : product.unit,
              description: normalized.description ? String(normalized.description) : product.description,
              imageUrl: normalized.image_url ? String(normalized.image_url) : product.imageUrl,
            })
            .where(eq(productsTable.id, product.id));
          updatedCount++;
        } else {
          // Create new product
          const categoryId = normalized.category ? catMap[String(normalized.category).toLowerCase()] : null;
          const brandId = normalized.brand ? brandMap[String(normalized.brand).toLowerCase()] : null;
          const supplierId = normalized.supplier ? supplierMap[String(normalized.supplier).toLowerCase()] : null;

          const [newProduct] = await db
            .insert(productsTable)
            .values({
              productCode,
              productName,
              barcode: normalized.barcode ? String(normalized.barcode) : null,
              categoryId: categoryId as number | null,
              brandId: brandId as number | null,
              supplierId: supplierId as number | null,
              costPrice: normalized.cost_price ? String(normalized.cost_price) : "0",
              sellingPrice: normalized.selling_price ? String(normalized.selling_price) : "0",
              vatRate: normalized.vat_rate ? String(normalized.vat_rate) : "16",
              unit: normalized.unit ? String(normalized.unit) : null,
              description: normalized.description ? String(normalized.description) : null,
              imageUrl: normalized.image_url ? String(normalized.image_url) : null,
              currentStock: 0,
              minStock: 0,
            })
            .returning();

          // Set branch-specific stock
          const openingStock = normalized.current_stock ? parseInt(String(normalized.current_stock), 10) : 0;
          const minStock = normalized.min_stock ? parseInt(String(normalized.min_stock), 10) : 0;

          if (openingStock > 0 || minStock > 0) {
            await setBranchStock(branchId, newProduct.id, openingStock, minStock);
          }

          // Log opening stock movement
          if (openingStock > 0) {
            await db.insert(stockMovementsTable).values({
              branchId,
              productId: newProduct.id,
              type: "opening",
              quantity: openingStock,
              quantityBefore: 0,
              quantityAfter: openingStock,
              reference: `BULK-${jobId}`,
              notes: `Bulk import from ${normalized.barcode ? "file with barcode" : "file"}`,
              createdBy: user?.name ?? null,
            });
          }

          createdCount++;
        }
      } catch (rowErr) {
        errors.push(`Row ${row.rowNumber}: ${rowErr instanceof Error ? rowErr.message : "Unknown error"}`);
      }
    }

    await logAudit(req, {
      action: "product.bulk_import",
      entityType: "product",
      entityId: 0,
      description: `Bulk imported ${createdCount} new products and updated ${updatedCount} existing`,
      metadata: { job_id: jobId, created: createdCount, updated: updatedCount, errors: errors.length },
    });

    job.status = "complete";
    job.summary.created = createdCount;
    job.summary.updated = updatedCount;

    res.json({
      id: jobId,
      created_count: createdCount,
      updated_count: updatedCount,
      created: createdCount,
      updated: updatedCount,
      summary: job.summary,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : "Import failed";
    res.status(500).json({ error: job.error });
  }
});

export default router;

