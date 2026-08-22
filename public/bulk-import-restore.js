(function () {
  "use strict";

  const TOKEN_KEY = "uniquepos.token";
  const FIELDS = [
    ["product_code", "Product Code / SKU"], ["barcode", "Barcode"], ["product_name", "Product Name"],
    ["category", "Category"], ["brand", "Brand"], ["unit", "Unit"], ["cost_price", "Cost Price"],
    ["selling_price", "Selling Price"], ["vat_rate", "VAT"], ["min_stock", "Reorder Level"],
    ["current_stock", "Opening Stock"], ["supplier", "Supplier"], ["location", "Location"],
    ["description", "Description"], ["image_url", "Image URL"]
  ];

  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>\"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function api(path, options) {
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + token() });
    return fetch(path, opts).then(async function (res) {
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
      return data;
    });
  }
  function isBulkRoute() { return String(location.hash || "").replace(/^#/, "").split("?")[0] === "bulk-import"; }

  function render() {
    if (!isBulkRoute()) return;
    const root = document.getElementById("viewRoot");
    if (!root || root.dataset.bulkImportRestore === "1") return;
    root.dataset.bulkImportRestore = "1";
    root.innerHTML = `
      <section class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
          <div><h2 style="margin:0 0 6px;">Bulk Product Import</h2><p style="margin:0;color:#64748b;">Upload a CSV, Excel or text-based PDF. Review the data before anything is written to inventory.</p></div>
          <button type="button" class="btn btn-secondary" data-bulk-template>Download CSV template</button>
        </div>
        <div style="margin-top:20px;display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:16px;">
          <label class="stack-form"><span>Select product file</span><input id="bulkFileInput" type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"></label>
          <label class="stack-form"><span>Duplicate handling</span><select id="bulkDuplicateMode"><option value="update">Update existing product</option><option value="skip">Skip existing product</option><option value="duplicate">Create duplicate product</option></select></label>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="btn btn-primary" data-bulk-upload>Upload &amp; Preview</button>
          <span id="bulkStatus" class="inline-message" style="display:inline-block;">No file selected.</span>
        </div>
        <div id="bulkPreview" style="margin-top:20px;"></div>
      </section>`;
  }

  function templateCsv() {
    const headers = FIELDS.map(function (f) { return f[1]; });
    const example = ["ELEC-001", "", "Example Electrical Item", "Electricals", "", "pcs", "100", "150", "16", "5", "0", "", "MAIN", "Replace this example row", ""];
    const csv = [headers, example].map(function (row) { return row.map(function (v) { const s = String(v == null ? "" : v); return /[\",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "UniquePOS_Product_Import_Template.csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  async function upload() {
    const input = document.getElementById("bulkFileInput");
    const status = document.getElementById("bulkStatus");
    const preview = document.getElementById("bulkPreview");
    const file = input && input.files && input.files[0];
    if (!file) { status.textContent = "Select a CSV, Excel or PDF file first."; return; }
    status.textContent = "Uploading and analysing file…";
    preview.innerHTML = "";
    const form = new FormData(); form.append("file", file); form.append("file_name", file.name);
    try {
      const result = await api("/api/products/imports/upload-and-parse", { method: "POST", body: form });
      window.__uniqueBulkImportJob = result.job && result.job.id;
      status.textContent = "Preview ready: " + (result.preview || []).length + " rows shown. Review before importing.";
      renderPreview(result);
    } catch (error) { status.textContent = error.message; }
  }

  function renderPreview(result) {
    const root = document.getElementById("bulkPreview"); if (!root) return;
    const rows = result.preview || [];
    const headers = result.headers || [];
    const mapping = result.mapping || {};
    const mapped = FIELDS.filter(function (f) { return mapping[f[0]]; }).map(function (f) { return f[1]; });
    const invalid = rows.filter(function (r) { return (r.validation_errors || []).length; }).length;
    root.innerHTML = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px;">
        <strong>Rows: ${escapeHtml(result.job && result.job.total_rows)}</strong>
        <span>Valid: ${escapeHtml(result.job && result.job.valid_rows)}</span>
        <span>Errors: ${escapeHtml(result.job && result.job.invalid_rows)}</span>
        <span>Mapped fields: ${escapeHtml(mapped.length)}/${FIELDS.length}</span>
      </div>
      ${invalid ? `<div class="inline-message" style="margin-bottom:12px;">${invalid} visible rows contain validation errors. Correct the source file and upload again before importing.</div>` : ""}
      <div style="overflow:auto;border:1px solid #e2e8f0;border-radius:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr><th style="padding:10px;text-align:left;">Row</th>${headers.map(function (h) { return `<th style="padding:10px;text-align:left;white-space:nowrap;">${escapeHtml(h)}</th>`; }).join("")}<th style="padding:10px;text-align:left;">Status</th></tr></thead>
        <tbody>${rows.slice(0, 100).map(function (row) {
          const raw = row.raw_data || {}; const errs = row.validation_errors || [];
          return `<tr><td style="padding:8px;">${escapeHtml(row.row_number)}</td>${headers.map(function (h) { return `<td style="padding:8px;white-space:nowrap;">${escapeHtml(raw[h])}</td>`; }).join("")}<td style="padding:8px;">${errs.length ? escapeHtml(errs.join(" ")) : escapeHtml(row.action || "create")}</td></tr>`;
        }).join("")}</tbody></table>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" data-bulk-start ${invalid ? "disabled" : ""}>Import ${escapeHtml(result.job && result.job.total_rows)} products</button>
        <span id="bulkProgress"></span>
      </div>`;
  }

  async function startImport() {
    const id = window.__uniqueBulkImportJob;
    if (!id) return;
    const mode = document.getElementById("bulkDuplicateMode");
    const progress = document.getElementById("bulkProgress");
    progress.textContent = "Starting import…";
    try {
      await api("/api/products/imports/" + encodeURIComponent(id) + "/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on_duplicate: mode ? mode.value : "update", auto_create_references: true }) });
      await poll(id);
    } catch (error) { progress.textContent = error.message; }
  }

  async function poll(id) {
    const progress = document.getElementById("bulkProgress");
    try {
      const result = await api("/api/products/imports/" + encodeURIComponent(id));
      const job = result.job || {};
      progress.textContent = (job.status || "processing") + " — " + (job.processed_rows || 0) + "/" + (job.total_rows || 0) + " processed; created " + (job.created_count || 0) + ", updated " + (job.updated_count || 0) + ".";
      if (["completed", "failed"].includes(job.status)) {
        if (job.status === "completed") progress.textContent += " Import completed successfully.";
        else progress.textContent += " " + (job.last_error || "Import failed.");
        return;
      }
      setTimeout(function () { poll(id); }, 1000);
    } catch (error) { progress.textContent = error.message; }
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-bulk-template]")) return templateCsv();
    if (event.target.closest("[data-bulk-upload]")) return upload();
    if (event.target.closest("[data-bulk-start]")) return startImport();
    const action = event.target.closest("[data-action]");
    if (action && action.getAttribute("data-action") === "bulk-import") { location.hash = "bulk-import"; }
  });

  window.addEventListener("hashchange", function () { window.setTimeout(render, 20); });
  new MutationObserver(function () { if (isBulkRoute()) window.setTimeout(render, 0); }).observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(render, 100);
})();
