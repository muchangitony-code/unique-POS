"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const PDFDocument = require("pdfkit");
const readXlsxFile = require("read-excel-file/node");
const writeXlsxFile = require("write-excel-file/node");
const pdfParse = require("pdf-parse");
const bwipjs = require("bwip-js");

const TEMPLATE_HEADERS = [
  "Product Code",
  "Barcode",
  "Product Name",
  "Category",
  "Brand",
  "Unit",
  "Cost Price",
  "Selling Price",
  "VAT",
  "Reorder Level",
  "Opening Stock",
  "Supplier",
  "Location",
  "Description",
  "Image URL"
];

const FIELD_LABELS = {
  product_code: "Product Code / SKU",
  barcode: "Barcode",
  product_name: "Product Name",
  category: "Category",
  brand: "Brand",
  unit: "Unit",
  cost_price: "Cost Price",
  selling_price: "Selling Price",
  vat_rate: "VAT",
  min_stock: "Reorder Level",
  current_stock: "Opening Stock",
  supplier: "Supplier",
  location: "Location",
  description: "Description",
  image_url: "Image URL"
};

const HEADER_ALIASES = {
  product_code: ["productcode", "productcodesku", "sku", "code", "itemcode", "productid"],
  barcode: ["barcode", "barcodenumber", "ean", "upc"],
  product_name: ["productname", "name", "itemname", "descriptionname"],
  category: ["category", "categoryname", "productcategory"],
  brand: ["brand", "brandname", "manufacturer"],
  unit: ["unit", "uom", "measure", "symbol"],
  cost_price: ["costprice", "cost", "buyprice", "purchaseprice"],
  selling_price: ["sellingprice", "saleprice", "price", "retailprice", "unitprice"],
  vat_rate: ["vat", "vatrate", "tax", "taxrate"],
  min_stock: ["reorderlevel", "minimumstock", "minstock", "reorderqty"],
  current_stock: ["openingstock", "stock", "currentstock", "qty", "quantity"],
  supplier: ["supplier", "suppliername", "vendor"],
  location: ["location", "branch", "branchcode", "branchname", "store"],
  description: ["description", "details", "notes"],
  image_url: ["imageurl", "image", "imagepath", "photourl", "pictureurl"]
};

function createProductBulkRouter(deps) {
  const {
    Router,
    pool,
    logAudit,
    makeBarcode,
    requireRole,
    resolveWriteBranchId
  } = deps;

  const router = Router();
  let ensureSchemaPromise = null;
  const activeJobs = new Map();

  async function ensureSchema() {
    if (!ensureSchemaPromise) {
      ensureSchemaPromise = (async function () {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS product_import_jobs (
            id SERIAL PRIMARY KEY,
            source_type TEXT NOT NULL,
            file_name TEXT,
            source_name TEXT,
            object_path TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            column_mapping JSONB,
            options JSONB,
            summary JSONB,
            total_rows INTEGER NOT NULL DEFAULT 0,
            processed_rows INTEGER NOT NULL DEFAULT 0,
            valid_rows INTEGER NOT NULL DEFAULT 0,
            invalid_rows INTEGER NOT NULL DEFAULT 0,
            skipped_rows INTEGER NOT NULL DEFAULT 0,
            created_count INTEGER NOT NULL DEFAULT 0,
            updated_count INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            undo_data JSONB,
            last_error TEXT,
            created_by_id INTEGER,
            created_by_name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            undone_at TIMESTAMPTZ
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS product_import_rows (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES product_import_jobs(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            raw_data JSONB NOT NULL,
            normalized_data JSONB,
            validation_errors JSONB,
            action TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            product_id INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_jobs_created_at_idx ON product_import_jobs (created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_jobs_status_idx ON product_import_jobs (status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_rows_job_id_idx ON product_import_rows (job_id, row_number)`);
      })();
    }
    return ensureSchemaPromise;
  }

  function safeJson(value, fallback) {
    if (value == null) return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function headerKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function trimText(value) {
    return String(value == null ? "" : value).trim();
  }

  function toNumber(value) {
    if (value == null || value === "") return null;
    const cleaned = String(value).replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function mapFieldLabel(field) {
    return FIELD_LABELS[field] || field;
  }

  function csvEscape(value) {
    if (value == null) return "";
    const stringValue = String(value);
    return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
  }

  function parseDelimitedLine(line, delimiter) {
    const out = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (char === delimiter && !quoted) {
        out.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    out.push(current);
    return out.map((value) => value.trim());
  }

  function parseDelimitedText(text) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [];
    const delimiter = normalized.includes("\t") ? "\t" : ",";
    const lines = normalized.split("\n").filter(Boolean);
    return lines.map((line) => parseDelimitedLine(line, delimiter));
  }

  function rowsFromMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) return { headers: [], rows: [] };
    const headers = matrix[0].map((value, index) => trimText(value) || `Column ${index + 1}`);
    const rows = matrix.slice(1).map((cells, rowIndex) => {
      const record = {};
      headers.forEach((header, headerIndex) => {
        record[header] = cells[headerIndex] == null ? "" : String(cells[headerIndex]).trim();
      });
      return { row_number: rowIndex + 2, raw_data: record };
    }).filter((row) => Object.values(row.raw_data).some((value) => trimText(value) !== ""));
    return { headers, rows };
  }

  function detectMapping(headers) {
    const mapping = {};
    for (const field of Object.keys(FIELD_LABELS)) {
      const aliases = HEADER_ALIASES[field] || [];
      const match = headers.find((header) => aliases.includes(headerKey(header)));
      if (match) mapping[field] = match;
    }
    return mapping;
  }

  function normalizeImportedRow(rawData, mapping) {
    const getValue = (field) => trimText(rawData[mapping[field]]);
    return {
      product_code: getValue("product_code"),
      barcode: getValue("barcode"),
      product_name: getValue("product_name"),
      category: getValue("category"),
      brand: getValue("brand"),
      unit: getValue("unit"),
      cost_price: toNumber(getValue("cost_price")),
      selling_price: toNumber(getValue("selling_price")),
      vat_rate: toNumber(getValue("vat_rate")),
      min_stock: toNumber(getValue("min_stock")),
      current_stock: toNumber(getValue("current_stock")),
      supplier: getValue("supplier"),
      location: getValue("location"),
      description: getValue("description"),
      image_url: getValue("image_url")
    };
  }

  function validateImportedRow(normalized) {
    const errors = [];
    if (!normalized.product_name) errors.push("Product Name is required — every product must have a name.");
    if (normalized.selling_price == null) errors.push("Selling Price is required — enter the price this product is sold for.");
    if (normalized.cost_price != null && normalized.cost_price < 0) errors.push("Cost Price must be zero or greater.");
    if (normalized.selling_price != null && normalized.selling_price < 0) errors.push("Selling Price must be zero or greater.");
    if (normalized.vat_rate != null && normalized.vat_rate < 0) errors.push("VAT must be zero or greater.");
    if (normalized.min_stock != null && normalized.min_stock < 0) errors.push("Reorder Level must be zero or greater.");
    if (normalized.current_stock != null && normalized.current_stock < 0) errors.push("Opening Stock must be zero or greater.");
    if (normalized.image_url && !/^https?:\/\//i.test(normalized.image_url) && !normalized.image_url.startsWith("/objects/")) {
      errors.push("Image URL must use http(s) or a saved object path.");
    }
    return errors;
  }

  async function readObjectBuffer(objectPath) {
    const root = path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "storage"));
    if (!objectPath.startsWith("/objects/")) throw new Error("Invalid uploaded object path");
    const relativePath = objectPath.slice("/objects/".length);
    const absolutePath = path.resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid uploaded object path");
    return await fs.readFile(absolutePath);
  }

  async function parseImportSource({ source_type, object_path, paste_text, file_name }) {
    if (paste_text) {
      return rowsFromMatrix(parseDelimitedText(paste_text));
    }
    if (!object_path) throw new Error("An uploaded import file or pasted spreadsheet data is required.");
    const buffer = await readObjectBuffer(object_path);
    return parseBufferSource({ buffer, source_type, file_name: file_name || object_path });
  }

  async function parseBufferSource({ buffer, source_type, file_name }) {
    const extension = path.extname(file_name || "").toLowerCase();
    if (extension === ".csv" || source_type === "csv" || source_type === "paste") {
      return rowsFromMatrix(parseDelimitedText(buffer.toString("utf8")));
    }
    if (extension === ".xlsx" || source_type === "xlsx") {
      const workbook = await readXlsxFile(buffer);
      const rows = Array.isArray(workbook) && workbook[0] && Array.isArray(workbook[0].data) ? workbook[0].data : workbook;
      return rowsFromMatrix(rows);
    }
    if (extension === ".pdf" || source_type === "pdf") {
      const parsed = await pdfParse(buffer);
      const lines = String(parsed.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const matrix = lines.map((line) => line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/g));
      return rowsFromMatrix(matrix);
    }
    // Try CSV as fallback for unknown extensions
    return rowsFromMatrix(parseDelimitedText(buffer.toString("utf8")));
  }

  function collectRawBody(req, limitBytes) {
    const max = limitBytes || 10 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let aborted = false;
      req.on("data", (chunk) => {
        if (aborted) return;
        size += chunk.length;
        if (size > max) {
          aborted = true;
          reject(new Error("Upload too large. Maximum file size is 10 MB."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => { if (!aborted) resolve(Buffer.concat(chunks)); });
      req.on("error", (err) => { if (!aborted) { aborted = true; reject(err); } });
    });
  }

  async function fetchExistingMatches(codes, barcodes, names) {
    const params = [];
    const clauses = [];
    if (codes.length) {
      params.push(codes);
      clauses.push(`product_code = ANY($${params.length})`);
    }
    if (barcodes.length) {
      params.push(barcodes);
      clauses.push(`barcode = ANY($${params.length})`);
    }
    if (names.length) {
      params.push(names);
      clauses.push(`lower(product_name) = ANY($${params.length})`);
    }
    if (!clauses.length) return [];
    const { rows } = await pool.query(
      `SELECT id, product_code, barcode, product_name FROM products WHERE ${clauses.join(" OR ")}`,
      params
    );
    return rows;
  }

  async function saveDraftJob({ sourceType, sourceName, fileName, objectPath, mapping, preparedRows, actor }) {
    await ensureSchema();
    const summary = buildDraftSummary(preparedRows);
    const { rows: jobRows } = await pool.query(
      `INSERT INTO product_import_jobs
         (source_type, source_name, file_name, object_path, status, column_mapping, summary, total_rows, valid_rows, invalid_rows, error_count, created_by_id, created_by_name)
       VALUES
         ($1, $2, $3, $4, 'draft', $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        sourceType,
        sourceName || fileName || sourceType,
        fileName || null,
        objectPath || null,
        JSON.stringify(mapping),
        JSON.stringify(summary),
        preparedRows.length,
        summary.valid_rows,
        summary.invalid_rows,
        summary.error_count,
        actor?.userId || null,
        actor?.name || null
      ]
    );
    const job = jobRows[0];
    await insertImportRows(job.id, preparedRows);
    return job;
  }

  function buildDraftSummary(preparedRows) {
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;
    for (const row of preparedRows) {
      if (Array.isArray(row.validation_errors) && row.validation_errors.length) invalid += 1;
      else valid += 1;
      if (row.action === "duplicate") duplicates += 1;
    }
    return {
      valid_rows: valid,
      invalid_rows: invalid,
      duplicate_rows: duplicates,
      error_count: invalid
    };
  }

  async function insertImportRows(jobId, preparedRows) {
    const batchSize = 200;
    for (let start = 0; start < preparedRows.length; start += batchSize) {
      const batch = preparedRows.slice(start, start + batchSize);
      const values = [];
      const params = [];
      batch.forEach((row, index) => {
        const offset = index * 6;
        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}::jsonb, $${offset + 5}::jsonb, $${offset + 6})`);
        params.push(jobId, row.row_number, JSON.stringify(row.raw_data), JSON.stringify(row.normalized_data), JSON.stringify(row.validation_errors), row.action);
      });
      await pool.query(
        `INSERT INTO product_import_rows (job_id, row_number, raw_data, normalized_data, validation_errors, action)
         VALUES ${values.join(", ")}`,
        params
      );
    }
  }

  async function prepareDraftRows(source) {
    const mapping = detectMapping(source.headers);
    const prepared = source.rows.map((row) => ({
      row_number: row.row_number,
      raw_data: row.raw_data,
      normalized_data: applyImportDefaults(normalizeImportedRow(row.raw_data, mapping), row.row_number),
      validation_errors: [],
      action: "create"
    }));
    const codeSet = new Set();
    const barcodeSet = new Set();
    const nameSet = new Set();
    prepared.forEach((row) => {
      if (row.normalized_data.product_code) codeSet.add(row.normalized_data.product_code);
      if (row.normalized_data.barcode) barcodeSet.add(row.normalized_data.barcode);
      if (row.normalized_data.product_name) nameSet.add(row.normalized_data.product_name.toLowerCase());
    });
    const existing = await fetchExistingMatches([...codeSet], [...barcodeSet], [...nameSet]);
    const existingByCode = new Map(existing.filter((item) => item.product_code).map((item) => [item.product_code, item]));
    const existingByBarcode = new Map(existing.filter((item) => item.barcode).map((item) => [item.barcode, item]));
    const existingByName = new Map(existing.filter((item) => item.product_name).map((item) => [item.product_name.toLowerCase(), item]));
    prepared.forEach((row) => {
      const errors = validateImportedRow(row.normalized_data);
      const existingMatch = existingByCode.get(row.normalized_data.product_code) || existingByBarcode.get(row.normalized_data.barcode) || existingByName.get((row.normalized_data.product_name || "").toLowerCase());
      if (existingMatch) {
        row.normalized_data.existing_match = existingMatch;
        row.action = "update";
      }
      row.validation_errors = errors;
    });
    return { mapping, rows: prepared };
  }

  async function loadJob(jobId) {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT * FROM product_import_jobs WHERE id = $1`, [jobId]);
    return rows[0] || null;
  }

  async function loadJobRows(jobId, options = {}) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const offset = (page - 1) * limit;
    const filters = [`job_id = $1`];
    const params = [jobId];
    if (options.onlyErrors) filters.push(`jsonb_array_length(COALESCE(validation_errors, '[]'::jsonb)) > 0`);
    const [{ rows: dataRows }, { rows: countRows }] = await Promise.all([
      pool.query(`SELECT * FROM product_import_rows WHERE ${filters.join(" AND ")} ORDER BY row_number LIMIT $2 OFFSET $3`, [jobId, limit, offset]),
      pool.query(`SELECT count(*)::int AS total FROM product_import_rows WHERE ${filters.join(" AND ")}`, params)
    ]);
    return { rows: dataRows, total: countRows[0]?.total || 0, page, limit };
  }

  function serializeJob(job) {
    if (!job) return null;
    return {
      id: job.id,
      source_type: job.source_type,
      source_name: job.source_name,
      file_name: job.file_name,
      status: job.status,
      column_mapping: safeJson(job.column_mapping, {}),
      options: safeJson(job.options, {}),
      summary: safeJson(job.summary, {}),
      total_rows: Number(job.total_rows || 0),
      processed_rows: Number(job.processed_rows || 0),
      valid_rows: Number(job.valid_rows || 0),
      invalid_rows: Number(job.invalid_rows || 0),
      skipped_rows: Number(job.skipped_rows || 0),
      created_count: Number(job.created_count || 0),
      updated_count: Number(job.updated_count || 0),
      duplicate_count: Number(job.duplicate_count || 0),
      error_count: Number(job.error_count || 0),
      created_by_id: job.created_by_id,
      created_by_name: job.created_by_name,
      last_error: job.last_error,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      undone_at: job.undone_at
    };
  }

  async function remapJob(jobId, mapping) {
    const rows = (await pool.query(`SELECT id, row_number, raw_data FROM product_import_rows WHERE job_id = $1 ORDER BY row_number`, [jobId])).rows;
    const prepared = rows.map((row) => {
      const rawData = safeJson(row.raw_data, {});
      const normalized = applyImportDefaults(normalizeImportedRow(rawData, mapping), row.row_number);
      const validationErrors = validateImportedRow(normalized);
      return { id: row.id, normalized, validationErrors };
    });
    const codes = new Set();
    const barcodes = new Set();
    const names = new Set();
    prepared.forEach((row) => {
      if (row.normalized.product_code) codes.add(row.normalized.product_code);
      if (row.normalized.barcode) barcodes.add(row.normalized.barcode);
      if (row.normalized.product_name) names.add(row.normalized.product_name.toLowerCase());
    });
    const existing = await fetchExistingMatches([...codes], [...barcodes], [...names]);
    const existingByCode = new Map(existing.filter((item) => item.product_code).map((item) => [item.product_code, item]));
    const existingByBarcode = new Map(existing.filter((item) => item.barcode).map((item) => [item.barcode, item]));
    const existingByName = new Map(existing.filter((item) => item.product_name).map((item) => [item.product_name.toLowerCase(), item]));
    let valid = 0;
    let invalid = 0;
    for (const row of prepared) {
      const existingMatch = existingByCode.get(row.normalized.product_code) || existingByBarcode.get(row.normalized.barcode) || existingByName.get((row.normalized.product_name || "").toLowerCase());
      if (existingMatch) {
        row.normalized.existing_match = existingMatch;
      }
      const action = existingMatch ? "update" : "create";
      await pool.query(
        `UPDATE product_import_rows SET normalized_data = $2::jsonb, validation_errors = $3::jsonb, action = $4 WHERE id = $1`,
        [row.id, JSON.stringify(row.normalized), JSON.stringify(row.validationErrors), action]
      );
      if (row.validationErrors.length) invalid += 1;
      else valid += 1;
    }
    await pool.query(
      `UPDATE product_import_jobs SET column_mapping = $2::jsonb, valid_rows = $3, invalid_rows = $4, error_count = $4, summary = $5::jsonb WHERE id = $1`,
      [jobId, JSON.stringify(mapping), valid, invalid, JSON.stringify({ valid_rows: valid, invalid_rows: invalid, error_count: invalid })]
    );
  }

  async function getReferenceId(client, table, name, actor, type) {
    const normalized = trimText(name);
    if (!normalized) return null;
    const existing = await client.query(`SELECT id FROM ${table} WHERE lower(name) = lower($1) LIMIT 1`, [normalized]);
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await client.query(`INSERT INTO ${table} (name, created_at) VALUES ($1, NOW()) RETURNING id`, [normalized]);
    await logAudit({ user: actor, headers: {}, socket: {} }, {
      action: `${type}.created_by_import`,
      entityType: type,
      entityId: created.rows[0].id,
      description: `Created ${type} "${normalized}" during bulk import`
    });
    return created.rows[0].id;
  }

  async function resolveBranchId(client, location, fallbackBranchId) {
    const normalized = trimText(location);
    if (!normalized) return fallbackBranchId;
    const branch = await client.query(
      `SELECT id FROM branches WHERE lower(code) = lower($1) OR lower(name) = lower($1) ORDER BY id LIMIT 1`,
      [normalized]
    );
    return branch.rows[0]?.id || fallbackBranchId;
  }

  async function fetchExistingProduct(client, normalized) {
    const productCode = trimText(normalized.product_code);
    const barcode = trimText(normalized.barcode);
    const productName = trimText(normalized.product_name);
    const { rows } = await client.query(
      `SELECT * FROM products
       WHERE ($1 <> '' AND product_code = $1)
          OR ($2 <> '' AND barcode = $2)
          OR ($3 <> '' AND lower(product_name) = lower($3))
       ORDER BY CASE WHEN product_code = $1 THEN 0 WHEN barcode = $2 THEN 1 ELSE 2 END, id
       LIMIT 1`,
      [productCode, barcode, productName]
    );
    return rows[0] || null;
  }

  async function getBranchStock(client, branchId, productId) {
    const { rows } = await client.query(
      `SELECT id, current_stock, min_stock FROM product_stock WHERE branch_id = $1 AND product_id = $2 LIMIT 1`,
      [branchId, productId]
    );
    return rows[0] || null;
  }

  async function upsertBranchStock(client, branchId, productId, currentStock, minStock) {
    const { rows } = await client.query(
      `INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (branch_id, product_id)
       DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock = EXCLUDED.min_stock
       RETURNING id, current_stock, min_stock`,
      [branchId, productId, currentStock, minStock]
    );
    return rows[0];
  }

  function uniqueDuplicateCode(productCode, jobId, rowNumber) {
    return `${trimText(productCode).slice(0, 40)}-DUP-${jobId}-${rowNumber}`.replace(/\s+/g, "-").slice(0, 64);
  }

  function generateSku(category, productName, rowNumber) {
    const catPrefix = (trimText(category) || "GEN")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "GEN";
    const nameSlug = (trimText(productName) || "PRODUCT")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20)
      .toUpperCase();
    return `${catPrefix}-${nameSlug}-${String(rowNumber).padStart(3, "0")}`.slice(0, 64);
  }

  function applyImportDefaults(normalized, rowNumber) {
    const result = Object.assign({}, normalized);
    if (!result.product_code) {
      result.product_code = generateSku(result.category, result.product_name, rowNumber);
    }
    if (result.vat_rate == null) result.vat_rate = 16;
    if (result.current_stock == null) result.current_stock = 0;
    if (result.min_stock == null) result.min_stock = 0;
    return result;
  }

  async function processImportJob(jobId, actor) {
    const client = await pool.connect();
    try {
      const job = await loadJob(jobId);
      if (!job) return;
      const options = Object.assign({ on_duplicate: "update", auto_create_references: true }, safeJson(job.options, {}));
      await pool.query(`UPDATE product_import_jobs SET status = 'processing', started_at = COALESCE(started_at, NOW()), last_error = NULL WHERE id = $1`, [jobId]);
      const rows = (await client.query(`SELECT * FROM product_import_rows WHERE job_id = $1 ORDER BY row_number`, [jobId])).rows;
      const undoData = { created_product_ids: [], updated_products: [] };
      let processed = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      for (const row of rows) {
        const normalized = safeJson(row.normalized_data, {});
        const validationErrors = safeJson(row.validation_errors, []);
        if (validationErrors.length) {
          errorCount += 1;
          await client.query(`UPDATE product_import_rows SET status = 'invalid' WHERE id = $1`, [row.id]);
          processed += 1;
          continue;
        }
        const branchId = await resolveBranchId(client, normalized.location, options.default_branch_id || actor.branchId || null);
        const categoryId = options.auto_create_references ? await getReferenceId(client, "categories", normalized.category, actor, "category") : null;
        const brandId = options.auto_create_references ? await getReferenceId(client, "brands", normalized.brand, actor, "brand") : null;
        const supplierId = options.auto_create_references ? await getReferenceId(client, "suppliers", normalized.supplier, actor, "supplier") : null;
        const existing = await fetchExistingProduct(client, normalized);
        let action = row.action || (existing ? "update" : "create");
        if (existing && options.on_duplicate === "skip") action = "skip";
        if (existing && options.on_duplicate === "duplicate") action = "duplicate";
        if (action === "skip") {
          skippedCount += 1;
          await client.query(`UPDATE product_import_rows SET status = 'skipped', action = 'skip', product_id = $2 WHERE id = $1`, [row.id, existing?.id || null]);
          processed += 1;
          continue;
        }
        if (action === "update" && existing) {
          const beforeStock = branchId ? await getBranchStock(client, branchId, existing.id) : null;
          undoData.updated_products.push({ product_id: existing.id, branch_id: branchId, before_product: existing, before_stock: beforeStock });
          const updated = await client.query(
            `UPDATE products SET
               product_code = $2,
               barcode = NULLIF($3, ''),
               product_name = $4,
               description = NULLIF($5, ''),
               category_id = $6,
               brand_id = $7,
               supplier_id = $8,
               cost_price = $9,
               selling_price = $10,
               vat_rate = $11,
               image_url = NULLIF($12, ''),
               unit = NULLIF($13, '')
             WHERE id = $1 RETURNING id`,
            [
              existing.id,
              normalized.product_code,
              normalized.barcode,
              normalized.product_name,
              normalized.description,
              categoryId,
              brandId,
              supplierId,
              String(normalized.cost_price ?? 0),
              String(normalized.selling_price ?? 0),
              String(normalized.vat_rate ?? 16),
              normalized.image_url,
              normalized.unit
            ]
          );
          if (branchId) {
            await upsertBranchStock(client, branchId, existing.id, Number(normalized.current_stock ?? 0), Number(normalized.min_stock ?? 0));
          }
          await client.query(`UPDATE product_import_rows SET status = 'updated', action = 'update', product_id = $2 WHERE id = $1`, [row.id, updated.rows[0].id]);
          updatedCount += 1;
        } else {
          let productCode = normalized.product_code;
          let barcode = normalized.barcode || null;
          if (existing && action === "duplicate") {
            productCode = uniqueDuplicateCode(normalized.product_code || normalized.product_name || "ITEM", jobId, row.row_number);
            duplicateCount += 1;
            barcode = barcode || makeBarcode(productCode, row.row_number);
          }
          const created = await client.query(
            `INSERT INTO products
              (product_code, barcode, product_name, description, category_id, brand_id, supplier_id, cost_price, selling_price, vat_rate, current_stock, min_stock, image_url, unit, created_at)
             VALUES
              ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, ''), NULLIF($14, ''), NOW())
             RETURNING id`,
            [
              productCode,
              barcode,
              normalized.product_name,
              normalized.description,
              categoryId,
              brandId,
              supplierId,
              String(normalized.cost_price ?? 0),
              String(normalized.selling_price ?? 0),
              String(normalized.vat_rate ?? 16),
              Number(normalized.current_stock ?? 0),
              Number(normalized.min_stock ?? 0),
              normalized.image_url,
              normalized.unit
            ]
          );
          const productId = created.rows[0].id;
          undoData.created_product_ids.push(productId);
          if (branchId) {
            await upsertBranchStock(client, branchId, productId, Number(normalized.current_stock ?? 0), Number(normalized.min_stock ?? 0));
          }
          await client.query(`UPDATE product_import_rows SET status = 'created', action = $2, product_id = $3 WHERE id = $1`, [row.id, action, productId]);
          createdCount += 1;
        }
        processed += 1;
        if (processed % 25 === 0 || processed === rows.length) {
          await pool.query(
            `UPDATE product_import_jobs
             SET processed_rows = $2, created_count = $3, updated_count = $4, skipped_rows = $5, duplicate_count = $6, error_count = $7
             WHERE id = $1`,
            [jobId, processed, createdCount, updatedCount, skippedCount, duplicateCount, errorCount]
          );
        }
      }
      await pool.query(
        `UPDATE product_import_jobs
         SET status = 'completed', processed_rows = $2, created_count = $3, updated_count = $4, skipped_rows = $5, duplicate_count = $6, error_count = $7,
             summary = $8::jsonb, undo_data = $9::jsonb, completed_at = NOW()
         WHERE id = $1`,
        [
          jobId,
          processed,
          createdCount,
          updatedCount,
          skippedCount,
          duplicateCount,
          errorCount,
          JSON.stringify({ processed_rows: processed, created_count: createdCount, updated_count: updatedCount, skipped_rows: skippedCount, duplicate_count: duplicateCount, error_count: errorCount }),
          JSON.stringify(undoData)
        ]
      );
      await logAudit({ user: actor, headers: {}, socket: {} }, {
        action: "product.import_completed",
        entityType: "product_import",
        entityId: jobId,
        description: `Completed bulk product import #${jobId}`,
        metadata: { processed, createdCount, updatedCount, skippedCount, duplicateCount, errorCount }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(`UPDATE product_import_jobs SET status = 'failed', last_error = $2, completed_at = NOW() WHERE id = $1`, [jobId, message]);
      await logAudit({ user: actor, headers: {}, socket: {} }, {
        action: "product.import_failed",
        entityType: "product_import",
        entityId: jobId,
        description: `Bulk product import #${jobId} failed: ${message}`
      });
    } finally {
      client.release();
      activeJobs.delete(jobId);
    }
  }

  function startBackgroundJob(jobId, actor) {
    if (activeJobs.has(jobId)) return;
    activeJobs.set(jobId, true);
    setImmediate(() => {
      processImportJob(jobId, actor).catch(() => {
        activeJobs.delete(jobId);
      });
    });
  }

  function requireProductIds(body) {
    const ids = Array.isArray(body?.product_ids) ? body.product_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0) : [];
    if (!ids.length) throw new Error("Select at least one product.");
    return [...new Set(ids)];
  }

  async function fetchProductsForIds(ids, branchId) {
    const { rows } = await pool.query(
      `SELECT p.id, p.product_code, p.barcode, p.product_name, p.description, p.unit,
              p.cost_price::numeric::text AS cost_price, p.selling_price::numeric::text AS selling_price,
              p.vat_rate::numeric::text AS vat_rate, p.image_url,
              c.name AS category_name, b.name AS brand_name, s.name AS supplier_name,
              COALESCE(ps.current_stock, p.current_stock) AS current_stock, COALESCE(ps.min_stock, p.min_stock) AS min_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ($2::int IS NULL OR ps.branch_id = $2)
       WHERE p.id = ANY($1::int[])
       ORDER BY p.product_name`,
      [ids, branchId || null]
    );
    return rows;
  }

  async function fetchAllProducts(branchId) {
    const { rows } = await pool.query(
      `SELECT p.id, p.product_code, p.barcode, p.product_name, p.description, p.unit,
              p.cost_price::numeric::text AS cost_price, p.selling_price::numeric::text AS selling_price,
              p.vat_rate::numeric::text AS vat_rate, p.image_url,
              c.name AS category_name, b.name AS brand_name, s.name AS supplier_name,
              COALESCE(SUM(ps.current_stock) FILTER (WHERE $1::int IS NULL OR ps.branch_id = $1), p.current_stock) AS current_stock,
              COALESCE(MAX(ps.min_stock) FILTER (WHERE $1::int IS NULL OR ps.branch_id = $1), p.min_stock) AS min_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       GROUP BY p.id, c.name, b.name, s.name
       ORDER BY p.product_name`,
      [branchId || null]
    );
    return rows;
  }

  function currentBranchId(req) {
    return req.user?.branchId || null;
  }

  async function loadBusinessBranding() {
    const { rows } = await pool.query(`SELECT business_name, logo_url, business_phone, business_email FROM business_settings ORDER BY id LIMIT 1`);
    return rows[0] || { business_name: "UniquePOS", logo_url: null, business_phone: "", business_email: "" };
  }

  async function loadLogoBuffer(logoUrl) {
    const value = trimText(logoUrl);
    if (!value) return null;
    if (value.startsWith("/objects/")) return readObjectBuffer(value).catch(() => null);
    if (!value.startsWith("/")) return null;
    const publicRoot = path.resolve(process.env.SERVE_CLIENT_DIR || path.join(process.cwd(), "public"));
    const absolutePath = path.resolve(publicRoot, `.${value}`);
    if (absolutePath !== publicRoot && !absolutePath.startsWith(`${publicRoot}${path.sep}`)) return null;
    return fs.readFile(absolutePath).catch(() => null);
  }

  // Combined upload-and-parse endpoint: client sends raw file bytes, server parses in-memory.
  // This avoids the two-step upload flow and works regardless of how many server replicas are running.
  router.post("/products/imports/upload-and-parse", async (req, res) => {
    await ensureSchema();
    const fileName = trimText(String(req.query.filename || req.headers["x-filename"] || ""));
    const extension = path.extname(fileName).toLowerCase();
    let sourceType;
    if (extension === ".csv") {
      sourceType = "csv";
    } else if (extension === ".pdf") {
      sourceType = "pdf";
    } else if (extension === ".xlsx" || extension === ".xls") {
      sourceType = "xlsx";
    } else if (!extension) {
      // No extension — try to sniff: fall back to xlsx (common default)
      sourceType = "xlsx";
    } else {
      res.status(400).json({ error: "Unsupported file type \u201c" + extension + "\u201d. Please upload an Excel (.xlsx), CSV (.csv), or PDF (.pdf) file." });
      return;
    }
    const sourceName = fileName || "Uploaded file";

    const buffer = await collectRawBody(req, 10 * 1024 * 1024);
    if (!buffer.length) {
      res.status(400).json({ error: "No file data received. Please select a file and try again." });
      return;
    }

    const source = await parseBufferSource({ buffer, source_type: sourceType, file_name: fileName });
    if (!source.headers.length) {
      res.status(400).json({ error: "No tabular data found in this file. Make sure it has column headers in the first row and at least one product row." });
      return;
    }

    const draft = await prepareDraftRows(source);
    const job = await saveDraftJob({
      sourceType,
      sourceName,
      fileName: fileName || null,
      objectPath: null,
      mapping: draft.mapping,
      preparedRows: draft.rows,
      actor: req.user
    });

    await logAudit(req, {
      action: "product.import_draft_created",
      entityType: "product_import",
      entityId: job.id,
      description: `Created bulk product import draft #${job.id} from ${fileName || "upload"}`,
      metadata: { sourceType, totalRows: draft.rows.length }
    });

    res.status(201).json({
      job: serializeJob(job),
      headers: source.headers,
      mapping: draft.mapping,
      preview: draft.rows.slice(0, 100)
    });
  });

  router.post("/products/imports/parse", async (req, res) => {
    await ensureSchema();
    const sourceType = trimText(req.body?.source_type) || "paste";
    const sourceName = trimText(req.body?.source_name) || trimText(req.body?.file_name) || sourceType.toUpperCase();
    const source = await parseImportSource({
      source_type: sourceType,
      object_path: trimText(req.body?.object_path),
      paste_text: req.body?.paste_text || "",
      file_name: trimText(req.body?.file_name)
    });
    if (!source.headers.length) {
      res.status(400).json({ error: "No tabular data was detected in the import source." });
      return;
    }
    const draft = await prepareDraftRows(source);
    const job = await saveDraftJob({
      sourceType,
      sourceName,
      fileName: trimText(req.body?.file_name),
      objectPath: trimText(req.body?.object_path),
      mapping: draft.mapping,
      preparedRows: draft.rows,
      actor: req.user
    });
    await logAudit(req, {
      action: "product.import_draft_created",
      entityType: "product_import",
      entityId: job.id,
      description: `Created bulk product import draft #${job.id}`,
      metadata: { sourceType, totalRows: draft.rows.length }
    });
    res.status(201).json({
      job: serializeJob(job),
      headers: source.headers,
      mapping: draft.mapping,
      preview: draft.rows.slice(0, 100)
    });
  });

  router.post("/products/imports/:id/remap", async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      res.status(400).json({ error: "Invalid import id" });
      return;
    }
    const mapping = req.body?.mapping;
    if (!mapping || typeof mapping !== "object") {
      res.status(400).json({ error: "mapping is required" });
      return;
    }
    await remapJob(jobId, mapping);
    const job = await loadJob(jobId);
    const rows = await loadJobRows(jobId, { page: 1, limit: 100 });
    res.json({ job: serializeJob(job), mapping, preview: rows.rows.map(serializeImportRow) });
  });

  router.post("/products/imports/:id/start", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = await loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    if (!["draft", "failed"].includes(job.status)) {
      res.status(400).json({ error: `Import job is already ${job.status}` });
      return;
    }
    const options = {
      on_duplicate: ["skip", "update", "duplicate"].includes(req.body?.on_duplicate) ? req.body.on_duplicate : "update",
      auto_create_references: req.body?.auto_create_references !== false,
      default_branch_id: await resolveWriteBranchId(req)
    };
    await pool.query(`UPDATE product_import_jobs SET status = 'queued', options = $2::jsonb WHERE id = $1`, [jobId, JSON.stringify(options)]);
    startBackgroundJob(jobId, req.user || {});
    await logAudit(req, {
      action: "product.import_started",
      entityType: "product_import",
      entityId: jobId,
      description: `Started bulk product import #${jobId}`,
      metadata: options
    });
    res.json({ ok: true, job: serializeJob(await loadJob(jobId)) });
  });

  router.get("/products/imports", async (_req, res) => {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT * FROM product_import_jobs ORDER BY created_at DESC LIMIT 50`);
    res.json({ data: rows.map(serializeJob) });
  });

  router.patch("/products/imports/:id/rows/:rowId", async (req, res) => {
    await ensureSchema();
    const jobId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    if (!Number.isInteger(jobId) || jobId <= 0 || !Number.isInteger(rowId) || rowId <= 0) {
      res.status(400).json({ error: "Invalid import job or row id." });
      return;
    }
    const updates = req.body || {};
    const { rows } = await pool.query(
      `SELECT id, row_number, normalized_data FROM product_import_rows WHERE id = $1 AND job_id = $2`,
      [rowId, jobId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Import row not found." });
      return;
    }
    const existing = safeJson(rows[0].normalized_data, {});
    const merged = Object.assign({}, existing);
    if (updates.product_name != null) merged.product_name = trimText(String(updates.product_name));
    if (updates.selling_price != null) merged.selling_price = toNumber(String(updates.selling_price));
    if (updates.product_code != null) merged.product_code = trimText(String(updates.product_code));
    // Re-apply defaults in case product_code was cleared
    const withDefaults = applyImportDefaults(merged, rows[0].row_number);
    const validationErrors = validateImportedRow(withDefaults);
    const action = withDefaults.existing_match ? "update" : "create";
    await pool.query(
      `UPDATE product_import_rows SET normalized_data = $2::jsonb, validation_errors = $3::jsonb, action = $4 WHERE id = $1`,
      [rowId, JSON.stringify(withDefaults), JSON.stringify(validationErrors), action]
    );
    // Update job-level counts
    const allRows = (await pool.query(
      `SELECT validation_errors FROM product_import_rows WHERE job_id = $1`, [jobId]
    )).rows;
    const errorCount = allRows.filter((r) => {
      const errs = safeJson(r.validation_errors, []);
      return errs.length > 0;
    }).length;
    const validCount = allRows.length - errorCount;
    await pool.query(
      `UPDATE product_import_jobs SET invalid_rows = $2, valid_rows = $3, error_count = $2 WHERE id = $1`,
      [jobId, errorCount, validCount]
    );
    res.json({
      row: serializeImportRow(Object.assign({}, rows[0], {
        normalized_data: JSON.stringify(withDefaults),
        validation_errors: JSON.stringify(validationErrors),
        action
      })),
      valid: validationErrors.length === 0,
      job_valid_rows: validCount,
      job_error_count: errorCount
    });
  });

  function serializeImportRow(row) {
    return {
      id: row.id,
      row_number: row.row_number,
      raw_data: safeJson(row.raw_data, {}),
      normalized_data: safeJson(row.normalized_data, {}),
      validation_errors: safeJson(row.validation_errors, []),
      action: row.action,
      status: row.status,
      product_id: row.product_id
    };
  }

  router.get("/products/imports/:id", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = await loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    const rows = await loadJobRows(jobId, { page: Number(req.query.page || 1), limit: Number(req.query.limit || 50), onlyErrors: req.query.errors === "1" });
    res.json({ job: serializeJob(job), rows: rows.rows.map(serializeImportRow), total: rows.total, page: rows.page, limit: rows.limit });
  });

  router.get("/products/imports/:id/errors.csv", async (req, res) => {
    const jobId = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT row_number, raw_data, validation_errors FROM product_import_rows WHERE job_id = $1 AND jsonb_array_length(COALESCE(validation_errors, '[]'::jsonb)) > 0 ORDER BY row_number`,
      [jobId]
    );
    const csv = ["Row,Errors,Raw Data"].concat(rows.map((row) => `${row.row_number},${csvEscape(safeJson(row.validation_errors, []).join(" | "))},${csvEscape(JSON.stringify(safeJson(row.raw_data, {})))}`)).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="product-import-${jobId}-errors.csv"`);
    res.send(`\uFEFF${csv}`);
  });

  router.post("/products/imports/:id/undo", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = await loadJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    if (job.status !== "completed" || job.undone_at) {
      res.status(400).json({ error: "Only completed imports can be undone once." });
      return;
    }
    const latest = (await pool.query(`SELECT id FROM product_import_jobs WHERE status = 'completed' AND undone_at IS NULL ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`)).rows[0];
    if (!latest || Number(latest.id) !== jobId) {
      res.status(400).json({ error: "Only the latest completed import can be undone." });
      return;
    }
    const undo = safeJson(job.undo_data, { created_product_ids: [], updated_products: [] });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const productId of undo.created_product_ids || []) {
        await client.query(`DELETE FROM product_stock WHERE product_id = $1`, [productId]);
        await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
      }
      for (const item of undo.updated_products || []) {
        const beforeProduct = item.before_product || {};
        await client.query(
          `UPDATE products SET
             product_code = $2,
             barcode = $3,
             product_name = $4,
             description = $5,
             category_id = $6,
             brand_id = $7,
             supplier_id = $8,
             cost_price = $9,
             selling_price = $10,
             vat_rate = $11,
             current_stock = $12,
             min_stock = $13,
             image_url = $14,
             unit = $15
           WHERE id = $1`,
          [
            item.product_id,
            beforeProduct.product_code,
            beforeProduct.barcode,
            beforeProduct.product_name,
            beforeProduct.description,
            beforeProduct.category_id,
            beforeProduct.brand_id,
            beforeProduct.supplier_id,
            beforeProduct.cost_price,
            beforeProduct.selling_price,
            beforeProduct.vat_rate,
            beforeProduct.current_stock,
            beforeProduct.min_stock,
            beforeProduct.image_url,
            beforeProduct.unit
          ]
        );
        if (item.branch_id && item.before_stock) {
          await client.query(
            `INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (branch_id, product_id)
             DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock = EXCLUDED.min_stock`,
            [item.branch_id, item.product_id, item.before_stock.current_stock, item.before_stock.min_stock]
          );
        }
      }
      await client.query(`UPDATE product_import_jobs SET status = 'undone', undone_at = NOW() WHERE id = $1`, [jobId]);
      await client.query("COMMIT");
      await logAudit(req, {
        action: "product.import_undone",
        entityType: "product_import",
        entityId: jobId,
        description: `Undid bulk product import #${jobId}`
      });
      res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.get("/products/imports/templates/csv", async (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="product-import-template.csv"');
    res.send(`\uFEFF${TEMPLATE_HEADERS.join(",")}\nSKU-001,,Solar Panel 100W,Panels,Generic,pcs,5000,6500,16,5,20,Solar Supplier,MAIN,Sample description,https://example.com/product.jpg\n`);
  });

  router.get("/products/imports/templates/xlsx", async (_req, res) => {
    const sheet = [
      TEMPLATE_HEADERS.map((header) => ({ value: header, type: String, fontWeight: "bold" })),
      [
        { value: "SKU-001", type: String },
        { value: "", type: String },
        { value: "Solar Panel 100W", type: String },
        { value: "Panels", type: String },
        { value: "Generic", type: String },
        { value: "pcs", type: String },
        { value: 5000, type: Number },
        { value: 6500, type: Number },
        { value: 16, type: Number },
        { value: 5, type: Number },
        { value: 20, type: Number },
        { value: "Solar Supplier", type: String },
        { value: "MAIN", type: String },
        { value: "Sample description", type: String },
        { value: "https://example.com/product.jpg", type: String }
      ]
    ];
    const buffer = await writeXlsxFile(sheet).toBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="product-import-template.xlsx"');
    res.send(buffer);
  });

  router.post("/products/bulk/price-updates", async (req, res) => {
    const ids = requireProductIds(req.body);
    const mode = req.body?.mode === "amount" ? "amount" : "percentage";
    const target = ["cost_price", "selling_price", "both"].includes(req.body?.target) ? req.body.target : "selling_price";
    const value = Number(req.body?.value);
    if (!Number.isFinite(value)) {
      res.status(400).json({ error: "A numeric value is required." });
      return;
    }
    const products = await fetchProductsForIds(ids, currentBranchId(req));
    for (const product of products) {
      const updates = {};
      const apply = (amount) => mode === "percentage" ? amount + amount * (value / 100) : amount + value;
      if (target === "cost_price" || target === "both") updates.cost_price = String(Math.max(0, apply(Number(product.cost_price || 0))));
      if (target === "selling_price" || target === "both") updates.selling_price = String(Math.max(0, apply(Number(product.selling_price || 0))));
      const fields = [];
      const params = [product.id];
      Object.entries(updates).forEach(([key, val], index) => {
        fields.push(`${key} = $${index + 2}`);
        params.push(val);
      });
      if (fields.length) await pool.query(`UPDATE products SET ${fields.join(", ")} WHERE id = $1`, params);
    }
    await logAudit(req, { action: "product.bulk_price_updated", entityType: "product", entityId: 0, description: `Bulk updated ${products.length} product price(s)` });
    res.json({ ok: true, updated: products.length });
  });

  router.post("/products/bulk/stock-adjustments", async (req, res) => {
    const ids = requireProductIds(req.body);
    const mode = ["add", "subtract", "set"].includes(req.body?.mode) ? req.body.mode : "add";
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity)) {
      res.status(400).json({ error: "A numeric quantity is required." });
      return;
    }
    const branchId = await resolveWriteBranchId(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const productId of ids) {
        const stock = await getBranchStock(client, branchId, productId);
        const before = Number(stock?.current_stock ?? 0);
        const minStock = Number(stock?.min_stock ?? 0);
        const after = mode === "set" ? quantity : mode === "subtract" ? Math.max(0, before - quantity) : before + quantity;
        await upsertBranchStock(client, branchId, productId, after, minStock);
        await client.query(
          `INSERT INTO stock_movements (branch_id, product_id, type, quantity, quantity_before, quantity_after, reference, notes, created_by, created_at)
           VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7, $8, NOW())`,
          [branchId, productId, mode === "set" ? after - before : mode === "subtract" ? -quantity : quantity, before, after, `BULK-ADJ-${Date.now()}`, trimText(req.body?.reason) || "Bulk stock adjustment", req.user?.name || null]
        );
      }
      await client.query("COMMIT");
      await logAudit(req, { action: "product.bulk_stock_adjusted", entityType: "product", entityId: 0, description: `Bulk adjusted stock for ${ids.length} product(s)` });
      res.json({ ok: true, updated: ids.length });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.post("/products/bulk/category-reassign", async (req, res) => {
    const ids = requireProductIds(req.body);
    let categoryId = Number(req.body?.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      categoryId = await getReferenceId(pool, "categories", trimText(req.body?.category_name), req.user || {}, "category");
    }
    if (!categoryId) {
      res.status(400).json({ error: "Choose or create a category first." });
      return;
    }
    await pool.query(`UPDATE products SET category_id = $2 WHERE id = ANY($1::int[])`, [ids, categoryId]);
    await logAudit(req, { action: "product.bulk_category_reassigned", entityType: "product", entityId: 0, description: `Bulk reassigned category for ${ids.length} product(s)` });
    res.json({ ok: true, updated: ids.length });
  });

  router.post("/products/bulk/image-urls", async (req, res) => {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) {
      res.status(400).json({ error: "updates is required" });
      return;
    }
    let updated = 0;
    for (const entry of updates) {
      const imageUrl = trimText(entry.image_url);
      if (!imageUrl) continue;
      if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/objects/")) continue;
      if (entry.product_id) {
        await pool.query(`UPDATE products SET image_url = $2 WHERE id = $1`, [Number(entry.product_id), imageUrl]);
        updated += 1;
      } else if (entry.product_code) {
        await pool.query(`UPDATE products SET image_url = $2 WHERE product_code = $1`, [trimText(entry.product_code), imageUrl]);
        updated += 1;
      }
    }
    await logAudit(req, { action: "product.bulk_images_updated", entityType: "product", entityId: 0, description: `Bulk updated image URLs for ${updated} product(s)` });
    res.json({ ok: true, updated });
  });

  router.get("/products/duplicates", async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT 'product_code' AS duplicate_type, product_code AS duplicate_value, array_agg(id ORDER BY id) AS product_ids, count(*)::int AS duplicate_count
      FROM products WHERE product_code IS NOT NULL AND product_code <> ''
      GROUP BY product_code HAVING count(*) > 1
      UNION ALL
      SELECT 'barcode' AS duplicate_type, barcode AS duplicate_value, array_agg(id ORDER BY id) AS product_ids, count(*)::int AS duplicate_count
      FROM products WHERE barcode IS NOT NULL AND barcode <> ''
      GROUP BY barcode HAVING count(*) > 1
      UNION ALL
      SELECT 'product_name' AS duplicate_type, lower(product_name) AS duplicate_value, array_agg(id ORDER BY id) AS product_ids, count(*)::int AS duplicate_count
      FROM products WHERE product_name IS NOT NULL AND product_name <> ''
      GROUP BY lower(product_name) HAVING count(*) > 1
      ORDER BY duplicate_type, duplicate_value
    `);
    res.json({ data: rows });
  });

  router.get("/products/export.xlsx", async (req, res) => {
    const products = await fetchAllProducts(currentBranchId(req));
    const sheet = [
      TEMPLATE_HEADERS.map((header) => ({ value: header, type: String, fontWeight: "bold" }))
    ].concat(products.map((product) => [
      { value: product.product_code || "", type: String },
      { value: product.barcode || "", type: String },
      { value: product.product_name || "", type: String },
      { value: product.category_name || "", type: String },
      { value: product.brand_name || "", type: String },
      { value: product.unit || "", type: String },
      { value: Number(product.cost_price || 0), type: Number },
      { value: Number(product.selling_price || 0), type: Number },
      { value: Number(product.vat_rate || 0), type: Number },
      { value: Number(product.min_stock || 0), type: Number },
      { value: Number(product.current_stock || 0), type: Number },
      { value: product.supplier_name || "", type: String },
      { value: "", type: String },
      { value: product.description || "", type: String },
      { value: product.image_url || "", type: String }
    ]));
    const buffer = await writeXlsxFile(sheet).toBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="products-export.xlsx"');
    res.send(buffer);
  });

  router.get("/products/export.pdf", async (req, res) => {
    const products = await fetchAllProducts(currentBranchId(req));
    const branding = await loadBusinessBranding();
    const logoBuffer = await loadLogoBuffer(branding.logo_url);
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="products-export.pdf"');
    doc.pipe(res);
    let headerX = 36;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 36, 24, { fit: [60, 60] });
        headerX = 110;
      } catch {
        headerX = 36;
      }
    }
    doc.fontSize(18).text(branding.business_name || "UniquePOS", headerX, 28);
    doc.fontSize(10).text("Product Catalogue Export", headerX, 52);
    doc.moveDown(4);
    products.forEach((product, index) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      doc.fontSize(10).font("Helvetica-Bold").text(`${index + 1}. ${product.product_name} (${product.product_code})`);
      doc.font("Helvetica").fontSize(9).text(`Barcode: ${product.barcode || "—"} | Category: ${product.category_name || "—"} | Brand: ${product.brand_name || "—"}`);
      doc.text(`Stock: ${product.current_stock || 0} | Price: ${Number(product.selling_price || 0).toLocaleString("en-KE", { style: "currency", currency: "KES" })} | VAT: ${product.vat_rate || 0}%`);
      if (product.description) doc.text(`Description: ${product.description}`);
      doc.moveDown(0.5);
    });
    doc.end();
  });

  router.get("/products/barcode-labels.pdf", async (req, res) => {
    const ids = String(req.query.ids || "").split(",").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
    if (!ids.length) {
      res.status(400).json({ error: "ids query parameter is required" });
      return;
    }
    const products = await fetchProductsForIds(ids, currentBranchId(req));
    for (const product of products) {
      if (!trimText(product.barcode)) {
        const barcode = makeBarcode(product.product_code || `P${product.id}`, product.id);
        await pool.query(`UPDATE products SET barcode = $2 WHERE id = $1`, [product.id, barcode]);
        product.barcode = barcode;
      }
    }
    const doc = new PDFDocument({ margin: 24, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="barcode-labels.pdf"');
    doc.pipe(res);
    const labelWidth = 170;
    const labelHeight = 120;
    const cols = 3;
    let x = 24;
    let y = 24;
    let col = 0;
    for (const product of products) {
      if (y + labelHeight > doc.page.height - 24) {
        doc.addPage();
        x = 24;
        y = 24;
        col = 0;
      }
      doc.roundedRect(x, y, labelWidth, labelHeight, 8).stroke("#94a3b8");
      doc.fontSize(10).font("Helvetica-Bold").text(product.product_name || "Product", x + 8, y + 8, { width: labelWidth - 16 });
      const barcodeBuffer = await bwipjs.toBuffer({ bcid: "code128", text: product.barcode, scale: 2, height: 10, includetext: true, textxalign: "center" });
      doc.image(barcodeBuffer, x + 12, y + 28, { fit: [labelWidth - 24, 56], align: "center" });
      doc.font("Helvetica").fontSize(9).text(product.product_code || "", x + 8, y + 92, { width: labelWidth - 16, align: "center" });
      col += 1;
      x += labelWidth + 12;
      if (col >= cols) {
        col = 0;
        x = 24;
        y += labelHeight + 12;
      }
    }
    doc.end();
  });

  return router;
}

module.exports = { createProductBulkRouter, TEMPLATE_HEADERS, FIELD_LABELS };
