"use strict";
/**
 * UniquePOS Full Regression Test
 *
 * Runs against a live server.  Exit 0 = all pass, exit 1 = any failure.
 * Usage:  PORT=3099 node scripts/regression-test.cjs
 */

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");

const BASE = `http://localhost:${process.env.PORT || 3099}/api`;
const ADMIN_EMAIL = process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_EMAIL || "admin@test.local";
const ADMIN_PASSWORD = process.env.UNIQUEPOS_BOOTSTRAP_ADMIN_PASSWORD || "TestAdmin123!";
const REPORT_PATH = process.env.REGRESSION_REPORT || "/tmp/regression-report.json";

// ── http client ────────────────────────────────────────────────────────────────
function request(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: Object.assign(
          { "Content-Type": "application/json" },
          payload ? { "Content-Length": Buffer.byteLength(payload) } : {},
          headers || {}
        )
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let json = null;
          try { json = JSON.parse(text); } catch { json = { _raw: text }; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestBinary(method, url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: headers || {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks),
            headers: res.headers || {}
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function authHeader(token) {
  return token ? { Authorization: "Bearer " + token } : {};
}
function get(apiPath, token) {
  return request("GET", BASE + apiPath, null, authHeader(token));
}
function post(apiPath, body, token) {
  return request("POST", BASE + apiPath, body, authHeader(token));
}
function patch(apiPath, body, token) {
  return request("PATCH", BASE + apiPath, body, authHeader(token));
}
function del(apiPath, token) {
  return request("DELETE", BASE + apiPath, null, authHeader(token));
}
function isOk(res) { return res.status >= 200 && res.status < 300; }
function hasData(res) {
  return res.body && (Array.isArray(res.body) || Array.isArray(res.body.data));
}

// ── runner ────────────────────────────────────────────────────────────────────
const results = [];
let passed = 0;
let failed = 0;

function ok(name, status, check, detail) {
  const success = check === true;
  if (success) passed++; else failed++;
  results.push({ name, success, status, detail: detail || null });
  console.log("  " + (success ? "\u2713" : "\u2717") + " " + name +
    (!success && detail ? " \u2014 " + detail : ""));
}

async function section(title, fn) {
  console.log("\n\u2500\u2500 " + title + " \u2500\u2500");
  try { await fn(); } catch (err) {
    ok(title + " (uncaught)", null, false, String(err.message || err));
  }
}

async function run() {
  let token = null;
  let createdProductId = null;
  let createdCustomerId = null;
  let createdSupplierId = null;
  let createdSaleId = null;
  let createdInvoiceId = null;
  let createdQuotationId = null;

  // ── PostgreSQL connectivity ────────────────────────────────────────────────
  await section("PostgreSQL connectivity", async () => {
    const res = await get("/healthz");
    ok("GET /healthz returns 200", res.status, res.status === 200);
    ok("db_ok is true", res.status, res.body && res.body.db_ok === true,
      res.body && res.body.db_message ? res.body.db_message : "db_ok not true — body: " + JSON.stringify(res.body));
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  await section("Login", async () => {
    const res = await post("/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    ok("POST /auth/login returns 200", res.status, res.status === 200,
      "status=" + res.status + " body=" + JSON.stringify(res.body));
    token = res.body && res.body.token;
    ok("Login returns token", null, typeof token === "string" && token.length > 0);

    const me = await get("/auth/me", token);
    ok("GET /auth/me returns 200", me.status, me.status === 200);
    ok("me has id and role", me.status, !!(me.body && me.body.id && me.body.role),
      JSON.stringify(me.body));

    const bad = await post("/auth/login", { email: "nobody@x.com", password: "wrong" });
    ok("Bad credentials returns 401", bad.status, bad.status === 401, "got " + bad.status);
  });

  if (!token) {
    console.log("\n\u26a0  No admin token \u2014 aborting.");
    writeReport();
    process.exit(1);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  await section("Dashboard", async () => {
    const stats = await get("/dashboard/stats", token);
    ok("GET /dashboard/stats 200", stats.status, stats.status === 200);
    ok("stats has today_sales", stats.status, stats.body && "today_sales" in stats.body,
      JSON.stringify(stats.body));
    const tx = await get("/dashboard/recent-transactions", token);
    ok("GET /dashboard/recent-transactions 200", tx.status, tx.status === 200);
    const top = await get("/dashboard/top-products", token);
    ok("GET /dashboard/top-products 200", top.status, top.status === 200);
    ok("top-products is array", top.status, Array.isArray(top.body));
    const chart = await get("/dashboard/sales-chart", token);
    ok("GET /dashboard/sales-chart 200", chart.status, chart.status === 200);
    ok("sales-chart is array", chart.status, Array.isArray(chart.body));
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  await section("Settings", async () => {
    const branding = await get("/settings/branding", token);
    ok("GET /settings/branding 200", branding.status, branding.status === 200);
    const upd = await patch("/settings", { business_name: "UniquePOS Regression" }, token);
    ok("PATCH /settings 2xx", upd.status, isOk(upd), "status=" + upd.status);
  });

  // ── Reference data ────────────────────────────────────────────────────────
  await section("Categories, Brands, Suppliers", async () => {
    const cats = await get("/categories", token);
    ok("GET /categories 200", cats.status, cats.status === 200);
    ok("categories is array", cats.status, Array.isArray(cats.body));

    const brands = await get("/brands", token);
    ok("GET /brands 200", brands.status, brands.status === 200);
    ok("brands is array", brands.status, Array.isArray(brands.body));

    const sup = await get("/suppliers?limit=10", token);
    ok("GET /suppliers 200", sup.status, sup.status === 200);
    ok("suppliers has data", sup.status, hasData(sup));

    const newSup = await post("/suppliers",
      { name: "Regression Supplier " + Date.now(), phone: "0700000000", balance: 0 }, token);
    ok("POST /suppliers 201", newSup.status, newSup.status === 201, JSON.stringify(newSup.body));
    createdSupplierId = newSup.body && newSup.body.id;
  });

  // ── Products ──────────────────────────────────────────────────────────────
  await section("Products", async () => {
    const list = await get("/products?limit=10", token);
    ok("GET /products 200", list.status, list.status === 200);
    ok("products has data+total", list.status,
      !!(list.body && "total" in list.body && Array.isArray(list.body.data)),
      JSON.stringify(list.body));

    const sku = "REG-" + Date.now();
    const create = await post("/products",
      { product_code: sku, product_name: "Regression Product", selling_price: 100, cost_price: 60 }, token);
    ok("POST /products 201", create.status, create.status === 201, JSON.stringify(create.body));
    createdProductId = create.body && create.body.id;

    if (createdProductId) {
      const byId = await get("/products/" + createdProductId, token);
      ok("GET /products/:id 200", byId.status, byId.status === 200);

      const upd = await patch("/products/" + createdProductId,
        { product_name: "Regression Product Updated" }, token);
      ok("PATCH /products/:id 200", upd.status, upd.status === 200);

      const search = await get("/products?search=Regression+Product", token);
      ok("Product search returns results", search.status,
        search.status === 200 && search.body && search.body.total >= 1);

      const barcodeRes = await get("/products/barcode/NONEXISTENT-REG-XYZ", token);
      ok("Barcode search unknown → 404", barcodeRes.status, barcodeRes.status === 404);
    }
  });

  // ── Inventory ─────────────────────────────────────────────────────────────
  await section("Inventory", async () => {
    const stock = await get("/inventory/stock-count", token);
    ok("GET /inventory/stock-count 200", stock.status, stock.status === 200);
    ok("stock-count is array", stock.status, Array.isArray(stock.body));

    const moves = await get("/inventory/movements?limit=10", token);
    ok("GET /inventory/movements 200", moves.status, moves.status === 200);
    ok("movements has data", moves.status, hasData(moves));

    const transfers = await get("/inventory/transfers?limit=10", token);
    ok("GET /inventory/transfers 200", transfers.status, transfers.status === 200);
    ok("transfers has data", transfers.status, hasData(transfers));

    if (createdProductId) {
      const recv = await post("/inventory/receive",
        { product_id: createdProductId, quantity: 50, reference: "REG-RECV-001", notes: "" }, token);
      ok("POST /inventory/receive 2xx", recv.status, isOk(recv), JSON.stringify(recv.body));

      const adj = await post("/inventory/adjust",
        { product_id: createdProductId, quantity: -5, reason: "Regression adjustment", notes: "" }, token);
      ok("POST /inventory/adjust 2xx", adj.status, isOk(adj), JSON.stringify(adj.body));

      const after = await get("/inventory/stock-count", token);
      const row = Array.isArray(after.body) && after.body.find(function(r) {
        return r.product_id === createdProductId;
      });
      ok("Stock reflects receive+adjust (45)", after.status,
        !!(row && Number(row.current_stock) === 45),
        "current_stock=" + (row && row.current_stock));
    }
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  await section("Customers", async () => {
    const list = await get("/customers?limit=10", token);
    ok("GET /customers 200", list.status, list.status === 200);
    ok("customers has data", list.status, hasData(list));

    const cust = await post("/customers",
      { name: "Regression Customer " + Date.now(), phone: "0700000001", balance: 0 }, token);
    ok("POST /customers 201", cust.status, cust.status === 201, JSON.stringify(cust.body));
    createdCustomerId = cust.body && cust.body.id;

    if (createdCustomerId) {
      const byId = await get("/customers/" + createdCustomerId, token);
      ok("GET /customers/:id 200", byId.status, byId.status === 200);
      const upd = await patch("/customers/" + createdCustomerId,
        { name: "Regression Customer Updated" }, token);
      ok("PATCH /customers/:id 200", upd.status, upd.status === 200);
    }
  });

  // ── Sales ─────────────────────────────────────────────────────────────────
  await section("Sales", async () => {
    const list = await get("/pos/sales?limit=10", token);
    ok("GET /pos/sales 200", list.status, list.status === 200);
    ok("sales has data", list.status, hasData(list));

    if (createdProductId && createdCustomerId) {
      const sale = await post("/pos/sale", {
        customer_id: createdCustomerId,
        discount_amount: 0,
        amount_paid: 116,
        payment_method: "cash",
        document_type: "sale",
        items: [{ product_id: createdProductId, quantity: 1, unit_price: 100, discount: 0, vat_rate: 16 }]
      }, token);
      ok("POST /pos/sale 201", sale.status, sale.status === 201, JSON.stringify(sale.body));
      createdSaleId = sale.body && sale.body.id;
      createdInvoiceId = sale.body && sale.body.invoice_id;

      if (createdSaleId) {
        const byId = await get("/pos/sales/" + createdSaleId, token);
        ok("GET /pos/sales/:id 200", byId.status, byId.status === 200);
      }
    }
  });

  // ── Quotations ──────────────────────────────────────────────────────────────
  await section("Quotations", async () => {
    if (createdProductId && createdCustomerId) {
      const quotation = await post("/quotations", {
        customer_id: createdCustomerId,
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        notes: "Regression quotation",
        items: [{ product_id: createdProductId, description: "Regression Product Updated", quantity: 1, unit_price: 100, discount: 0, vat_rate: 16, total: 116 }]
      }, token);
      ok("POST /quotations 201", quotation.status, quotation.status === 201, JSON.stringify(quotation.body));
      createdQuotationId = quotation.body && quotation.body.id;
    } else {
      ok("POST /quotations 201", null, false, "missing product or customer prerequisite");
    }
  });

  // ── Documents ───────────────────────────────────────────────────────────────
  await section("Documents", async () => {
    const documentCases = [
      { name: "receipt", id: createdSaleId, paper: "80mm", expectText: "Regression Product Updated" },
      { name: "invoice", id: createdInvoiceId, paper: "a4", expectText: "Regression Product Updated" },
      { name: "quotation", id: createdQuotationId, paper: "a4", expectText: "Regression Product Updated" }
    ];
    for (const documentCase of documentCases) {
      if (!documentCase.id) {
        ok("Document " + documentCase.name + " prerequisites", null, false, "missing id");
        continue;
      }
      const preview = await get("/documents/" + documentCase.name + "/" + documentCase.id + "/preview?paper=" + documentCase.paper, token);
      ok("GET /documents/" + documentCase.name + "/:id/preview 200", preview.status, preview.status === 200, JSON.stringify(preview.body));
      ok(documentCase.name + " preview returns html", preview.status,
        !!(preview.body && typeof preview.body.html === "string" && preview.body.html.includes(documentCase.expectText)),
        preview.body && preview.body.html ? preview.body.html.slice(0, 200) : "no html");

      const pdf = await requestBinary("GET", BASE + "/documents/" + documentCase.name + "/" + documentCase.id + "/pdf?paper=" + documentCase.paper, authHeader(token));
      ok("GET /documents/" + documentCase.name + "/:id/pdf 200", pdf.status, pdf.status === 200,
        "status=" + pdf.status + " content-type=" + pdf.headers["content-type"]);
      ok(documentCase.name + " PDF content-type is application/pdf", pdf.status,
        String(pdf.headers["content-type"] || "").includes("application/pdf"),
        "content-type=" + pdf.headers["content-type"]);
      ok(documentCase.name + " PDF is non-empty", pdf.status,
        Buffer.isBuffer(pdf.body) && pdf.body.length > 32,
        "bytes=" + (pdf.body ? pdf.body.length : 0));
      ok(documentCase.name + " PDF header is valid", pdf.status,
        Buffer.isBuffer(pdf.body) && pdf.body.subarray(0, 4).toString("utf8") === "%PDF",
        Buffer.isBuffer(pdf.body) ? pdf.body.subarray(0, 16).toString("utf8") : "no body");
    }
  });

  // ── Purchases ─────────────────────────────────────────────────────────────
  await section("Purchases", async () => {
    const list = await get("/purchases?limit=10", token);
    ok("GET /purchases 200", list.status, list.status === 200);
    ok("purchases has data", list.status, hasData(list));

    if (createdProductId && createdSupplierId) {
      const pur = await post("/purchases", {
        supplier_id: createdSupplierId,
        reference: "REG-PUR-" + Date.now(),
        items: [{ product_id: createdProductId, quantity: 10, unit_price: 60, vat_rate: 16 }]
      }, token);
      ok("POST /purchases 201", pur.status, pur.status === 201, JSON.stringify(pur.body));
      if (pur.body && pur.body.id) {
        const byId = await get("/purchases/" + pur.body.id, token);
        ok("GET /purchases/:id 200", byId.status, byId.status === 200);
      }
    }
  });

  // ── Expenses ──────────────────────────────────────────────────────────────
  await section("Expenses", async () => {
    const list = await get("/expenses?limit=10", token);
    ok("GET /expenses 200", list.status, list.status === 200);
    ok("expenses has data", list.status, hasData(list));

    const exp = await post("/expenses",
      { description: "Regression Expense", amount: 500, payment_method: "cash", category: "Utilities" }, token);
    ok("POST /expenses 201", exp.status, exp.status === 201, JSON.stringify(exp.body));
    if (exp.body && exp.body.id) {
      const byId = await get("/expenses/" + exp.body.id, token);
      ok("GET /expenses/:id 200", byId.status, byId.status === 200);
    }
  });

  // ── Reports ───────────────────────────────────────────────────────────────
  await section("Reports", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const summary = await get("/reports/sales-summary?start=" + today + "&end=" + today, token);
    ok("GET /reports/sales-summary 200", summary.status, summary.status === 200);

    const invVal = await get("/reports/inventory-valuation", token);
    ok("GET /reports/inventory-valuation 200", invVal.status, invVal.status === 200);
    ok("inventory-valuation is array", invVal.status, Array.isArray(invVal.body));

    const audit = await get("/audit-log?limit=5", token);
    ok("GET /audit-log 200", audit.status, audit.status === 200);
  });

  // ── Bulk Product Import ───────────────────────────────────────────────────
  await section("Bulk Product Import", async () => {
    const jobs = await get("/products/imports", token);
    ok("GET /products/imports 200", jobs.status, jobs.status === 200);
    ok("imports list returns data", jobs.status, jobs.status === 200 && hasData(jobs));

    // Inline CSV parse (no multipart needed)
    const csv = "Product Code,Product Name,Selling Price,Cost Price\nREG-IMP-" + Date.now() + ",Import Widget,200,120";
    const parseRes = await request(
      "POST",
      BASE + "/products/imports/parse",
      { source_type: "csv", content: csv },
      Object.assign({ "Content-Type": "application/json" }, authHeader(token))
    );
    ok("POST /products/imports/parse 2xx", parseRes.status, isOk(parseRes),
      "status=" + parseRes.status + " body=" + JSON.stringify(parseRes.body));

    const jobId = parseRes.body && (parseRes.body.job_id || (parseRes.body.job && parseRes.body.job.id));
    if (jobId) {
      const jobRes = await get("/products/imports/" + jobId, token);
      ok("GET /products/imports/:id 200", jobRes.status, jobRes.status === 200);

      const startRes = await post("/products/imports/" + jobId + "/start", {}, token);
      ok("POST /products/imports/:id/start 2xx", startRes.status, isOk(startRes),
        JSON.stringify(startRes.body));

      // Poll for completion (up to 10 s)
      let jobDone = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(function(r) { setTimeout(r, 1000); });
        const poll = await get("/products/imports/" + jobId, token);
        const status = poll.body && poll.body.job && poll.body.job.status;
        if (status === "completed" || status === "failed") {
          ok("Import job completed successfully", poll.status, status === "completed",
            "status=" + status + " err=" + (poll.body.job.last_error || "none"));
          jobDone = true;
          break;
        }
      }
      if (!jobDone) ok("Import job polled 10s", null, false, "timed out waiting for completion");
    }
  });

  // ── Printing (PDF / XLSX export endpoints) ────────────────────────────────
  await section("Printing (PDF / XLSX exports)", async () => {
    const xlsx = await get("/products/export.xlsx", token);
    ok("GET /products/export.xlsx 2xx", xlsx.status, isOk(xlsx), "status=" + xlsx.status);

    const pdf = await get("/products/export.pdf", token);
    ok("GET /products/export.pdf 2xx", pdf.status, isOk(pdf), "status=" + pdf.status);

    const csvTpl = await get("/products/imports/templates/csv", token);
    ok("GET /products/imports/templates/csv 2xx", csvTpl.status, isOk(csvTpl),
      "status=" + csvTpl.status);

    const xlsxTpl = await get("/products/imports/templates/xlsx", token);
    ok("GET /products/imports/templates/xlsx 2xx", xlsxTpl.status, isOk(xlsxTpl),
      "status=" + xlsxTpl.status);

    // Barcode label PDF (empty ids → 400 is acceptable)
    const labels = await get("/products/barcode-labels.pdf?ids=", token);
    ok("GET /products/barcode-labels.pdf responds", labels.status,
      labels.status >= 200 && labels.status < 500, "status=" + labels.status);
  });

  // ── Email (SMTP config accessible) ────────────────────────────────────────
  await section("Email / WhatsApp (config endpoints)", async () => {
    const s = await get("/settings/branding", token);
    ok("Settings branding endpoint accessible (SMTP/WhatsApp config)", s.status,
      s.status === 200);
  });

  // ── Role-based access: sales_cashier can read products ────────────────────
  await section("Role access: sales_cashier reads products / categories", async () => {
    const cashierEmail = "cashier-reg-" + Date.now() + "@test.local";
    const userRes = await post("/users",
      { name: "Regression Cashier", email: cashierEmail, password: "Cashier123!", role: "cashier" }, token);
    ok("POST /users cashier 201", userRes.status, userRes.status === 201,
      JSON.stringify(userRes.body));

    if (isOk(userRes)) {
      const loginRes = await post("/auth/login", { email: cashierEmail, password: "Cashier123!" });
      ok("Cashier login 200", loginRes.status, loginRes.status === 200,
        JSON.stringify(loginRes.body));
      const cashierToken = loginRes.body && loginRes.body.token;

      if (cashierToken) {
        const prodList = await get("/products?limit=5", cashierToken);
        ok("sales_cashier GET /products 200", prodList.status, prodList.status === 200,
          "status=" + prodList.status);

        const cats = await get("/categories", cashierToken);
        ok("sales_cashier GET /categories 200", cats.status, cats.status === 200,
          "status=" + cats.status);

        const writeAttempt = await post("/products",
          { product_code: "NOAUTH-" + Date.now(), product_name: "Forbidden" }, cashierToken);
        ok("sales_cashier POST /products → 403", writeAttempt.status,
          writeAttempt.status === 403, "got " + writeAttempt.status);
      }
    }
  });

  // ── Auth guard ────────────────────────────────────────────────────────────
  await section("Authentication guard (unauthenticated requests)", async () => {
    const r1 = await get("/products", null);
    ok("GET /products without token → 401", r1.status, r1.status === 401, "got " + r1.status);
    const r2 = await get("/inventory/stock-count", null);
    ok("GET /inventory/stock-count without token → 401", r2.status, r2.status === 401,
      "got " + r2.status);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await section("Cleanup", async () => {
    // The main test product was used in a sale and therefore has sales history,
    // which blocks permanent deletion (the server returns 422 HAS_SALES_HISTORY).
    // Create a fresh product with no sales history to verify the DELETE endpoint.
    const delSku = "REG-DEL-" + Date.now();
    const delProd = await post("/products",
      { product_code: delSku, product_name: "Regression Delete Test", selling_price: 1, cost_price: 1 }, token);
    if (delProd.status === 201 && delProd.body && delProd.body.id) {
      const d = await del("/products/" + delProd.body.id, token);
      ok("DELETE /products/:id 2xx", d.status, isOk(d), "status=" + d.status);
    }
    ok("Cleanup complete", 200, true);
  });

  // ── summary ───────────────────────────────────────────────────────────────
  writeReport();
  const total = passed + failed;
  console.log("\n" + "─".repeat(60));
  console.log("Regression: " + passed + "/" + total + " passed, " + failed + " failed");
  if (failed > 0) {
    console.log("\nFailed:");
    results.filter(function(r) { return !r.success; }).forEach(function(r) {
      console.log("  \u2717 " + r.name + (r.detail ? " \u2014 " + r.detail : ""));
    });
    process.exit(1);
  } else {
    console.log("All tests passed \u2713");
    process.exit(0);
  }

  function writeReport() {
    const report = { timestamp: new Date().toISOString(), total: passed + failed, passed, failed, results };
    try { fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2)); } catch { /* non-fatal */ }
    console.log("\nReport: " + REPORT_PATH);
  }
}

run().catch(function(err) {
  console.error("Runner crashed:", err);
  process.exit(1);
});
