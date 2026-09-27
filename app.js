// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || "production";
const defaultClientDir = fs.existsSync(path.join(__dirname, "dist")) ? path.join(__dirname, "dist") : path.join(__dirname, "public");
process.env.SERVE_CLIENT_DIR = process.env.SERVE_CLIENT_DIR || defaultClientDir;
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");


// UNIQUEPOS_ADMIN_TEST_SALE_DELETE_RUNTIME_V1
// The production server is a generated CommonJS bundle. Mount the administrator
// test-sale cleanup endpoint immediately before the generated server starts
// listening, so the route is present in the actual Railway runtime.
function mountAdminTestSaleDeleteRuntime(runtimeSource) {
  if (runtimeSource.includes("UNIQUEPOS_ADMIN_TEST_SALE_DELETE_RUNTIME_V1")) return runtimeSource;
  const anchor = "app_default.listen(";
  const at = runtimeSource.indexOf(anchor);
  if (at < 0) throw new Error("UniquePOS: could not locate generated Express listen() anchor for test-sale deletion.");
  const code = `
/* UNIQUEPOS_ADMIN_TEST_SALE_DELETE_RUNTIME_V1 */
(function mountAdminTestSaleDelete() {
  const { Pool } = require("pg");
  const cleanupPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  app_default.delete("/api/pos/sale/:id", async (req, res) => {
    const role = String(req.user?.role || "");
    if (!["super_admin", "business_owner", "administrator"].includes(role)) {
      return res.status(req.user ? 403 : 401).json({ error: "Insufficient permissions" });
    }

    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid sale id" });

    const client = await cleanupPool.connect();
    try {
      await client.query("BEGIN");

      const saleResult = await client.query(
        "SELECT id, receipt_number, customer_id, total, amount_paid, branch_id FROM sales WHERE id = $1 FOR UPDATE",
        [id]
      );
      const sale = saleResult.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Sale not found" });
      }

      const userBranch = Number(req.user?.branchId ?? req.user?.branch_id ?? 0);
      if (userBranch > 0 && Number(sale.branch_id) !== userBranch) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Sale is outside your branch scope" });
      }

      const returned = await client.query(
        "SELECT id FROM sale_returns WHERE sale_id = $1 LIMIT 1",
        [id]
      );
      if (returned.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "This sale has returns and cannot be deleted. Use the returns process instead." });
      }

      const items = await client.query(
        "SELECT id, product_id, quantity FROM sale_items WHERE sale_id = $1",
        [id]
      );

      for (const item of items.rows) {
        const stock = await client.query(
          "INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock) VALUES ($1, $2, 0, 0) ON CONFLICT DO NOTHING RETURNING current_stock",
          [sale.branch_id, item.product_id]
        );

        const beforeResult = await client.query(
          "SELECT current_stock FROM product_stock WHERE branch_id = $1 AND product_id = $2 FOR UPDATE",
          [sale.branch_id, item.product_id]
        );
        const before = Number(beforeResult.rows[0]?.current_stock ?? 0);
        const after = before + Number(item.quantity);

        await client.query(
          "UPDATE product_stock SET current_stock = $1 WHERE branch_id = $2 AND product_id = $3",
          [after, sale.branch_id, item.product_id]
        );

        await client.query(
          "INSERT INTO stock_movements (product_id, type, quantity, quantity_before, quantity_after, reference, notes, created_by, branch_id) VALUES ($1, 'adjustment', $2, $3, $4, $5, $6, $7, $8)",
          [
            item.product_id,
            Number(item.quantity),
            before,
            after,
            "DELETE-" + sale.receipt_number,
            "Stock restored after administrator deleted test sale " + sale.receipt_number,
            String(req.user?.name || req.user?.email || "Administrator"),
            sale.branch_id
          ]
        );
      }

      const unpaid = Math.max(0, Number(sale.total) - Number(sale.amount_paid));
      if (sale.customer_id && unpaid > 0) {
        await client.query(
          "UPDATE customers SET balance = GREATEST(0, balance - $1) WHERE id = $2",
          [unpaid, sale.customer_id]
        );
      }

      await client.query("DELETE FROM sale_items WHERE sale_id = $1", [id]);
      await client.query("DELETE FROM sales WHERE id = $1", [id]);

      await client.query(
        "INSERT INTO audit_log (actor_id, actor_name, actor_role, ip_address, action, entity_type, entity_id, description, metadata, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          Number(req.user?.userId || req.user?.id || 0) || null,
          String(req.user?.name || req.user?.email || "Administrator"),
          role,
          req.ip || null,
          "sale.deleted",
          "sale",
          String(sale.id),
          "Administrator deleted test sale " + sale.receipt_number + " — KES " + Number(sale.total).toLocaleString(),
          JSON.stringify({ receipt: sale.receipt_number, reason: "test_data_cleanup" }),
          sale.branch_id
        ]
      );

      await client.query("COMMIT");
      return res.json({ ok: true, deleted: { id: sale.id, receipt_number: sale.receipt_number } });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      console.error("[admin-test-sale-delete]", error);
      return res.status(500).json({ error: "Could not delete sale" });
    } finally {
      client.release();
    }
  });
})();
`;
  return runtimeSource.slice(0, at) + code + runtimeSource.slice(at);
}

const runtimePath = path.join(__dirname, "server", "index.cjs");
const runtimeMarker = "UNIQUEPOS_PRODUCT_BULK_RUNTIME_MOUNT_V1";
if (fs.existsSync(runtimePath)) {
  let runtime = fs.readFileSync(runtimePath, "utf8");
  runtime = mountAdminTestSaleDeleteRuntime(runtime);
  if (!runtime.includes(runtimeMarker)) {
    const anchor = "runStartupMigrations().then(() => {";
    if (!runtime.includes(anchor)) throw new Error("UniquePOS: could not locate runtime startup anchor for product bulk import.");
    const injection = `\n// ${runtimeMarker}\n(function mountProductBulkImportRuntime() {\n  try {\n    const expressRuntime = require("express");\n    const { Pool } = require("pg");\n    const { createProductBulkRouter } = require(require("node:path").join(__dirname, "..", "product-bulk.cjs"));\n    const bulkPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined });\n    const bulkRouter = createProductBulkRouter({\n      Router: expressRuntime.Router,\n      pool: bulkPool,\n      logAudit: async () => {},\n      makeBarcode: (productCode, productId) => { const prefix = String(productCode || "PROD").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4).padEnd(4, "X"); return prefix + String(productId).padStart(8, "0"); },\n      resolveWriteBranchId: async (req) => { const direct = Number(req?.user?.branchId || req?.user?.branch_id || 0); if (Number.isInteger(direct) && direct > 0) return direct; const result = await bulkPool.query("SELECT id FROM branches ORDER BY id LIMIT 1"); return Number(result.rows[0]?.id || 0); },\n      detectProductCategorySuggestion: async () => null\n    });\n    app_default.use("/api", bulkRouter);\n    console.log("[product-bulk] runtime router mounted at /api/products/imports");\n  } catch (error) { console.error("[product-bulk] failed to mount runtime router", error); throw error; }\n})();\n\n`;
    runtime = runtime.replace(anchor, injection + anchor);
    fs.writeFileSync(runtimePath, runtime, "utf8");
  }
}

// Load the browser bridge before the existing document-print wrapper so that
// the wrapper's final print call is intercepted for 80mm receipts.
const indexPath = path.join(process.env.SERVE_CLIENT_DIR, "index.html");
const printScriptTag = '<script src="/thermal-printing.js"></script>';
const printWrapperMarker = '<script>\n      // Branded documents open in a separate print window.';
if (fs.existsSync(indexPath)) {
  let indexHtml = fs.readFileSync(indexPath, "utf8");
  if (!indexHtml.includes(printScriptTag)) {
    const markerAt = indexHtml.indexOf(printWrapperMarker);
    if (markerAt >= 0) indexHtml = indexHtml.slice(0, markerAt) + `    ${printScriptTag}\n    ` + indexHtml.slice(markerAt);
    else indexHtml = indexHtml.replace("</head>", `    ${printScriptTag}\n  </head>`);
    fs.writeFileSync(indexPath, indexHtml, "utf8");
  }
}

require("./server/index.cjs");
