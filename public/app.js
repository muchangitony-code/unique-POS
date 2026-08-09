(function () {
  const TOKEN_STORAGE_KEY = "uniquepos.token";
  const USER_STORAGE_KEY = "uniquepos.user";
  const MODULE_TITLES = {
    dashboard: "Dashboard",
    products: "Products",
    inventory: "Inventory",
    sales: "Sales",
    customers: "Customers",
    suppliers: "Suppliers",
    purchases: "Purchases",
    expenses: "Expenses",
    reports: "Reports",
    users: "Users",
    settings: "Settings",
    branches: "Branches"
  };
  const MODULE_SUBTITLES = {
    dashboard: "Operational overview and live business activity.",
    products: "Manage products, categories, brands, and pricing.",
    inventory: "Track stock, adjustments, and branch transfers.",
    sales: "Run POS sales and manage quotations and invoices.",
    customers: "Maintain customer accounts and relationships.",
    suppliers: "Maintain supplier master data.",
    purchases: "Create purchase orders and receive stock.",
    expenses: "Record and track operational spending.",
    reports: "Review sales, profitability, stock value, and branch performance.",
    users: "Manage staff accounts and access roles.",
    settings: "Configure business, payment, branding, and security settings.",
    branches: "Manage business branches and operating locations."
  };
  const ROLES = ["super_admin", "business_owner", "branch_manager", "cashier", "storekeeper", "accountant", "sales_rep", "technician"];
  const PAYMENT_METHODS = ["cash", "mpesa", "bank_transfer", "card", "credit", "split"];
  const EXPENSE_METHODS = ["cash", "mpesa", "bank_transfer", "card"];
  const SALES_STATUSES = ["draft", "sent", "partial", "paid", "cancelled"];
  const PURCHASE_STATUSES = ["draft", "ordered", "received", "partial", "cancelled"];
  const FLASH_KEYS = Object.keys(MODULE_TITLES);

  const state = {
    token: readStoredToken(),
    user: readStoredUser(),
    currency: "KES",
    activeModule: "dashboard",
    dashboardStats: null,
    moduleData: {},
    flashes: Object.fromEntries(FLASH_KEYS.map(function (key) { return [key, null]; })),
    branding: {},
    ui: {
      productEdit: null,
      categoryEdit: null,
      brandEdit: null,
      customerEdit: null,
      supplierEdit: null,
      userEdit: null,
      branchEdit: null,
      expenseEdit: null,
      salesComposer: { type: "sale", rows: 1 },
      purchaseComposerRows: 1,
      salesTab: "sales",
      reportsRange: defaultDateRange()
    }
  };

  const login = {
    shell: document.getElementById("loginShell"),
    apiStatus: document.getElementById("apiStatus"),
    brandName: document.getElementById("brandName"),
    brandLogo: document.getElementById("loginBrandLogo"),
    brandSummary: document.getElementById("brandSummary"),
    form: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    totpWrap: document.getElementById("totpWrap"),
    totp: document.getElementById("totp"),
    submitBtn: document.getElementById("submitBtn"),
    message: document.getElementById("message")
  };

  const pos = {
    shell: document.getElementById("posShell"),
    navBrand: document.getElementById("posNavBrand"),
    navLogo: document.getElementById("posNavLogo"),
    navUser: document.getElementById("posNavUser"),
    moduleTitle: document.getElementById("posModuleTitle"),
    moduleSubtitle: document.getElementById("posHeaderSubtitle"),
    signOutBtn: document.getElementById("posSignOutBtn"),
    menuToggle: document.getElementById("posMenuToggle"),
    nav: document.getElementById("posNav"),
    statTodaySales: document.getElementById("statTodaySalesVal"),
    statMonthlySales: document.getElementById("statMonthlySalesVal"),
    statGrossProfit: document.getElementById("statGrossProfitVal"),
    statLowStock: document.getElementById("statLowStockVal")
  };

  const MODULE_HANDLERS = {
    dashboard: { load: loadDashboard, render: renderDashboard },
    products: { load: loadProducts, render: renderProducts },
    inventory: { load: loadInventory, render: renderInventory },
    sales: { load: loadSales, render: renderSales },
    customers: { load: loadCustomers, render: renderCustomers },
    suppliers: { load: loadSuppliers, render: renderSuppliers },
    purchases: { load: loadPurchases, render: renderPurchases },
    expenses: { load: loadExpenses, render: renderExpenses },
    reports: { load: loadReports, render: renderReports },
    users: { load: loadUsers, render: renderUsers },
    settings: { load: loadSettings, render: renderSettings },
    branches: { load: loadBranches, render: renderBranches }
  };

  boot();

  async function boot() {
    bindLoginEvents();
    bindPosEvents();
    const hadStoredToken = Boolean(state.token);
    await Promise.all([loadHealth(), loadBranding()]);
    await syncSessionFromToken();
    await routeAfterAuthChange({ showExpiredMessage: hadStoredToken });
  }

  function bindLoginEvents() {
    login.form.addEventListener("submit", onLogin);
  }

  function bindPosEvents() {
    pos.signOutBtn.addEventListener("click", signOut);
    pos.menuToggle.addEventListener("click", function () {
      pos.nav.classList.toggle("open");
    });
    document.addEventListener("click", function (event) {
      if (pos.nav.classList.contains("open") && !pos.nav.contains(event.target) && event.target !== pos.menuToggle) {
        pos.nav.classList.remove("open");
      }
    });
    document.querySelectorAll(".pos-nav__item[data-module]").forEach(function (button) {
      button.addEventListener("click", function () {
        switchModule(button.dataset.module);
        pos.nav.classList.remove("open");
      });
    });
  }

  async function loadHealth() {
    try {
      const res = await fetch("/api/healthz");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        login.apiStatus.textContent = "Service is online.";
        login.apiStatus.style.borderColor = "rgba(34, 197, 94, 0.4)";
      } else {
        throw new Error("Unexpected health response");
      }
    } catch (_error) {
      login.apiStatus.textContent = "Service is not responding yet. Confirm Railway variables and database setup.";
      login.apiStatus.style.borderColor = "rgba(248, 113, 113, 0.35)";
    }
  }

  async function loadBranding() {
    try {
      const branding = await apiJson("/api/settings/branding", { skipAuthRedirect: true, raw: false, noAuth: true });
      state.branding = branding || {};
      const brandName = firstText(branding.business_name, branding.businessName, "UniquePOS");
      const summary = firstText(branding.tagline, branding.description, "Sign in to access your POS workspace, or confirm the service is online before finishing setup.");
      const logoUrl = firstText(branding.logo_url, branding.logoUrl, "");
      document.title = brandName;
      login.brandName.textContent = brandName;
      login.brandSummary.textContent = summary;
      pos.navBrand.textContent = brandName;
      applyBrandLogo(login.brandLogo, logoUrl);
      applyBrandLogo(pos.navLogo, logoUrl);
    } catch (_error) {}
  }

  function applyBrandLogo(node, logoUrl) {
    if (!node) return;
    if (!logoUrl) {
      node.classList.add("hidden");
      node.removeAttribute("src");
      return;
    }
    node.src = logoUrl;
    node.classList.remove("hidden");
  }

  async function onLogin(event) {
    event.preventDefault();
    setMessage("", "");
    login.submitBtn.disabled = true;
    login.submitBtn.textContent = "Signing in…";

    const payload = {
      email: login.email.value.trim(),
      password: login.password.value
    };
    if (!payload.email || !payload.password) {
      setMessage("error", "Username/email and password are required.");
      resetSubmit();
      return;
    }
    if (!login.totpWrap.classList.contains("hidden")) {
      payload.totp_code = login.totp.value.trim();
    }

    try {
      const data = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
        noAuth: true,
        skipAuthRedirect: true
      });
      if (data.two_factor_required) {
        login.totpWrap.classList.remove("hidden");
        setMessage("success", "Enter your authentication code to finish signing in.");
        resetSubmit("Verify code");
        return;
      }
      if (!data.token || !data.user) {
        throw new Error("Login succeeded but no session token was returned.");
      }
      persistSession(data.token, data.user);
      login.form.reset();
      login.totpWrap.classList.add("hidden");
      setMessage("", "");
      await routeAfterAuthChange();
    } catch (error) {
      setMessage("error", error.message || "Unable to sign in.");
    } finally {
      resetSubmit();
    }
  }

  async function signOut() {
    try {
      if (state.token) {
        await authorizedFetch("/api/auth/logout", { method: "POST" });
      }
    } catch (_error) {}
    clearSession();
    state.moduleData = {};
    state.dashboardStats = null;
    login.form.reset();
    login.totpWrap.classList.add("hidden");
    showLoginRoute();
    setMessage("success", "Signed out.");
  }

  async function routeAfterAuthChange(options) {
    const showExpiredMessage = options && options.showExpiredMessage;
    const isAuthenticated = Boolean(state.token && state.user);
    if (!isAuthenticated) {
      showLoginRoute();
      if (showExpiredMessage) {
        setMessage("error", "Your session has expired. Please sign in again.");
      }
      return;
    }
    await refreshCurrency();
    showPosRoute();
    await switchModule("dashboard");
  }

  function showLoginRoute() {
    pos.shell.classList.add("hidden");
    login.shell.classList.remove("hidden");
  }

  function showPosRoute() {
    login.shell.classList.add("hidden");
    pos.shell.classList.remove("hidden");
    renderPosUser();
  }

  async function switchModule(name) {
    if (!MODULE_HANDLERS[name]) return;
    state.activeModule = name;
    pos.moduleTitle.textContent = MODULE_TITLES[name];
    pos.moduleSubtitle.textContent = MODULE_SUBTITLES[name] || "";
    document.querySelectorAll(".pos-nav__item[data-module]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.module === name);
    });
    document.querySelectorAll(".pos-module").forEach(function (section) {
      section.classList.toggle("active", section.id === "mod-" + name);
    });
    showModuleLoading(name);
    try {
      await MODULE_HANDLERS[name].load();
      MODULE_HANDLERS[name].render();
      if (name === "dashboard") renderDashboardStats();
    } catch (error) {
      renderModuleError(name, error.message || "Unable to load module.");
    }
  }

  function showModuleLoading(name) {
    const body = moduleBody(name);
    if (!body) return;
    body.innerHTML = '<div class="module-loading">Loading…</div>';
  }

  function renderModuleError(name, message) {
    const body = moduleBody(name);
    if (!body) return;
    body.innerHTML = '<div class="card"><div class="message error">' + escapeHtml(message) + '</div></div>';
  }

  async function loadDashboard() {
    const results = await Promise.all([
      apiJson("/api/dashboard/stats"),
      apiJson("/api/dashboard/recent-transactions"),
      apiJson("/api/dashboard/top-products"),
      apiJson("/api/dashboard/sales-chart")
    ]);
    state.dashboardStats = results[0];
    state.moduleData.dashboard = {
      stats: results[0],
      recentTransactions: normalizeList(results[1]),
      topProducts: normalizeList(results[2]),
      salesChart: normalizeList(results[3])
    };
  }

  function renderDashboard() {
    const body = moduleBody("dashboard");
    const data = state.moduleData.dashboard || {};
    body.innerHTML = [
      renderFlash("dashboard"),
      '<div class="module-grid two">',
      renderTableCard("Recent transactions", ["Reference", "Customer", "Total", "Status", "Date"], (data.recentTransactions || []).map(function (item) {
        return [
          escapeHtml(firstText(item.receipt_number, item.invoice_number, item.reference, "—")),
          escapeHtml(firstText(item.customer_name, item.customer, "Walk-in")),
          money(item.total),
          renderBadge(firstText(item.status, "completed")),
          escapeHtml(formatDateTime(item.created_at))
        ];
      }), "No transactions yet."),
      renderTableCard("Top products", ["Product", "Units", "Revenue"], (data.topProducts || []).map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, item.name, "Unknown")),
          escapeHtml(String(Number(item.quantity || item.units || 0))),
          money(item.total || item.revenue || 0)
        ];
      }), "No top-selling products yet."),
      '</div>',
      '<div class="module-grid two">',
      renderTableCard("Daily sales trend", ["Date", "Sales", "Transactions"], (data.salesChart || []).map(function (item) {
        return [escapeHtml(formatDate(item.date)), money(item.total || 0), escapeHtml(String(Number(item.count || 0)))];
      }), "No chart data available."),
      '<section class="card"><div class="section-head"><h3>Session details</h3></div><dl class="details-grid">' +
        '<div><dt>User</dt><dd>' + escapeHtml(firstText(state.user && state.user.name, "—")) + '</dd></div>' +
        '<div><dt>Role</dt><dd>' + escapeHtml(firstText(state.user && state.user.role, "—")) + '</dd></div>' +
        '<div><dt>Branch</dt><dd>' + escapeHtml(firstText(state.user && state.user.branch, state.user && state.user.branch_id, "—")) + '</dd></div>' +
        '<div><dt>Status</dt><dd>' + renderBadge(state.user && state.user.is_active ? "active" : "inactive") + '</dd></div>' +
        '</dl></section>',
      '</div>'
    ].join("");
  }

  async function loadProducts() {
    const results = await Promise.all([
      apiJson("/api/products?limit=100"),
      apiJson("/api/categories"),
      apiJson("/api/brands"),
      apiJson("/api/suppliers?limit=100"),
      apiJson("/api/branches/options")
    ]);
    state.moduleData.products = {
      products: normalizeList(results[0]),
      categories: normalizeList(results[1]),
      brands: normalizeList(results[2]),
      suppliers: normalizeList(results[3]),
      branches: normalizeList(results[4])
    };
  }

  function renderProducts() {
    const body = moduleBody("products");
    const data = state.moduleData.products || {};
    const edit = state.ui.productEdit || {};
    const categoryEdit = state.ui.categoryEdit || {};
    const brandEdit = state.ui.brandEdit || {};
    body.innerHTML = [
      renderFlash("products"),
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>' + (edit.id ? "Edit product" : "New product") + '</h3></div>' +
        '<form id="productForm" class="form-grid two">' +
          hiddenInput("id", edit.id) +
          textField("Product code", "product_code", edit.product_code, true) +
          textField("Product name", "product_name", edit.product_name, true) +
          textField("Barcode", "barcode", edit.barcode) +
          textField("Unit", "unit", edit.unit, false, "pcs") +
          textAreaField("Description", "description", edit.description) +
          selectField("Category", "category_id", data.categories, edit.category_id) +
          selectField("Brand", "brand_id", data.brands, edit.brand_id) +
          selectField("Supplier", "supplier_id", data.suppliers, edit.supplier_id) +
          numberField("Cost price", "cost_price", edit.cost_price, "0.01") +
          numberField("Selling price", "selling_price", edit.selling_price, "0.01") +
          numberField("VAT rate", "vat_rate", valueOrDefault(edit.vat_rate, 16), "0.01") +
          numberField("Opening stock", "current_stock", valueOrDefault(edit.current_stock, 0), "1") +
          numberField("Minimum stock", "min_stock", valueOrDefault(edit.min_stock, 0), "1") +
          '<div class="form-actions span-2"><button type="submit">' + (edit.id ? "Update product" : "Create product") + '</button><button type="button" class="secondary" id="productResetBtn">Clear</button></div>' +
        '</form></section>',
      '<section class="card"><div class="section-head"><h3>Reference data</h3></div>' +
        '<div class="stack gap-lg">' +
          '<div><h4>Categories</h4><form id="categoryForm" class="inline-form">' + hiddenInput("category_id", categoryEdit.id) + '<input name="name" placeholder="Category name" value="' + escapeAttr(categoryEdit.name) + '" required /><button type="submit">' + (categoryEdit.id ? "Update" : "Add") + '</button><button type="button" class="secondary" id="categoryResetBtn">Clear</button></form>' + renderSimpleList(data.categories, "category") + '</div>' +
          '<div><h4>Brands</h4><form id="brandForm" class="inline-form">' + hiddenInput("brand_id", brandEdit.id) + '<input name="name" placeholder="Brand name" value="' + escapeAttr(brandEdit.name) + '" required /><button type="submit">' + (brandEdit.id ? "Update" : "Add") + '</button><button type="button" class="secondary" id="brandResetBtn">Clear</button></form>' + renderSimpleList(data.brands, "brand") + '</div>' +
        '</div></section>',
      '</div>',
      renderTableCard("Product catalogue", ["Code", "Name", "Category", "Brand", "Stock", "Price", "Actions"], (data.products || []).map(function (product) {
        return [
          escapeHtml(firstText(product.product_code, "—")),
          escapeHtml(firstText(product.product_name, "—")),
          escapeHtml(firstText(product.category_name, "—")),
          escapeHtml(firstText(product.brand_name, "—")),
          escapeHtml(String(Number(product.current_stock || 0))) + ' / min ' + escapeHtml(String(Number(product.min_stock || 0))),
          money(product.selling_price),
          actionButtons([
            { cls: "js-edit-product", label: "Edit", id: product.id },
            { cls: "js-delete-product", label: "Delete", id: product.id, tone: "danger" },
            !product.barcode ? { cls: "js-barcode-product", label: "Barcode", id: product.id, tone: "secondary" } : null
          ])
        ];
      }), "No products available.")
    ].join("");

    bindForm("productForm", handleProductSave);
    bindClick("productResetBtn", function () { state.ui.productEdit = null; renderProducts(); });
    bindForm("categoryForm", handleCategorySave);
    bindClick("categoryResetBtn", function () { state.ui.categoryEdit = null; renderProducts(); });
    bindForm("brandForm", handleBrandSave);
    bindClick("brandResetBtn", function () { state.ui.brandEdit = null; renderProducts(); });
    bindRowActions(body, {
      ".js-edit-product": function (event) {
        const item = findById(data.products, event.currentTarget.dataset.id);
        state.ui.productEdit = item || null;
        renderProducts();
      },
      ".js-delete-product": function (event) {
        deleteProduct(event.currentTarget.dataset.id);
      },
      ".js-barcode-product": function (event) {
        generateBarcode(event.currentTarget.dataset.id);
      },
      ".js-edit-category": function (event) {
        state.ui.categoryEdit = findById(data.categories, event.currentTarget.dataset.id) || null;
        renderProducts();
      },
      ".js-delete-category": function (event) {
        deleteReference("category", event.currentTarget.dataset.id);
      },
      ".js-edit-brand": function (event) {
        state.ui.brandEdit = findById(data.brands, event.currentTarget.dataset.id) || null;
        renderProducts();
      },
      ".js-delete-brand": function (event) {
        deleteReference("brand", event.currentTarget.dataset.id);
      }
    });
  }

  async function handleProductSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = trimmed(form, "id");
    const payload = compactObject({
      product_code: trimmed(form, "product_code"),
      product_name: trimmed(form, "product_name"),
      barcode: optionalString(form, "barcode"),
      unit: optionalString(form, "unit"),
      description: optionalString(form, "description"),
      category_id: optionalNumber(form, "category_id"),
      brand_id: optionalNumber(form, "brand_id"),
      supplier_id: optionalNumber(form, "supplier_id"),
      cost_price: optionalNumber(form, "cost_price"),
      selling_price: optionalNumber(form, "selling_price"),
      vat_rate: optionalNumber(form, "vat_rate"),
      current_stock: numberOrZero(form, "current_stock"),
      min_stock: numberOrZero(form, "min_stock")
    });
    await apiJson(id ? "/api/products/" + id : "/api/products", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    state.ui.productEdit = null;
    setFlash("products", "success", id ? "Product updated." : "Product created.");
    await loadProducts();
    renderProducts();
  }

  async function handleCategorySave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = trimmed(form, "category_id");
    await apiJson(id ? "/api/categories/" + id : "/api/categories", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({ name: trimmed(form, "name") })
    });
    state.ui.categoryEdit = null;
    setFlash("products", "success", id ? "Category updated." : "Category created.");
    await loadProducts();
    renderProducts();
  }

  async function handleBrandSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = trimmed(form, "brand_id");
    await apiJson(id ? "/api/brands/" + id : "/api/brands", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({ name: trimmed(form, "name") })
    });
    state.ui.brandEdit = null;
    setFlash("products", "success", id ? "Brand updated." : "Brand created.");
    await loadProducts();
    renderProducts();
  }

  async function deleteProduct(id) {
    if (!window.confirm("Delete this product?")) return;
    await apiJson("/api/products/" + id, { method: "DELETE" });
    setFlash("products", "success", "Product deleted.");
    await loadProducts();
    renderProducts();
  }

  async function generateBarcode(id) {
    await apiJson("/api/products/generate-barcodes", {
      method: "PATCH",
      body: JSON.stringify({ product_ids: [Number(id)] })
    });
    setFlash("products", "success", "Barcode generated.");
    await loadProducts();
    renderProducts();
  }

  async function deleteReference(kind, id) {
    if (!window.confirm("Delete this " + kind + "?")) return;
    var path = kind === "category" ? "categories" : kind + "s";
    await apiJson("/api/" + path + "/" + id, { method: "DELETE" });
    setFlash("products", "success", titleize(kind) + " deleted.");
    await loadProducts();
    renderProducts();
  }

  async function loadInventory() {
    const results = await Promise.all([
      apiJson("/api/inventory/stock-count"),
      apiJson("/api/inventory/movements?limit=25"),
      apiJson("/api/inventory/transfers?limit=25"),
      apiJson("/api/products?limit=100"),
      apiJson("/api/branches/options")
    ]);
    state.moduleData.inventory = {
      stock: normalizeList(results[0]),
      movements: normalizeList(results[1]),
      transfers: normalizeList(results[2]),
      products: normalizeList(results[3]),
      branches: normalizeList(results[4])
    };
  }

  function renderInventory() {
    const body = moduleBody("inventory");
    const data = state.moduleData.inventory || {};
    body.innerHTML = [
      renderFlash("inventory"),
      '<div class="module-grid three">',
      '<section class="card"><div class="section-head"><h3>Receive stock</h3></div><form id="receiveForm" class="form-grid">' +
        productSelectField(data.products, null) +
        numberField("Quantity", "quantity", 1, "1") +
        textField("Reference", "reference", "") +
        textAreaField("Notes", "notes", "") +
        '<div class="form-actions"><button type="submit">Receive</button></div></form></section>',
      '<section class="card"><div class="section-head"><h3>Adjust stock</h3></div><form id="adjustForm" class="form-grid">' +
        productSelectField(data.products, null) +
        numberField("Adjustment (+/-)", "quantity", 0, "1") +
        textField("Reason", "reason", "") +
        textAreaField("Notes", "notes", "") +
        '<div class="form-actions"><button type="submit">Adjust</button></div></form></section>',
      '<section class="card"><div class="section-head"><h3>Transfer stock</h3></div><form id="transferForm" class="form-grid">' +
        (isSuperAdmin() ? selectField("Source branch", "source_branch_id", data.branches, null) : "") +
        selectField("Destination branch", "destination_branch_id", data.branches, null) +
        productSelectField(data.products, null) +
        numberField("Quantity", "quantity", 1, "1") +
        textField("Transfer date", "transfer_date", todayIso(), false, "", "date") +
        textAreaField("Notes", "notes", "") +
        '<div class="form-actions"><button type="submit">Create transfer</button></div></form></section>',
      '</div>',
      '<div class="module-grid two">',
      renderTableCard("Stock position", ["Code", "Product", "Category", "Current", "Minimum", "Status"], (data.stock || []).map(function (item) {
        return [
          escapeHtml(firstText(item.product_code, "—")),
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(firstText(item.category_name, "—")),
          escapeHtml(String(Number(item.current_stock || 0))),
          escapeHtml(String(Number(item.min_stock || 0))),
          renderBadge(firstText(item.status, Number(item.current_stock || 0) <= Number(item.min_stock || 0) ? "low" : "ok"))
        ];
      }), "No stock records available."),
      renderTableCard("Recent movements", ["Product", "Type", "Qty", "Before", "After", "Reference", "Date"], (data.movements || []).map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          renderBadge(firstText(item.type, "movement")),
          escapeHtml(String(Number(item.quantity || 0))),
          escapeHtml(String(Number(item.quantity_before || 0))),
          escapeHtml(String(Number(item.quantity_after || 0))),
          escapeHtml(firstText(item.reference, "—")),
          escapeHtml(formatDateTime(item.created_at))
        ];
      }), "No stock movements yet."),
      '</div>',
      renderTableCard("Transfers", ["Reference", "Product", "Qty", "Source", "Destination", "Status", "Actions"], (data.transfers || []).map(function (item) {
        return [
          escapeHtml(firstText(item.transfer_number, "—")),
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(String(Number(item.quantity || 0))),
          escapeHtml(firstText(item.source_branch_name, item.source_branch, "—")),
          escapeHtml(firstText(item.destination_branch_name, item.destination_branch, "—")),
          renderBadge(firstText(item.status, "pending")),
          actionButtons([
            item.status === "pending" ? { cls: "js-approve-transfer", label: "Approve", id: item.id } : null,
            item.status === "pending" ? { cls: "js-reject-transfer", label: "Reject", id: item.id, tone: "danger" } : null,
            { cls: "js-print-transfer", label: "Print", id: item.id, tone: "secondary" },
            { cls: "js-pdf-transfer", label: "PDF", id: item.id, tone: "secondary" }
          ])
        ];
      }), "No transfers yet.")
    ].join("");

    bindForm("receiveForm", handleReceiveStock);
    bindForm("adjustForm", handleAdjustStock);
    bindForm("transferForm", handleTransferStock);
    bindRowActions(body, {
      ".js-approve-transfer": function (event) { actOnTransfer(event.currentTarget.dataset.id, "approve"); },
      ".js-reject-transfer": function (event) { actOnTransfer(event.currentTarget.dataset.id, "reject"); },
      ".js-print-transfer": function (event) { openDocumentPrint("stock_transfer_note", event.currentTarget.dataset.id, "a4"); },
      ".js-pdf-transfer": function (event) { openDocumentPdf("stock_transfer_note", event.currentTarget.dataset.id); }
    });
  }

  async function handleReceiveStock(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await apiJson("/api/inventory/receive", {
      method: "POST",
      body: JSON.stringify(compactObject({
        product_id: requiredNumber(form, "product_id"),
        quantity: requiredNumber(form, "quantity"),
        reference: optionalString(form, "reference"),
        notes: optionalString(form, "notes")
      }))
    });
    setFlash("inventory", "success", "Stock received.");
    await loadInventory();
    renderInventory();
  }

  async function handleAdjustStock(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await apiJson("/api/inventory/adjust", {
      method: "POST",
      body: JSON.stringify(compactObject({
        product_id: requiredNumber(form, "product_id"),
        quantity: numberOrZero(form, "quantity"),
        reason: optionalString(form, "reason"),
        notes: optionalString(form, "notes")
      }))
    });
    setFlash("inventory", "success", "Stock adjusted.");
    await loadInventory();
    renderInventory();
  }

  async function handleTransferStock(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await apiJson("/api/inventory/transfers", {
      method: "POST",
      body: JSON.stringify(compactObject({
        source_branch_id: optionalNumber(form, "source_branch_id"),
        destination_branch_id: requiredNumber(form, "destination_branch_id"),
        product_id: requiredNumber(form, "product_id"),
        quantity: requiredNumber(form, "quantity"),
        transfer_date: optionalString(form, "transfer_date"),
        notes: optionalString(form, "notes")
      }))
    });
    setFlash("inventory", "success", "Transfer created.");
    await loadInventory();
    renderInventory();
  }

  async function actOnTransfer(id, action) {
    const body = action === "reject" ? { reason: window.prompt("Reason for rejection (optional)", "") || "" } : {};
    await apiJson("/api/inventory/transfers/" + id + "/" + action, {
      method: "POST",
      body: JSON.stringify(body)
    });
    setFlash("inventory", "success", "Transfer " + (action === "approve" ? "approved" : "rejected") + ".");
    await loadInventory();
    renderInventory();
  }

  async function loadSales() {
    const results = await Promise.all([
      apiJson("/api/pos/sales?limit=25"),
      apiJson("/api/products?limit=100"),
      apiJson("/api/customers?limit=100"),
      apiJson("/api/quotations?limit=25"),
      apiJson("/api/invoices?limit=25")
    ]);
    state.moduleData.sales = {
      sales: normalizeList(results[0]),
      products: normalizeList(results[1]),
      customers: normalizeList(results[2]),
      quotations: normalizeList(results[3]),
      invoices: normalizeList(results[4])
    };
  }

  function renderSales() {
    const body = moduleBody("sales");
    const data = state.moduleData.sales || {};
    const composer = state.ui.salesComposer;
    body.innerHTML = [
      renderFlash("sales"),
      '<section class="card"><div class="section-head"><h3>Document composer</h3></div>' +
        '<form id="salesComposerForm" class="form-grid two">' +
          '<label><span>Document type</span><select name="document_type" id="salesDocumentType">' + optionTags([{"id":"sale","name":"POS sale"},{"id":"quotation","name":"Quotation"},{"id":"invoice","name":"Invoice"}], composer.type, false, "id", "name") + '</select></label>' +
          selectField("Customer", "customer_id", data.customers, null) +
          numberField("Discount amount", "discount_amount", 0, "0.01") +
          (composer.type === "sale" ? numberField("Amount paid", "amount_paid", 0, "0.01") + selectFieldFromValues("Payment method", "payment_method", PAYMENT_METHODS, "cash") : "") +
          (composer.type === "quotation" ? textField("Valid until", "valid_until", todayIso(), false, "", "date") + textField("Delivery time", "delivery_time", "") + textField("Warranty", "warranty", "") + textField("Payment terms", "payment_terms", "") : "") +
          (composer.type === "invoice" ? textField("Due date", "due_date", todayIso(), false, "", "date") + selectFieldFromValues("Status", "status", ["draft", "sent"], "sent") : "") +
          textAreaField("Notes", "notes", "") +
          '<div class="span-2"><div class="line-items-head"><h4>Items</h4><button type="button" class="secondary" id="salesAddRowBtn">Add line</button></div>' + renderComposerRows("sales", composer.rows, data.products) + '</div>' +
          '<div class="form-actions span-2"><button type="submit">Create ' + escapeHtml(labelForDocument(composer.type)) + '</button></div>' +
        '</form></section>',
      '<div class="subnav">' +
        subnavButton("sales", "sales", "POS history") +
        subnavButton("sales", "quotations", "Quotations") +
        subnavButton("sales", "invoices", "Invoices") +
      '</div>',
      renderSalesTab(data)
    ].join("");

    bindForm("salesComposerForm", handleSalesComposer);
    bindClick("salesAddRowBtn", function () {
      state.ui.salesComposer.rows += 1;
      renderSales();
    });
    const documentType = document.getElementById("salesDocumentType");
    if (documentType) {
      documentType.addEventListener("change", function () {
        state.ui.salesComposer.type = documentType.value;
        renderSales();
      });
    }
    bindRowActions(body, {
      ".js-sales-tab": function (event) {
        state.ui.salesTab = event.currentTarget.dataset.tab;
        renderSales();
      },
      ".js-delete-quotation": function (event) {
        deleteQuotation(event.currentTarget.dataset.id);
      },
      ".js-convert-quotation": function (event) {
        convertQuotation(event.currentTarget.dataset.id);
      },
      ".js-send-quotation": function (event) {
        updateQuotation(event.currentTarget.dataset.id, { status: "sent" });
      },
      ".js-pay-invoice": function (event) {
        payInvoice(event.currentTarget.dataset.id);
      },
      ".js-update-invoice-status": function (event) {
        updateInvoiceStatus(event.currentTarget.dataset.id);
      },
      ".js-print-quotation": function (event) {
        openDocumentPrint("quotation", event.currentTarget.dataset.id, "a4");
      },
      ".js-pdf-quotation": function (event) {
        openDocumentPdf("quotation", event.currentTarget.dataset.id);
      },
      ".js-email-quotation": function (event) {
        emailDocument("quotation", event.currentTarget.dataset.id);
      },
      ".js-whatsapp-quotation": function (event) {
        shareDocumentWhatsapp("quotation", event.currentTarget.dataset.id);
      },
      ".js-print-invoice": function (event) {
        openDocumentPrint("invoice", event.currentTarget.dataset.id, "a4");
      },
      ".js-print-receipt": function (event) {
        const paper = window.prompt("Paper size: 58mm, 80mm or a4", "80mm");
        openDocumentPrint("receipt", event.currentTarget.dataset.id, paper || "80mm");
      },
      ".js-pdf-invoice": function (event) {
        openDocumentPdf("invoice", event.currentTarget.dataset.id);
      },
      ".js-pdf-receipt": function (event) {
        openDocumentPdf("receipt", event.currentTarget.dataset.id);
      },
      ".js-email-invoice": function (event) {
        emailDocument("invoice", event.currentTarget.dataset.id);
      },
      ".js-email-receipt": function (event) {
        emailDocument("receipt", event.currentTarget.dataset.id);
      },
      ".js-whatsapp-invoice": function (event) {
        shareDocumentWhatsapp("invoice", event.currentTarget.dataset.id);
      },
      ".js-whatsapp-receipt": function (event) {
        shareDocumentWhatsapp("receipt", event.currentTarget.dataset.id);
      },
      ".js-remove-sales-row": function () {
        state.ui.salesComposer.rows = Math.max(1, state.ui.salesComposer.rows - 1);
        renderSales();
      }
    });
  }

  function renderSalesTab(data) {
    if (state.ui.salesTab === "quotations") {
      return renderTableCard("Quotations", ["Number", "Customer", "Total", "Status", "Valid until", "Actions"], (data.quotations || []).map(function (item) {
        return [
          escapeHtml(firstText(item.quotation_number, "—")),
          escapeHtml(firstText(item.customer_name, "Walk-in")),
          money(item.total),
          renderBadge(firstText(item.status, "draft")),
          escapeHtml(formatDate(item.valid_until)),
          actionButtons([
            item.status === "draft" ? { cls: "js-send-quotation", label: "Send", id: item.id } : null,
            item.status !== "converted" ? { cls: "js-convert-quotation", label: "Convert", id: item.id } : null,
            { cls: "js-print-quotation", label: "Print", id: item.id, tone: "secondary" },
            { cls: "js-pdf-quotation", label: "PDF", id: item.id, tone: "secondary" },
            { cls: "js-whatsapp-quotation", label: "WhatsApp", id: item.id, tone: "secondary" },
            { cls: "js-email-quotation", label: "Email", id: item.id, tone: "secondary" },
            { cls: "js-delete-quotation", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }), "No quotations yet.");
    }
    if (state.ui.salesTab === "invoices") {
      return renderTableCard("Invoices", ["Number", "Customer", "Total", "Paid", "Balance", "Status", "Actions"], (data.invoices || []).map(function (item) {
        return [
          escapeHtml(firstText(item.invoice_number, "—")),
          escapeHtml(firstText(item.customer_name, "Walk-in")),
          money(item.total),
          money(item.amount_paid),
          money(item.balance_due),
          renderBadge(firstText(item.status, "sent")),
          actionButtons([
            Number(item.balance_due || 0) > 0 ? { cls: "js-pay-invoice", label: "Pay", id: item.id } : null,
            { cls: "js-update-invoice-status", label: "Status", id: item.id, tone: "secondary" },
            { cls: "js-print-invoice", label: "Print", id: item.id, tone: "secondary" },
            { cls: "js-pdf-invoice", label: "PDF", id: item.id, tone: "secondary" },
            { cls: "js-whatsapp-invoice", label: "WhatsApp", id: item.id, tone: "secondary" },
            { cls: "js-email-invoice", label: "Email", id: item.id, tone: "secondary" }
          ])
        ];
      }), "No invoices yet.");
    }
    return renderTableCard("POS sales", ["Receipt", "Customer", "Items", "Total", "Paid", "Method", "Date", "Actions"], (data.sales || []).map(function (item) {
      return [
        escapeHtml(firstText(item.receipt_number, "—")),
        escapeHtml(firstText(item.customer_name, "Walk-in")),
        escapeHtml(String((item.items || []).length)),
        money(item.total),
        money(item.amount_paid),
        escapeHtml(firstText(item.payment_method, "—")),
        escapeHtml(formatDateTime(item.created_at)),
        actionButtons([
          { cls: "js-print-receipt", label: "Print", id: item.id, tone: "secondary" },
          { cls: "js-pdf-receipt", label: "PDF", id: item.id, tone: "secondary" },
          { cls: "js-whatsapp-receipt", label: "WhatsApp", id: item.id, tone: "secondary" },
          { cls: "js-email-receipt", label: "Email", id: item.id, tone: "secondary" }
        ])
      ];
    }), "No POS sales yet.");
  }

  async function handleSalesComposer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = trimmed(form, "document_type") || state.ui.salesComposer.type;
    const items = readComposerItems(form, state.ui.salesComposer.rows);
    if (!items.length) {
      setFlash("sales", "error", "Add at least one line item.");
      renderSales();
      return;
    }
    const payload = compactObject({
      customer_id: optionalNumber(form, "customer_id"),
      items: items,
      discount_amount: optionalNumber(form, "discount_amount") || 0,
      amount_paid: optionalNumber(form, "amount_paid"),
      payment_method: optionalString(form, "payment_method"),
      valid_until: optionalString(form, "valid_until"),
      delivery_time: optionalString(form, "delivery_time"),
      warranty: optionalString(form, "warranty"),
      payment_terms: optionalString(form, "payment_terms"),
      due_date: optionalString(form, "due_date"),
      status: optionalString(form, "status"),
      notes: optionalString(form, "notes")
    });
    const endpoint = type === "sale" ? "/api/pos/sale" : type === "quotation" ? "/api/quotations" : "/api/invoices";
    await apiJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
    setFlash("sales", "success", labelForDocument(type) + " created.");
    state.ui.salesComposer.rows = 1;
    await loadSales();
    renderSales();
    await loadDashboard();
    renderDashboardStats();
  }

  async function deleteQuotation(id) {
    if (!window.confirm("Delete this quotation?")) return;
    await apiJson("/api/quotations/" + id, { method: "DELETE" });
    setFlash("sales", "success", "Quotation deleted.");
    await loadSales();
    renderSales();
  }

  async function convertQuotation(id) {
    await apiJson("/api/quotations/" + id + "/convert", { method: "POST", body: JSON.stringify({}) });
    setFlash("sales", "success", "Quotation converted to invoice.");
    await loadSales();
    renderSales();
  }

  async function updateQuotation(id, payload) {
    await apiJson("/api/quotations/" + id, { method: "PATCH", body: JSON.stringify(payload) });
    setFlash("sales", "success", "Quotation updated.");
    await loadSales();
    renderSales();
  }

  async function payInvoice(id) {
    const invoice = findById((state.moduleData.sales || {}).invoices, id);
    if (!invoice) return;
    const amount = window.prompt("Payment amount", String(Number(invoice.balance_due || 0)));
    if (!amount) return;
    const method = window.prompt("Payment method", "cash");
    if (!method) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFlash("sales", "error", "Enter a valid positive payment amount.");
      renderSales();
      return;
    }
    if (PAYMENT_METHODS.indexOf(method) === -1) {
      setFlash("sales", "error", "Choose a valid payment method: " + PAYMENT_METHODS.join(", "));
      renderSales();
      return;
    }
    await apiJson("/api/invoices/" + id + "/pay", {
      method: "POST",
      body: JSON.stringify({ amount: parsedAmount, method: method, reference: "", notes: "" })
    });
    setFlash("sales", "success", "Invoice payment recorded.");
    await loadSales();
    renderSales();
  }

  async function updateInvoiceStatus(id) {
    const status = window.prompt("Set status (draft, sent, partial, paid, cancelled)", "sent");
    if (!status) return;
    if (SALES_STATUSES.indexOf(status) === -1) {
      setFlash("sales", "error", "Choose a valid invoice status: " + SALES_STATUSES.join(", "));
      renderSales();
      return;
    }
    await apiJson("/api/invoices/" + id, { method: "PATCH", body: JSON.stringify({ status: status }) });
    setFlash("sales", "success", "Invoice updated.");
    await loadSales();
    renderSales();
  }

  async function loadCustomers() {
    state.moduleData.customers = { customers: normalizeList(await apiJson("/api/customers?limit=100")) };
  }

  function renderCustomers() {
    renderSimpleCrudModule({
      module: "customers",
      title: "Customers",
      singularTitle: "Customer",
      editStateKey: "customerEdit",
      data: (state.moduleData.customers || {}).customers || [],
      fields: [
        textField("Name", "name", state.ui.customerEdit && state.ui.customerEdit.name, true),
        textField("Company", "company", state.ui.customerEdit && state.ui.customerEdit.company),
        textField("Contact person", "contact_person", state.ui.customerEdit && state.ui.customerEdit.contact_person),
        textField("Email", "email", state.ui.customerEdit && state.ui.customerEdit.email),
        textField("Phone", "phone", state.ui.customerEdit && state.ui.customerEdit.phone),
        textField("City", "city", state.ui.customerEdit && state.ui.customerEdit.city),
        textField("Address", "address", state.ui.customerEdit && state.ui.customerEdit.address),
        textField("Tax number", "tax_number", state.ui.customerEdit && state.ui.customerEdit.tax_number),
        numberField("Credit limit", "credit_limit", valueOrDefault(state.ui.customerEdit && state.ui.customerEdit.credit_limit, 0), "0.01")
      ],
      columns: ["Name", "Phone", "Email", "Balance", "Credit limit", "Actions"],
      rows: ((state.moduleData.customers || {}).customers || []).map(function (item) {
        return [
          escapeHtml(firstText(item.name, "—")),
          escapeHtml(firstText(item.phone, "—")),
          escapeHtml(firstText(item.email, "—")),
          money(item.balance),
          money(item.credit_limit),
          actionButtons([
            { cls: "js-edit-item", label: "Edit", id: item.id },
            { cls: "js-print-customer-statement", label: "Statement", id: item.id, tone: "secondary" },
            { cls: "js-pdf-customer-statement", label: "PDF", id: item.id, tone: "secondary" },
            { cls: "js-whatsapp-customer-statement", label: "WhatsApp", id: item.id, tone: "secondary" },
            { cls: "js-email-customer-statement", label: "Email", id: item.id, tone: "secondary" },
            { cls: "js-delete-item", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }),
      formId: "customersForm",
      onSubmit: handleCustomerSave,
      onDelete: deleteCustomer
    });
  }

  async function handleCustomerSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const edit = state.ui.customerEdit;
    await apiJson(edit && edit.id ? "/api/customers/" + edit.id : "/api/customers", {
      method: edit && edit.id ? "PATCH" : "POST",
      body: JSON.stringify(compactObject({
        name: trimmed(form, "name"),
        company: optionalString(form, "company"),
        contact_person: optionalString(form, "contact_person"),
        email: optionalString(form, "email"),
        phone: optionalString(form, "phone"),
        city: optionalString(form, "city"),
        address: optionalString(form, "address"),
        tax_number: optionalString(form, "tax_number"),
        credit_limit: optionalNumber(form, "credit_limit")
      }))
    });
    state.ui.customerEdit = null;
    setFlash("customers", "success", "Customer saved.");
    await loadCustomers();
    renderCustomers();
  }

  async function deleteCustomer(id) {
    if (!window.confirm("Delete this customer?")) return;
    await apiJson("/api/customers/" + id, { method: "DELETE" });
    setFlash("customers", "success", "Customer deleted.");
    await loadCustomers();
    renderCustomers();
  }

  async function loadSuppliers() {
    state.moduleData.suppliers = { suppliers: normalizeList(await apiJson("/api/suppliers?limit=100")) };
  }

  function renderSuppliers() {
    renderSimpleCrudModule({
      module: "suppliers",
      title: "Suppliers",
      singularTitle: "Supplier",
      editStateKey: "supplierEdit",
      data: (state.moduleData.suppliers || {}).suppliers || [],
      fields: [
        textField("Name", "name", state.ui.supplierEdit && state.ui.supplierEdit.name, true),
        textField("Contact person", "contact_person", state.ui.supplierEdit && state.ui.supplierEdit.contact_person),
        textField("Email", "email", state.ui.supplierEdit && state.ui.supplierEdit.email),
        textField("Phone", "phone", state.ui.supplierEdit && state.ui.supplierEdit.phone),
        textField("City", "city", state.ui.supplierEdit && state.ui.supplierEdit.city),
        textField("Address", "address", state.ui.supplierEdit && state.ui.supplierEdit.address),
        textField("Tax number", "tax_number", state.ui.supplierEdit && state.ui.supplierEdit.tax_number)
      ],
      columns: ["Name", "Phone", "Email", "City", "Balance", "Actions"],
      rows: ((state.moduleData.suppliers || {}).suppliers || []).map(function (item) {
        return [
          escapeHtml(firstText(item.name, "—")),
          escapeHtml(firstText(item.phone, "—")),
          escapeHtml(firstText(item.email, "—")),
          escapeHtml(firstText(item.city, "—")),
          money(item.balance),
          actionButtons([
            { cls: "js-edit-item", label: "Edit", id: item.id },
            { cls: "js-print-supplier-statement", label: "Statement", id: item.id, tone: "secondary" },
            { cls: "js-pdf-supplier-statement", label: "PDF", id: item.id, tone: "secondary" },
            { cls: "js-whatsapp-supplier-statement", label: "WhatsApp", id: item.id, tone: "secondary" },
            { cls: "js-email-supplier-statement", label: "Email", id: item.id, tone: "secondary" },
            { cls: "js-delete-item", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }),
      formId: "suppliersForm",
      onSubmit: handleSupplierSave,
      onDelete: deleteSupplier
    });
  }

  async function handleSupplierSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const edit = state.ui.supplierEdit;
    await apiJson(edit && edit.id ? "/api/suppliers/" + edit.id : "/api/suppliers", {
      method: edit && edit.id ? "PATCH" : "POST",
      body: JSON.stringify(compactObject({
        name: trimmed(form, "name"),
        contact_person: optionalString(form, "contact_person"),
        email: optionalString(form, "email"),
        phone: optionalString(form, "phone"),
        city: optionalString(form, "city"),
        address: optionalString(form, "address"),
        tax_number: optionalString(form, "tax_number")
      }))
    });
    state.ui.supplierEdit = null;
    setFlash("suppliers", "success", "Supplier saved.");
    await loadSuppliers();
    renderSuppliers();
  }

  async function deleteSupplier(id) {
    if (!window.confirm("Delete this supplier?")) return;
    await apiJson("/api/suppliers/" + id, { method: "DELETE" });
    setFlash("suppliers", "success", "Supplier deleted.");
    await loadSuppliers();
    renderSuppliers();
  }

  async function loadPurchases() {
    const results = await Promise.all([
      apiJson("/api/purchases?limit=50"),
      apiJson("/api/suppliers?limit=100"),
      apiJson("/api/products?limit=100")
    ]);
    state.moduleData.purchases = {
      purchases: normalizeList(results[0]),
      suppliers: normalizeList(results[1]),
      products: normalizeList(results[2])
    };
  }

  function renderPurchases() {
    const body = moduleBody("purchases");
    const data = state.moduleData.purchases || {};
    body.innerHTML = [
      renderFlash("purchases"),
      '<section class="card"><div class="section-head"><h3>New purchase order</h3></div><form id="purchaseForm" class="form-grid two">' +
        selectField("Supplier", "supplier_id", data.suppliers, null) +
        textField("Expected date", "expected_date", todayIso(), false, "", "date") +
        textAreaField("Notes", "notes", "") +
        '<div class="span-2"><div class="line-items-head"><h4>Items</h4><button type="button" class="secondary" id="purchaseAddRowBtn">Add line</button></div>' + renderComposerRows("purchase", state.ui.purchaseComposerRows, data.products, true) + '</div>' +
        '<div class="form-actions span-2"><button type="submit">Create purchase order</button></div>' +
      '</form></section>',
      renderTableCard("Purchase orders", ["Number", "Supplier", "Items", "Total", "Status", "Expected", "Actions"], (data.purchases || []).map(function (item) {
        return [
          escapeHtml(firstText(item.purchase_number, "—")),
          escapeHtml(firstText(item.supplier_name, "—")),
          escapeHtml(String((item.items || []).length)),
          money(item.total),
          renderBadge(firstText(item.status, "draft")),
          escapeHtml(formatDate(item.expected_date)),
          actionButtons([
            item.status !== "received" ? { cls: "js-receive-purchase", label: "Receive", id: item.id } : null,
            { cls: "js-status-purchase", label: "Status", id: item.id, tone: "secondary" },
            { cls: "js-print-purchase-order", label: "Print PO", id: item.id, tone: "secondary" },
            { cls: "js-print-grn", label: "Print GRN", id: item.id, tone: "secondary" },
            { cls: "js-pdf-purchase-order", label: "PDF PO", id: item.id, tone: "secondary" }
          ])
        ];
      }), "No purchase orders yet.")
    ].join("");

    bindForm("purchaseForm", handlePurchaseSave);
    bindClick("purchaseAddRowBtn", function () {
      state.ui.purchaseComposerRows += 1;
      renderPurchases();
    });
    bindRowActions(body, {
      ".js-remove-purchase-row": function () {
        state.ui.purchaseComposerRows = Math.max(1, state.ui.purchaseComposerRows - 1);
        renderPurchases();
      },
      ".js-receive-purchase": function (event) {
        receivePurchase(event.currentTarget.dataset.id);
      },
      ".js-status-purchase": function (event) {
        updatePurchaseStatus(event.currentTarget.dataset.id);
      },
      ".js-print-purchase-order": function (event) {
        openDocumentPrint("purchase_order", event.currentTarget.dataset.id, "a4");
      },
      ".js-print-grn": function (event) {
        openDocumentPrint("goods_received_note", event.currentTarget.dataset.id, "a4");
      },
      ".js-pdf-purchase-order": function (event) {
        openDocumentPdf("purchase_order", event.currentTarget.dataset.id);
      }
    });
  }

  async function handlePurchaseSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const items = readComposerItems(form, state.ui.purchaseComposerRows, true);
    await apiJson("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: requiredNumber(form, "supplier_id"),
        expected_date: optionalString(form, "expected_date"),
        notes: optionalString(form, "notes"),
        items: items
      })
    });
    state.ui.purchaseComposerRows = 1;
    setFlash("purchases", "success", "Purchase order created.");
    await loadPurchases();
    renderPurchases();
  }

  async function receivePurchase(id) {
    await apiJson("/api/purchases/" + id + "/receive", { method: "POST", body: JSON.stringify({}) });
    setFlash("purchases", "success", "Purchase marked as received.");
    await loadPurchases();
    renderPurchases();
    await loadInventory();
    if (state.activeModule === "inventory") renderInventory();
  }

  async function updatePurchaseStatus(id) {
    const status = window.prompt("Set purchase status", "ordered");
    if (!status) return;
    if (PURCHASE_STATUSES.indexOf(status) === -1) {
      setFlash("purchases", "error", "Choose a valid purchase status: " + PURCHASE_STATUSES.join(", "));
      renderPurchases();
      return;
    }
    await apiJson("/api/purchases/" + id, { method: "PATCH", body: JSON.stringify({ status: status }) });
    setFlash("purchases", "success", "Purchase updated.");
    await loadPurchases();
    renderPurchases();
  }

  async function loadExpenses() {
    state.moduleData.expenses = { expenses: normalizeList(await apiJson("/api/expenses?limit=100")) };
  }

  function renderExpenses() {
    renderSimpleCrudModule({
      module: "expenses",
      title: "Expenses",
      singularTitle: "Expense",
      editStateKey: "expenseEdit",
      data: (state.moduleData.expenses || {}).expenses || [],
      fields: [
        textField("Description", "description", state.ui.expenseEdit && state.ui.expenseEdit.description, true),
        numberField("Amount", "amount", state.ui.expenseEdit && state.ui.expenseEdit.amount, "0.01"),
        textField("Category", "category", state.ui.expenseEdit && state.ui.expenseEdit.category, true),
        selectFieldFromValues("Payment method", "payment_method", EXPENSE_METHODS, firstText(state.ui.expenseEdit && state.ui.expenseEdit.payment_method, "cash")),
        textField("Reference", "reference", state.ui.expenseEdit && state.ui.expenseEdit.reference),
        textField("Date", "date", firstText(state.ui.expenseEdit && state.ui.expenseEdit.date, todayIso()), true, "", "date"),
        textAreaField("Notes", "notes", state.ui.expenseEdit && state.ui.expenseEdit.notes)
      ],
      columns: ["Description", "Category", "Amount", "Method", "Date", "Actions"],
      rows: ((state.moduleData.expenses || {}).expenses || []).map(function (item) {
        return [
          escapeHtml(firstText(item.description, "—")),
          escapeHtml(firstText(item.category, "—")),
          money(item.amount),
          escapeHtml(firstText(item.payment_method, "—")),
          escapeHtml(formatDate(item.date)),
          actionButtons([
            { cls: "js-edit-item", label: "Edit", id: item.id },
            { cls: "js-delete-item", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }),
      formId: "expensesForm",
      onSubmit: handleExpenseSave,
      onDelete: deleteExpense
    });
  }

  async function handleExpenseSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const edit = state.ui.expenseEdit;
    await apiJson(edit && edit.id ? "/api/expenses/" + edit.id : "/api/expenses", {
      method: edit && edit.id ? "PATCH" : "POST",
      body: JSON.stringify(compactObject({
        description: trimmed(form, "description"),
        amount: requiredNumber(form, "amount"),
        category: trimmed(form, "category"),
        payment_method: optionalString(form, "payment_method"),
        reference: optionalString(form, "reference"),
        date: trimmed(form, "date"),
        notes: optionalString(form, "notes")
      }))
    });
    state.ui.expenseEdit = null;
    setFlash("expenses", "success", "Expense saved.");
    await loadExpenses();
    renderExpenses();
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    await apiJson("/api/expenses/" + id, { method: "DELETE" });
    setFlash("expenses", "success", "Expense deleted.");
    await loadExpenses();
    renderExpenses();
  }

  async function loadReports() {
    const range = state.ui.reportsRange;
    const query = "from=" + encodeURIComponent(range.from) + "&to=" + encodeURIComponent(range.to);
    const results = await Promise.all([
      apiJson("/api/reports/sales-summary?" + query),
      apiJson("/api/reports/profit-loss?" + query),
      apiJson("/api/reports/inventory-valuation"),
      isSuperAdmin() ? apiJson("/api/reports/branch-comparison?" + query) : Promise.resolve(null)
    ]);
    state.moduleData.reports = {
      salesSummary: results[0],
      profitLoss: results[1],
      inventoryValuation: results[2],
      branchComparison: results[3]
    };
  }

  function renderReports() {
    const body = moduleBody("reports");
    const data = state.moduleData.reports || {};
    const range = state.ui.reportsRange;
    body.innerHTML = [
      renderFlash("reports"),
      '<section class="card"><div class="section-head"><h3>Report filters</h3></div><form id="reportsForm" class="inline-form report-form">' +
        '<label><span>From</span><input type="date" name="from" value="' + escapeAttr(range.from) + '" required /></label>' +
        '<label><span>To</span><input type="date" name="to" value="' + escapeAttr(range.to) + '" required /></label>' +
        '<button type="submit">Refresh</button></form><div class="form-actions"><button type="button" class="secondary" id="printStockAdjustmentBtn">Print stock adjustment report</button><button type="button" class="secondary" id="pdfStockAdjustmentBtn">Download stock adjustment PDF</button></div></section>',
      '<div class="module-grid two">',
      renderMetricCard("Sales summary", [
        ["Total sales", money(data.salesSummary && data.salesSummary.total_sales)],
        ["Transactions", numberText(data.salesSummary && data.salesSummary.total_transactions)],
        ["Average order", money(data.salesSummary && data.salesSummary.average_order_value)]
      ]),
      renderMetricCard("Profit & loss", [
        ["Revenue", money(data.profitLoss && data.profitLoss.revenue)],
        ["COGS", money(data.profitLoss && data.profitLoss.cost_of_goods)],
        ["Net profit", money(data.profitLoss && data.profitLoss.net_profit)]
      ]),
      '</div>',
      '<div class="module-grid two">',
      renderTableCard("Payment mix", ["Method", "Amount", "Count"], normalizeList(data.salesSummary && data.salesSummary.by_payment_method).map(function (item) {
        return [escapeHtml(firstText(item.method, "—")), money(item.amount), numberText(item.count)];
      }), "No sales in range."),
      renderTableCard("Expense breakdown", ["Category", "Amount"], normalizeList(data.profitLoss && data.profitLoss.expense_breakdown).map(function (item) {
        return [escapeHtml(firstText(item.category, "—")), money(item.amount)];
      }), "No expenses in range."),
      '</div>',
      renderTableCard("Inventory valuation", ["Product", "Stock", "Cost value", "Selling value", "Status"], normalizeList(data.inventoryValuation && data.inventoryValuation.items).map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          numberText(item.current_stock),
          money(item.cost_value),
          money(item.selling_value),
          renderBadge(firstText(item.status, "ok"))
        ];
      }), "No inventory data available."),
      isSuperAdmin() ? renderTableCard("Branch comparison", ["Branch", "Sales", "Transactions", "Expenses", "Net"], normalizeList(data.branchComparison && data.branchComparison.branches).map(function (item) {
        return [
          escapeHtml(firstText(item.name, item.branch_name, "—")),
          money(item.sales),
          numberText(item.transactions),
          money(item.expenses),
          money(item.net_profit)
        ];
      }), "No branch comparison data.") : ""
    ].join("");

    bindForm("reportsForm", function (event) {
      event.preventDefault();
      state.ui.reportsRange = {
        from: trimmed(event.currentTarget, "from"),
        to: trimmed(event.currentTarget, "to")
      };
      switchModule("reports");
    });
    bindClick("printStockAdjustmentBtn", function () { openDocumentPrint("stock_adjustment_report", 1, "a4"); });
    bindClick("pdfStockAdjustmentBtn", function () { openDocumentPdf("stock_adjustment_report", 1); });
  }

  async function loadUsers() {
    const results = await Promise.all([
      apiJson("/api/users"),
      apiJson("/api/branches/options")
    ]);
    state.moduleData.users = {
      users: normalizeList(results[0]),
      branches: normalizeList(results[1])
    };
  }

  function renderUsers() {
    const body = moduleBody("users");
    const data = state.moduleData.users || {};
    const edit = state.ui.userEdit || {};
    body.innerHTML = [
      renderFlash("users"),
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>' + (edit.id ? "Edit user" : "New user") + '</h3></div><form id="usersForm" class="form-grid two">' +
        textField("Name", "name", edit.name, true) +
        textField("Email", "email", edit.email, true, "", "email") +
        selectFieldFromValues("Role", "role", ROLES, firstText(edit.role, "cashier")) +
        selectField("Branch", "branch_id", data.branches, edit.branch_id) +
        textField("Phone", "phone", edit.phone) +
        textField("Branch label", "branch", edit.branch) +
        passwordField("Password", "password") +
        checkField("Active", "is_active", edit.is_active !== false) +
        '<div class="form-actions span-2"><button type="submit">' + (edit.id ? "Update user" : "Create user") + '</button><button type="button" class="secondary" id="usersResetBtn">Clear</button></div>' +
      '</form></section>',
      renderTableCard("Users", ["Name", "Email", "Role", "Branch", "Status", "Actions"], (data.users || []).map(function (item) {
        return [
          escapeHtml(firstText(item.name, "—")),
          escapeHtml(firstText(item.email, "—")),
          escapeHtml(firstText(item.role, "—")),
          escapeHtml(firstText(item.branch, item.branch_id, "—")),
          renderBadge(item.is_active ? "active" : "inactive"),
          actionButtons([
            { cls: "js-edit-user", label: "Edit", id: item.id },
            { cls: "js-delete-user", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }), "No users available."),
      '</div>'
    ].join("");

    bindForm("usersForm", handleUserSave);
    bindClick("usersResetBtn", function () { state.ui.userEdit = null; renderUsers(); });
    bindRowActions(body, {
      ".js-edit-user": function (event) {
        state.ui.userEdit = findById(data.users, event.currentTarget.dataset.id) || null;
        renderUsers();
      },
      ".js-delete-user": function (event) {
        deleteUser(event.currentTarget.dataset.id);
      }
    });
  }

  async function handleUserSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const edit = state.ui.userEdit;
    const payload = compactObject({
      name: trimmed(form, "name"),
      email: trimmed(form, "email"),
      role: trimmed(form, "role"),
      branch_id: optionalNumber(form, "branch_id"),
      branch: optionalString(form, "branch"),
      phone: optionalString(form, "phone"),
      password: optionalString(form, "password"),
      is_active: checkboxValue(form, "is_active")
    });
    await apiJson(edit && edit.id ? "/api/users/" + edit.id : "/api/users", {
      method: edit && edit.id ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    state.ui.userEdit = null;
    setFlash("users", "success", "User saved.");
    await loadUsers();
    renderUsers();
  }

  async function deleteUser(id) {
    if (!window.confirm("Delete this user?")) return;
    await apiJson("/api/users/" + id, { method: "DELETE" });
    setFlash("users", "success", "User deleted.");
    await loadUsers();
    renderUsers();
  }

  async function loadSettings() {
    state.moduleData.settings = { settings: await apiJson("/api/settings") };
    state.currency = firstText(state.moduleData.settings.settings.currency, "KES");
  }

  function renderSettings() {
    const body = moduleBody("settings");
    const s = (state.moduleData.settings || {}).settings || {};
    body.innerHTML = [
      renderFlash("settings"),
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>Business settings</h3></div><form id="settingsForm" class="form-grid two">' +
        textField("Business name", "business_name", s.business_name, true) +
        textField("Business email", "business_email", s.business_email, false, "", "email") +
        textField("Business phone", "business_phone", s.business_phone) +
        textField("KRA PIN / Tax PIN", "tax_number", s.tax_number) +
        textField("Currency", "currency", s.currency) +
        textField("Currency symbol", "currency_symbol", s.currency_symbol) +
        numberField("VAT rate", "vat_rate", s.vat_rate, "0.01") +
        textField("Country", "country", s.country) +
        textField("Timezone", "timezone", s.timezone) +
        textField("SMTP host", "smtp_host", s.smtp_host) +
        numberField("SMTP port", "smtp_port", s.smtp_port || 587, "1") +
        textField("SMTP user", "smtp_user", s.smtp_user) +
        textField("SMTP from", "smtp_from", s.smtp_from, false, "", "email") +
        textAreaField("Address", "business_address", s.business_address) +
        textAreaField("Receipt footer", "receipt_footer", s.receipt_footer) +
        '<div class="form-actions span-2"><button type="submit">Save business settings</button></div>' +
      '</form></section>',
      '<section class="card"><div class="section-head"><h3>Branding</h3></div><form id="brandingForm" class="form-grid two">' +
        textField("Tagline", "tagline", s.tagline) +
        textField("Website", "website", s.website) +
        textField("Logo URL", "logo_url", s.logo_url) +
        textField("Alternative phone", "business_phone2", s.business_phone2) +
        textField("Primary color", "primary_color", s.primary_color, false, "#0f172a") +
        textField("Secondary color", "secondary_color", s.secondary_color, false, "#38bdf8") +
        textField("VAT number", "vat_number", s.vat_number) +
        numberField("Quotation validity days", "quotation_validity_days", s.quotation_validity_days || 30, "1") +
        textAreaField("Invoice terms & conditions", "invoice_payment_terms", s.invoice_payment_terms) +
        textAreaField("Warranty text", "warranty_text", s.warranty_text) +
        textAreaField("Return policy", "return_policy", s.return_policy) +
        textAreaField("Document footer", "document_footer", s.document_footer) +
        '<div class="form-actions span-2"><button type="submit">Save branding</button></div>' +
      '</form></section>',
      '</div>',
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>Payment settings</h3></div><form id="paymentSettingsForm" class="form-grid two">' +
        textField("M-Pesa paybill", "mpesa_paybill", s.mpesa_paybill) +
        textField("M-Pesa account", "mpesa_paybill_account", s.mpesa_paybill_account) +
        textField("Till number", "mpesa_till", s.mpesa_till) +
        textField("Buy goods till", "mpesa_buy_goods", s.mpesa_buy_goods) +
        textField("Bank name", "bank_name", s.bank_name) +
        textField("Bank branch", "bank_branch", s.bank_branch) +
        textField("Account name", "bank_account_name", s.bank_account_name) +
        textField("Account number", "bank_account_number", s.bank_account_number) +
        textField("Bank SWIFT code", "bank_swift_code", s.bank_swift_code) +
        textAreaField("Other payment methods", "other_payment_methods", s.other_payment_methods) +
        textAreaField("Payment instructions", "payment_instructions", s.payment_instructions) +
        '<div class="form-actions span-2"><button type="submit">Save payment settings</button></div>' +
      '</form></section>',
      '<section class="card"><div class="section-head"><h3>Security policy</h3></div><form id="securitySettingsForm" class="form-grid two">' +
        numberField("Session timeout (minutes)", "session_timeout_minutes", s.session_timeout_minutes, "1") +
        numberField("Password min length", "password_min_length", s.password_min_length, "1") +
        numberField("Max failed logins", "max_failed_logins", s.max_failed_logins, "1") +
        numberField("Lockout minutes", "lockout_minutes", s.lockout_minutes, "1") +
        checkField("Require uppercase", "password_require_uppercase", s.password_require_uppercase !== false) +
        checkField("Require number", "password_require_number", s.password_require_number !== false) +
        checkField("Require symbol", "password_require_symbol", s.password_require_symbol === true) +
        '<div class="form-actions span-2"><button type="submit">Save security policy</button></div>' +
      '</form></section>',
      '</div>'
    ].join("");

    bindForm("settingsForm", function (event) { saveSettingsGroup(event, "/api/settings", "Business settings saved."); });
    bindForm("brandingForm", async function (event) {
      await saveSettingsGroup(event, "/api/settings/branding", "Branding settings saved.");
      await loadBranding();
    });
    bindForm("paymentSettingsForm", function (event) { saveSettingsGroup(event, "/api/settings/payment", "Payment settings saved."); });
    bindForm("securitySettingsForm", function (event) { saveSettingsGroup(event, "/api/settings/security", "Security settings saved."); });
  }

  async function saveSettingsGroup(event, endpoint, successMessage) {
    event.preventDefault();
    const form = event.currentTarget;
    await apiJson(endpoint, {
      method: "PATCH",
      body: JSON.stringify(readFormPayload(form))
    });
    setFlash("settings", "success", successMessage);
    await loadSettings();
    renderSettings();
  }

  async function loadBranches() {
    state.moduleData.branches = { branches: normalizeList(await apiJson("/api/branches")) };
  }

  function renderBranches() {
    const body = moduleBody("branches");
    const data = state.moduleData.branches || {};
    const edit = state.ui.branchEdit || {};
    body.innerHTML = [
      renderFlash("branches"),
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>' + (edit.id ? "Edit branch" : "New branch") + '</h3></div><form id="branchesForm" class="form-grid two">' +
        textField("Name", "name", edit.name, true) +
        textField("Code", "code", edit.code, true) +
        textField("Manager", "manager", edit.manager) +
        textField("Phone", "phone", edit.phone) +
        textField("Email", "email", edit.email, false, "", "email") +
        textField("County", "county", edit.county) +
        textAreaField("Address", "address", edit.address) +
        checkField("Active", "is_active", edit.is_active !== false) +
        '<div class="form-actions span-2"><button type="submit">' + (edit.id ? "Update branch" : "Create branch") + '</button><button type="button" class="secondary" id="branchesResetBtn">Clear</button></div>' +
      '</form></section>',
      renderTableCard("Branches", ["Code", "Name", "Manager", "Phone", "Status", "Actions"], (data.branches || []).map(function (item) {
        return [
          escapeHtml(firstText(item.code, "—")),
          escapeHtml(firstText(item.name, "—")),
          escapeHtml(firstText(item.manager, "—")),
          escapeHtml(firstText(item.phone, "—")),
          renderBadge(item.is_active ? "active" : "inactive"),
          actionButtons([
            { cls: "js-edit-branch", label: "Edit", id: item.id },
            { cls: "js-delete-branch", label: "Delete", id: item.id, tone: "danger" }
          ])
        ];
      }), "No branches available."),
      '</div>'
    ].join("");

    bindForm("branchesForm", handleBranchSave);
    bindClick("branchesResetBtn", function () { state.ui.branchEdit = null; renderBranches(); });
    bindRowActions(body, {
      ".js-edit-branch": function (event) {
        state.ui.branchEdit = findById(data.branches, event.currentTarget.dataset.id) || null;
        renderBranches();
      },
      ".js-delete-branch": function (event) {
        deleteBranch(event.currentTarget.dataset.id);
      }
    });
  }

  async function handleBranchSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const edit = state.ui.branchEdit;
    await apiJson(edit && edit.id ? "/api/branches/" + edit.id : "/api/branches", {
      method: edit && edit.id ? "PATCH" : "POST",
      body: JSON.stringify(readFormPayload(form))
    });
    state.ui.branchEdit = null;
    setFlash("branches", "success", "Branch saved.");
    await loadBranches();
    renderBranches();
  }

  async function deleteBranch(id) {
    if (!window.confirm("Delete this branch?")) return;
    await apiJson("/api/branches/" + id, { method: "DELETE" });
    setFlash("branches", "success", "Branch deleted.");
    await loadBranches();
    renderBranches();
  }

  function renderSimpleCrudModule(config) {
    const body = moduleBody(config.module);
    const edit = state.ui[config.editStateKey] || null;
    body.innerHTML = [
      renderFlash(config.module),
      '<div class="module-grid two">',
      '<section class="card"><div class="section-head"><h3>' + (edit && edit.id ? "Edit " : "New ") + escapeHtml(config.singularTitle || config.title) + '</h3></div><form id="' + config.formId + '" class="form-grid two">' +
        config.fields.join("") +
        '<div class="form-actions span-2"><button type="submit">Save</button><button type="button" class="secondary" id="' + config.formId + 'ResetBtn">Clear</button></div>' +
      '</form></section>',
      renderTableCard(config.title, config.columns, config.rows, "No records available."),
      '</div>'
    ].join("");
    bindForm(config.formId, config.onSubmit);
    bindClick(config.formId + "ResetBtn", function () {
      state.ui[config.editStateKey] = null;
      renderByModule(config.module);
    });
    bindRowActions(body, {
      ".js-edit-item": function (event) {
        state.ui[config.editStateKey] = findById(config.data, event.currentTarget.dataset.id) || null;
        renderByModule(config.module);
      },
      ".js-delete-item": function (event) {
        config.onDelete(event.currentTarget.dataset.id);
      },
      ".js-print-customer-statement": function (event) {
        openDocumentPrint("customer_statement", event.currentTarget.dataset.id, "a4");
      },
      ".js-pdf-customer-statement": function (event) {
        openDocumentPdf("customer_statement", event.currentTarget.dataset.id);
      },
      ".js-email-customer-statement": function (event) {
        emailDocument("customer_statement", event.currentTarget.dataset.id);
      },
      ".js-whatsapp-customer-statement": function (event) {
        shareDocumentWhatsapp("customer_statement", event.currentTarget.dataset.id);
      },
      ".js-print-supplier-statement": function (event) {
        openDocumentPrint("supplier_statement", event.currentTarget.dataset.id, "a4");
      },
      ".js-pdf-supplier-statement": function (event) {
        openDocumentPdf("supplier_statement", event.currentTarget.dataset.id);
      },
      ".js-email-supplier-statement": function (event) {
        emailDocument("supplier_statement", event.currentTarget.dataset.id);
      },
      ".js-whatsapp-supplier-statement": function (event) {
        shareDocumentWhatsapp("supplier_statement", event.currentTarget.dataset.id);
      }
    });
  }

  function renderByModule(name) {
    MODULE_HANDLERS[name].render();
  }

  function renderDashboardStats() {
    const stats = state.dashboardStats;
    if (!stats) {
      pos.statTodaySales.textContent = "—";
      pos.statMonthlySales.textContent = "—";
      pos.statGrossProfit.textContent = "—";
      pos.statLowStock.textContent = "—";
      return;
    }
    pos.statTodaySales.textContent = money(stats.today_sales);
    pos.statMonthlySales.textContent = money(stats.monthly_sales);
    pos.statGrossProfit.textContent = money(stats.gross_profit);
    pos.statLowStock.textContent = numberText(stats.low_stock_count);
  }

  function renderPosUser() {
    if (!state.user) return;
    pos.navUser.textContent = firstText(state.user.name, state.user.email, "");
  }

  async function syncSessionFromToken() {
    if (!state.token) {
      state.user = null;
      clearStoredUser();
      return;
    }
    try {
      const user = await apiJson("/api/auth/me", { skipAuthRedirect: true });
      state.user = user;
      persistSession(state.token, state.user);
    } catch (_error) {
      clearSession();
    }
  }

  async function apiJson(url, options) {
    const opts = options || {};
    const noAuth = opts.noAuth;
    const skipAuthRedirect = opts.skipAuthRedirect;
    const fetchOptions = Object.assign({}, opts);
    delete fetchOptions.noAuth;
    delete fetchOptions.skipAuthRedirect;
    delete fetchOptions.raw;
    const response = noAuth ? await fetchWithJson(url, fetchOptions) : await authorizedFetch(url, fetchOptions);
    if (!response.ok) {
      const errorBody = await response.json().catch(function () { return {}; });
      if (response.status === 401 && !skipAuthRedirect) {
        clearSession();
        await routeAfterAuthChange({ showExpiredMessage: true });
        throw new Error("__AUTH_REDIRECT__");
      }
      throw new Error(firstText(errorBody.error, errorBody.message, response.statusText, "Request failed"));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function fetchWithJson(url, options) {
    const nextOptions = options || {};
    const headers = new Headers(nextOptions.headers || {});
    if (nextOptions.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, Object.assign({}, nextOptions, { headers: headers }));
  }

  async function authorizedFetch(url, options) {
    const nextOptions = options || {};
    const headers = new Headers(nextOptions.headers || {});
    if (state.token) headers.set("Authorization", "Bearer " + state.token);
    if (nextOptions.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, Object.assign({}, nextOptions, { headers: headers }));
  }

  function persistSession(token, user) {
    state.token = token || "";
    state.user = user || null;
    if (state.token) localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
    if (state.user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(state.user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  }

  function clearSession() {
    state.token = "";
    state.user = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    clearStoredUser();
  }

  function clearStoredUser() {
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  function readStoredToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  }

  function readStoredUser() {
    return readStoredJson(USER_STORAGE_KEY);
  }

  function readStoredJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function moduleBody(name) {
    return document.getElementById("body-" + name);
  }

  function setMessage(type, text) {
    login.message.className = "message";
    if (!text) {
      login.message.classList.add("hidden");
      login.message.textContent = "";
      return;
    }
    login.message.classList.add(type);
    login.message.textContent = text;
    login.message.classList.remove("hidden");
  }

  function resetSubmit(label) {
    login.submitBtn.disabled = false;
    login.submitBtn.textContent = label || "Sign in";
  }

  function setFlash(module, type, text) {
    state.flashes[module] = { type: type, text: text };
  }

  function renderFlash(module) {
    const flash = state.flashes[module];
    if (!flash || !flash.text) return "";
    state.flashes[module] = null;
    return '<div class="message ' + escapeHtml(flash.type) + '">' + escapeHtml(flash.text) + '</div>';
  }

  function renderTableCard(title, headers, rows, emptyText) {
    return '<section class="card"><div class="section-head"><h3>' + escapeHtml(title) + '</h3></div>' + renderTable(headers, rows, emptyText) + '</section>';
  }

  function renderMetricCard(title, rows) {
    return '<section class="card"><div class="section-head"><h3>' + escapeHtml(title) + '</h3></div><dl class="details-grid">' + rows.map(function (row) {
      return '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + row[1] + '</dd></div>';
    }).join("") + '</dl></section>';
  }

  function renderTable(headers, rows, emptyText) {
    if (!rows.length) {
      return '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
    }
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' + headers.map(function (header) {
      return '<th>' + escapeHtml(header) + '</th>';
    }).join("") + '</tr></thead><tbody>' + rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join("") + '</tr>';
    }).join("") + '</tbody></table></div>';
  }

  function renderSimpleList(items, prefix) {
    if (!items || !items.length) return '<div class="empty-state small">No records.</div>';
    return '<div class="pill-list">' + items.map(function (item) {
      return '<div class="pill-row"><span>' + escapeHtml(firstText(item.name, "—")) + '</span><div class="pill-actions">' +
        '<button type="button" class="secondary small js-edit-' + prefix + '" data-id="' + escapeAttr(item.id) + '">Edit</button>' +
        '<button type="button" class="secondary small js-delete-' + prefix + '" data-id="' + escapeAttr(item.id) + '">Delete</button>' +
        '</div></div>';
    }).join("") + '</div>';
  }

  function renderBadge(value) {
    return '<span class="badge badge-' + escapeAttr(String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")) + '">' + escapeHtml(titleize(String(value))) + '</span>';
  }

  function actionButtons(items) {
    const visible = (items || []).filter(Boolean);
    if (!visible.length) return "—";
    return '<div class="inline-actions">' + visible.map(function (item) {
      return '<button type="button" class="' + escapeAttr(item.cls) + ' ' + escapeAttr(item.tone === "danger" ? "danger-link" : item.tone === "secondary" ? "secondary small" : "small") + '" data-id="' + escapeAttr(item.id) + '">' + escapeHtml(item.label) + '</button>';
    }).join("") + '</div>';
  }

  function renderComposerRows(prefix, count, products, purchaseMode) {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push('<div class="line-item-row">' +
        '<select name="item_product_id_' + index + '" required>' + optionTags(products || [], null) + '</select>' +
        '<input type="number" min="1" step="1" name="item_quantity_' + index + '" value="1" required />' +
        '<input type="number" min="0" step="0.01" name="item_price_' + index + '" value="0" required />' +
        (purchaseMode ? '' : '<input type="number" min="0" step="0.01" name="item_discount_' + index + '" value="0" />') +
        (purchaseMode ? '' : '<input type="number" min="0" step="0.01" name="item_vat_' + index + '" value="16" />') +
        '<button type="button" class="secondary js-remove-' + prefix + '-row">Remove</button>' +
      '</div>');
    }
    return '<div class="line-item-grid"><div class="line-item-headings">' +
      '<span>Product</span><span>Qty</span><span>' + (purchaseMode ? 'Unit cost' : 'Unit price') + '</span>' +
      (purchaseMode ? '' : '<span>Discount</span><span>VAT</span>') + '<span></span></div>' + rows.join("") + '</div>';
  }

  function readComposerItems(form, count, purchaseMode) {
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const productId = optionalNumber(form, 'item_product_id_' + index);
      const quantity = optionalNumber(form, 'item_quantity_' + index);
      const price = optionalNumber(form, 'item_price_' + index);
      if (!productId || quantity == null || quantity <= 0 || price == null || price < 0) continue;
      const item = {
        product_id: productId,
        quantity: quantity
      };
      if (purchaseMode) {
        item.unit_cost = price;
      } else {
        item.unit_price = price;
        item.discount = optionalNumber(form, 'item_discount_' + index) || 0;
        item.vat_rate = optionalNumber(form, 'item_vat_' + index) || 0;
      }
      items.push(item);
    }
    return items;
  }

  function hiddenInput(name, value) {
    return '<input type="hidden" name="' + escapeAttr(name) + '" value="' + escapeAttr(value == null ? '' : value) + '" />';
  }

  function textField(label, name, value, required, placeholder, type) {
    return '<label><span>' + escapeHtml(label) + '</span><input type="' + escapeAttr(type || 'text') + '" name="' + escapeAttr(name) + '" value="' + escapeAttr(value == null ? '' : value) + '" ' + (placeholder ? 'placeholder="' + escapeAttr(placeholder) + '"' : '') + (required ? ' required' : '') + ' /></label>';
  }

  function passwordField(label, name) {
    return '<label><span>' + escapeHtml(label) + '</span><input type="password" name="' + escapeAttr(name) + '" /></label>';
  }

  function numberField(label, name, value, step) {
    return '<label><span>' + escapeHtml(label) + '</span><input type="number" name="' + escapeAttr(name) + '" value="' + escapeAttr(value == null ? '' : value) + '" step="' + escapeAttr(step || '1') + '" /></label>';
  }

  function textAreaField(label, name, value) {
    return '<label class="span-2"><span>' + escapeHtml(label) + '</span><textarea name="' + escapeAttr(name) + '">' + escapeHtml(value == null ? '' : value) + '</textarea></label>';
  }

  function checkField(label, name, checked) {
    return '<label class="checkbox-field"><input type="checkbox" name="' + escapeAttr(name) + '" ' + (checked ? 'checked' : '') + ' /><span>' + escapeHtml(label) + '</span></label>';
  }

  function selectField(label, name, options, selectedValue) {
    return '<label><span>' + escapeHtml(label) + '</span><select name="' + escapeAttr(name) + '"><option value="">Select…</option>' + optionTags(options || [], selectedValue) + '</select></label>';
  }

  function productSelectField(products, selectedValue) {
    return '<label><span>Product</span><select name="product_id" required><option value="">Select…</option>' + optionTags(products || [], selectedValue, false, 'id', 'product_name') + '</select></label>';
  }

  function selectFieldFromValues(label, name, values, selectedValue) {
    return '<label><span>' + escapeHtml(label) + '</span><select name="' + escapeAttr(name) + '">' + values.map(function (value) {
      return '<option value="' + escapeAttr(value) + '"' + (String(value) === String(selectedValue) ? ' selected' : '') + '>' + escapeHtml(titleize(value)) + '</option>';
    }).join("") + '</select></label>';
  }

  function optionTags(items, selectedValue, keepKeys, valueKey, labelKey) {
    const vKey = valueKey || 'id';
    const lKey = labelKey || 'name';
    return (items || []).map(function (item) {
      const value = item[vKey];
      const label = firstText(item[lKey], item.name, item.product_name, item.code, value);
      return '<option value="' + escapeAttr(value) + '"' + (String(value) === String(selectedValue) ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join("");
  }

  function bindForm(id, handler) {
    const form = document.getElementById(id);
    if (form) {
      form.addEventListener('submit', function (event) {
        Promise.resolve(handler(event)).catch(handleActionError);
      });
    }
  }

  function bindClick(id, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', function (event) {
        Promise.resolve(handler(event)).catch(handleActionError);
      });
    }
  }

  function bindRowActions(root, handlers) {
    Object.keys(handlers).forEach(function (selector) {
      root.querySelectorAll(selector).forEach(function (button) {
        button.addEventListener('click', function (event) {
          Promise.resolve(handlers[selector](event)).catch(handleActionError);
        });
      });
    });
  }

  function handleActionError(error) {
    if (error && error.message === "__AUTH_REDIRECT__") return;
    setFlash(state.activeModule, 'error', error && error.message ? error.message : 'Action failed.');
    renderByModule(state.activeModule);
  }

  function normalizeList(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.items)) return response.items;
    return [];
  }

  function readFormPayload(form) {
    const payload = {};
    Array.from(form.elements).forEach(function (element) {
      if (!element.name) return;
      if (element.type === 'checkbox') {
        payload[element.name] = element.checked;
        return;
      }
      if (element.value === '') return;
      payload[element.name] = element.type === 'number' ? Number(element.value) : element.value;
    });
    return payload;
  }

  function trimmed(form, name) {
    const element = form.elements[name];
    return element ? String(element.value || '').trim() : '';
  }

  function optionalString(form, name) {
    const value = trimmed(form, name);
    return value || null;
  }

  function optionalNumber(form, name) {
    const value = trimmed(form, name);
    if (!value) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function requiredNumber(form, name) {
    const num = optionalNumber(form, name);
    if (num == null) throw new Error(name + ' is required');
    return num;
  }

  function numberOrZero(form, name) {
    return optionalNumber(form, name) || 0;
  }

  function checkboxValue(form, name) {
    const element = form.elements[name];
    return !!(element && element.checked);
  }

  function compactObject(obj) {
    const out = {};
    Object.keys(obj).forEach(function (key) {
      const value = obj[key];
      if (value === undefined) return;
      if (value === null) return;
      if (typeof value === 'string' && value === '') return;
      out[key] = value;
    });
    return out;
  }

  function firstText() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString();
  }

  function formatDateTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function money(value) {
    var num = Number(value || 0);
    if (!Number.isFinite(num)) num = 0;
    return num.toLocaleString(undefined, { style: 'currency', currency: state.currency || 'KES', maximumFractionDigits: 2 });
  }

  function numberText(value) {
    var num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString() : '0';
  }

  function titleize(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function findById(items, id) {
    return (items || []).find(function (item) { return String(item.id) === String(id); });
  }

  function isSuperAdmin() {
    return !!(state.user && (state.user.role === 'super_admin' || state.user.role === 'business_owner'));
  }

  function subnavButton(module, tab, label) {
    var activeTab = state.ui[module + 'Tab'] || '';
    return '<button type="button" class="js-' + module + '-tab subnav__item ' + (activeTab === tab ? 'active' : '') + '" data-tab="' + escapeAttr(tab) + '">' + escapeHtml(label) + '</button>';
  }

  function labelForDocument(type) {
    return type === 'sale' ? 'sale' : type === 'quotation' ? 'quotation' : 'invoice';
  }

  function documentTypeFromUi(type) {
    if (type === "sale") return "receipt";
    return type;
  }

  function openDocumentPdf(type, id) {
    window.open("/api/documents/" + encodeURIComponent(documentTypeFromUi(type)) + "/" + encodeURIComponent(id) + "/pdf", "_blank", "noopener");
  }

  async function emailDocument(type, id) {
    const data = findByIdForDoc(type, id);
    const to = window.prompt("Recipient email", firstText(data && data.email, data && data.customer_email, data && data.supplier_email, ""));
    if (!to) return;
    await apiJson("/api/documents/" + encodeURIComponent(documentTypeFromUi(type)) + "/" + encodeURIComponent(id) + "/email", {
      method: "POST",
      body: JSON.stringify({ to: to })
    });
    setFlash(state.activeModule, "success", "Document email sent.");
    renderByModule(state.activeModule);
  }

  function shareDocumentWhatsapp(type, id) {
    const data = findByIdForDoc(type, id);
    const fallbackPhone = firstText(data && data.customer_phone, data && data.supplier_phone, "");
    const inputPhone = window.prompt("WhatsApp number (e.g. 2547XXXXXXXX)", fallbackPhone);
    if (!inputPhone) return;
    const phone = String(inputPhone).replace(/[^\d]/g, "");
    const docType = documentTypeFromUi(type);
    const pdfUrl = window.location.origin + "/api/documents/" + encodeURIComponent(docType) + "/" + encodeURIComponent(id) + "/pdf";
    const message = encodeURIComponent("Hello, please find your " + docType.replace(/_/g, " ") + ": " + pdfUrl);
    window.open("https://wa.me/" + phone + "?text=" + message, "_blank", "noopener");
  }

  async function openDocumentPrint(type, id, paper) {
    const docType = documentTypeFromUi(type);
    const payload = await apiJson("/api/documents/" + encodeURIComponent(docType) + "/" + encodeURIComponent(id) + "/preview?paper=" + encodeURIComponent(String(paper || "a4")));
    const win = window.open("", "_blank", "noopener");
    if (!win) {
      setFlash(state.activeModule, "error", "Popup blocked. Allow popups to preview and print documents.");
      renderByModule(state.activeModule);
      return;
    }
    win.document.open();
    win.document.write(payload.html || "");
    win.document.close();
  }

  function findByIdForDoc(type, id) {
    const salesData = state.moduleData.sales || {};
    if (type === "quotation") return findById(salesData.quotations, id);
    if (type === "invoice") return findById(salesData.invoices, id);
    if (type === "sale" || type === "receipt") return findById(salesData.sales, id);
    if (type === "customer_statement") return findById((state.moduleData.customers || {}).customers, id);
    if (type === "supplier_statement") return findById((state.moduleData.suppliers || {}).suppliers, id);
    return null;
  }

  function defaultDateRange() {
    var now = new Date();
    var end = now.toISOString().slice(0, 10);
    var start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { from: start, to: end };
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  async function refreshCurrency() {
    try {
      const settings = await apiJson("/api/settings", { skipAuthRedirect: true });
      state.moduleData.settings = { settings: settings };
      state.currency = firstText(settings.currency, "KES");
    } catch (_error) {
      state.currency = state.currency || "KES";
    }
  }

  function valueOrDefault(value, fallback) {
    return value == null || value === '' ? fallback : value;
  }
})();
