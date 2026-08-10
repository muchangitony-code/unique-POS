(function () {
  const TOKEN_STORAGE_KEY = "uniquepos.token";
  const USER_STORAGE_KEY = "uniquepos.user";
  const THEME_STORAGE_KEY = "uniquepos.theme";
  const DASHBOARD_LAYOUT_STORAGE_KEY = "uniquepos.dashboard.layout";
  const DEFAULT_COMPANY_LOGO_URL = "/assets/unique-solar-kenya-logo.svg";
  const BRAND_LOGO_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
  const BRAND_LOGO_UPLOAD_LIMIT = 2 * 1024 * 1024;
  const PRODUCT_IMPORT_FIELDS = {
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
      dashboardRange: "today",
      dashboardTheme: readStoredTheme(),
      dashboardLayout: readStoredDashboardLayout(),
      reportsRange: defaultDateRange(),
      selectedProducts: {},
      productsView: "list",
      productImport: { job: null, headers: [], mapping: {}, preview: [], total: 0 },
      productImportFile: null,
      posCheckout: {
        basket: [],
        customer_id: null,
        customer: null,
        discount_amount: 0,
        shipping_amount: 0,
        notes: "",
        payment_method: "cash",
        split_method2: "mpesa",
        split_amount2: 0,
        amount_paid: 0,
        filter_category: null,
        filter_brand: null,
        search_query: "",
        products: [],
        categories: [],
        brands: [],
        customers: [],
        heldSales: [],
        lastSaleId: null,
        lastInvoiceId: null,
        lastInvoiceNumber: null,
        submitting: false,
        view: "checkout"
      }
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
  let dashboardAutoRefreshTimer = null;

  boot();

  async function boot() {
    applyTheme(state.ui.dashboardTheme);
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
      const logoUrl = resolveBrandLogoUrl(branding);
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
    const candidate = String(logoUrl || "").trim();
    let safeLogoUrl = "";
    if (candidate) {
      try {
        if (candidate.startsWith("/")) {
          const parsed = new URL(candidate, window.location.origin);
          safeLogoUrl = parsed.pathname + parsed.search + parsed.hash;
        } else if (/^https?:\/\//i.test(candidate)) {
          const parsed = new URL(candidate);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            safeLogoUrl = parsed.href;
          }
        }
      } catch (_error) {}
    }
    if (!safeLogoUrl) {
      node.classList.add("hidden");
      node.removeAttribute("src");
      return;
    }
    node.src = safeLogoUrl;
    node.classList.remove("hidden");
  }

  function resolveBrandLogoUrl(branding) {
    return sanitizeImageUrl(firstText(branding && branding.logo_url, branding && branding.logoUrl, DEFAULT_COMPANY_LOGO_URL)) || DEFAULT_COMPANY_LOGO_URL;
  }

  function mapFieldLabel(field) {
    return PRODUCT_IMPORT_FIELDS[field] || field;
  }

  function sanitizeImageUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    if (candidate.startsWith("/")) return candidate;
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return "";
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
    const now = new Date();
    const today = isoDate(now);
    const yesterday = isoDate(addDays(now, -1));
    const range = state.ui.dashboardRange || "today";
    const role = dashboardRole();
    const rangeDates = dashboardRangeDates(range, now);
    const [stats, recentTransactions, topProducts, salesChart, inventory, quotations, invoices, purchases, customers, suppliers, branches, users, salesToday, expensesToday, todaySummary, yesterdaySummary, todayProfit, yesterdayProfit, branchComparison, auditFeed] = await Promise.all([
      apiJson("/api/dashboard/stats").catch(function () { return {}; }),
      apiJson("/api/dashboard/recent-transactions").catch(function () { return []; }),
      apiJson("/api/dashboard/top-products").catch(function () { return []; }),
      apiJson("/api/dashboard/sales-chart").catch(function () { return []; }),
      apiJson("/api/inventory/stock-count").catch(function () { return []; }),
      apiJson("/api/quotations?limit=80").catch(function () { return { data: [] }; }),
      apiJson("/api/invoices?limit=80").catch(function () { return { data: [] }; }),
      role === "cashier" ? Promise.resolve({ data: [] }) : apiJson("/api/purchases?limit=80").catch(function () { return { data: [] }; }),
      role === "cashier" ? Promise.resolve({ data: [] }) : apiJson("/api/customers?limit=100").catch(function () { return { data: [] }; }),
      role === "cashier" ? Promise.resolve({ data: [] }) : apiJson("/api/suppliers?limit=100").catch(function () { return { data: [] }; }),
      role === "administrator" ? apiJson("/api/branches").catch(function () { return []; }) : Promise.resolve([]),
      role === "cashier" ? Promise.resolve([]) : apiJson("/api/users").catch(function () { return []; }),
      apiJson("/api/pos/sales?limit=80").catch(function () { return { data: [] }; }),
      Promise.resolve({ data: [] }),
      apiJson("/api/reports/sales-summary?from=" + encodeURIComponent(today) + "&to=" + encodeURIComponent(today)).catch(function () { return {}; }),
      apiJson("/api/reports/sales-summary?from=" + encodeURIComponent(yesterday) + "&to=" + encodeURIComponent(yesterday)).catch(function () { return {}; }),
      apiJson("/api/reports/profit-loss?from=" + encodeURIComponent(today) + "&to=" + encodeURIComponent(today)).catch(function () { return {}; }),
      apiJson("/api/reports/profit-loss?from=" + encodeURIComponent(yesterday) + "&to=" + encodeURIComponent(yesterday)).catch(function () { return {}; }),
      role === "administrator" ? apiJson("/api/reports/branch-comparison?from=" + encodeURIComponent(rangeDates.from) + "&to=" + encodeURIComponent(rangeDates.to)).catch(function () { return null; }) : Promise.resolve(null),
      role === "administrator" ? apiJson("/api/audit-log?limit=15").catch(function () { return { data: [] }; }) : Promise.resolve({ data: [] })
    ]);
    const inventoryList = normalizeList(inventory);
    const quotationList = normalizeList(quotations);
    const invoiceList = normalizeList(invoices);
    const purchaseList = normalizeList(purchases);
    const customerList = normalizeList(customers);
    const supplierList = normalizeList(suppliers);
    const branchList = normalizeList(branches);
    const userList = normalizeList(users);
    const salesList = normalizeList(salesToday);
    const expenseList = normalizeList(expensesToday);
    const auditList = normalizeList(auditFeed && auditFeed.data);
    const topProductsList = normalizeList(topProducts);
    const kpis = computeDashboardKpis({
      stats: stats || {},
      inventory: inventoryList,
      quotations: quotationList,
      invoices: invoiceList,
      customers: customerList,
      sales: salesList,
      expenses: expenseList,
      todaySummary: todaySummary || {},
      yesterdaySummary: yesterdaySummary || {},
      todayProfit: todayProfit || {},
      yesterdayProfit: yesterdayProfit || {}
    });
    state.dashboardStats = kpis;
    state.moduleData.dashboard = {
      stats: stats || {},
      kpis: kpis,
      recentTransactions: normalizeList(recentTransactions),
      topProducts: topProductsList,
      salesChart: normalizeList(salesChart),
      inventory: inventoryList,
      quotations: quotationList,
      invoices: invoiceList,
      purchases: purchaseList,
      customers: customerList,
      suppliers: supplierList,
      branches: branchList,
      users: userList,
      sales: salesList,
      expenses: expenseList,
      todaySummary: todaySummary || {},
      todayProfit: todayProfit || {},
      branchComparison: normalizeList(branchComparison && branchComparison.branches),
      auditFeed: auditList
    };
  }

  function renderDashboard() {
    const body = moduleBody("dashboard");
    const data = state.moduleData.dashboard || {};
    const role = dashboardRole();
    const analytics = dashboardAnalytics(data, state.ui.dashboardRange || "today");
    const alerts = dashboardAlerts(data);
    body.innerHTML = [
      renderFlash("dashboard"),
      renderDashboardToolbar(),
      renderDashboardKpis(data.kpis || {}),
      renderWidgetGrid(role, data, analytics, alerts)
    ].join("");
    bindDashboardInteractions(body, role);
    applyBrandLogo(document.getElementById("dashboardBrandLogo"), resolveBrandLogoUrl(state.branding));
    renderDashboardStats();
    syncDashboardThemeControls();
  }

  function renderDashboardToolbar() {
    const range = state.ui.dashboardRange || "today";
    return '<section class="card dashboard-toolbar"><div class="dashboard-toolbar__left"><h3>Business dashboard</h3><p class="muted small">Live operational summary with smart signals.</p></div><div class="dashboard-toolbar__actions">' +
      ["today", "week", "month", "year"].map(function (item) {
        return '<button type="button" class="secondary small js-dashboard-range ' + (range === item ? 'active' : '') + '" data-range="' + item + '">' + escapeHtml(titleize(item)) + "</button>";
      }).join("") +
      '<button type="button" class="secondary small js-dashboard-theme">Theme: ' + escapeHtml(state.ui.dashboardTheme === "light" ? "Light" : "Dark") + "</button>" +
      "</div></section>";
  }

  function renderDashboardKpis(kpis) {
    const cards = [
      { key: "todaySales", icon: "💰", label: "Today's Sales", money: true },
      { key: "todayGrossProfit", icon: "📈", label: "Today's Gross Profit", money: true },
      { key: "todayNetProfit", icon: "📊", label: "Today's Net Profit", money: true },
      { key: "transactions", icon: "🧾", label: "Transactions" },
      { key: "averageSaleValue", icon: "🧮", label: "Average Sale Value", money: true },
      { key: "cashInTill", icon: "💵", label: "Cash in Till", money: true },
      { key: "mpesaCollections", icon: "📲", label: "M-Pesa Collections", money: true },
      { key: "creditSales", icon: "🤝", label: "Credit Sales", money: true },
      { key: "pendingQuotations", icon: "📝", label: "Pending Quotations" }
    ];
    return '<section class="dashboard-kpis">' + cards.map(function (item) {
      const metric = kpis[item.key] || { value: 0, change: 0 };
      const value = item.money ? money(metric.value) : numberText(metric.value);
      const change = Number(metric.change || 0);
      const cls = change >= 0 ? "up" : "down";
      return '<article class="card dashboard-kpi"><div class="dashboard-kpi__top"><span class="dashboard-kpi__icon">' + item.icon + '</span><span class="dashboard-kpi__label">' + escapeHtml(item.label) + '</span></div><div class="dashboard-kpi__value">' + value + '</div><div class="dashboard-kpi__change ' + cls + '">' + (change >= 0 ? "▲" : "▼") + " " + escapeHtml(Math.abs(change).toFixed(1)) + '% vs yesterday</div></article>';
    }).join("") + "</section>";
  }

  function renderWidgetGrid(role, data, analytics, alerts) {
    const widgets = [];
    widgets.push(dashboardWidget("sales-analytics", "Sales analytics", renderSalesAnalytics(analytics)));
    widgets.push(dashboardWidget("quick-actions", "Quick actions", renderQuickActions()));
    widgets.push(dashboardWidget("inventory-overview", "Inventory overview", renderInventoryOverview(data.inventory || [])));
    widgets.push(dashboardWidget("alerts", "Alerts & notifications", renderAlerts(alerts)));
    widgets.push(dashboardWidget("best-products", "Best selling products", renderBestProducts(data.topProducts || [])));
    widgets.push(dashboardWidget("slow-products", "Slow moving products", renderSlowMovingProducts(data.sales || [], data.inventory || [])));
    if (role !== "cashier") widgets.push(dashboardWidget("customer-dashboard", "Customer dashboard", renderCustomerDashboard(data.customers || [], data.sales || [])));
    if (role !== "cashier") widgets.push(dashboardWidget("supplier-dashboard", "Supplier dashboard", renderSupplierDashboard(data.suppliers || [], data.purchases || [])));
    if (role !== "cashier") widgets.push(dashboardWidget("financial-summary", "Financial summary", renderFinancialSummary(data.todaySummary || {}, data.todayProfit || {}, data.sales || [], data.expenses || [])));
    if (role !== "cashier") widgets.push(dashboardWidget("staff-performance", "Staff performance", renderStaffPerformance(data.users || [], data.sales || [])));
    if (role === "administrator" && (data.branches || []).length > 1) widgets.push(dashboardWidget("branch-performance", "Branch performance", renderBranchPerformance(data.branchComparison || [], data.inventory || [])));
    widgets.push(dashboardWidget("activity-feed", "Activity feed", renderActivityFeed(data.auditFeed || [], data.recentTransactions || [])));
    widgets.push(dashboardWidget("insights", "Smart business insights", renderBusinessInsights(data)));
    widgets.push(dashboardWidget("electrical", "Electrical shop widgets", renderElectricalWidgets(data)));
    widgets.push(dashboardWidget("branding", "Business branding", renderBrandingCard()));
    return '<div class="dashboard-widget-grid" id="dashboardWidgetGrid">' + orderedDashboardWidgets(widgets).join("") + "</div>";
  }

  function dashboardWidget(key, title, content) {
    return '<section class="card dashboard-widget" draggable="true" data-widget-key="' + escapeAttr(key) + '"><details open><summary>' + escapeHtml(title) + '</summary><div class="dashboard-widget__body">' + content + "</div></details></section>";
  }

  function renderSalesAnalytics(analytics) {
    return '<div class="module-grid two"><div><h4>Hourly sales (Today)</h4>' + renderMiniChart(analytics.hourlySales, "bar", true) + '</div><div><h4>Daily sales (Last 7 Days)</h4>' + renderMiniChart(analytics.dailySales, "line", true) + '</div><div><h4>Monthly sales trend</h4>' + renderMiniChart(analytics.monthlySales, "line", true) + '</div><div><h4>Monthly profit trend</h4>' + renderMiniChart(analytics.monthlyProfit, "line", true) + "</div></div>";
  }

  function renderQuickActions() {
    const actions = [
      ["New Sale", "sales"], ["New Quotation", "sales"], ["Receive Stock", "inventory"], ["Add Product", "products"], ["Add Customer", "customers"], ["Purchase Order", "purchases"], ["Stock Transfer", "inventory"], ["Product Return", "inventory"], ["Reports", "reports"]
    ];
    return '<div class="dashboard-actions">' + actions.map(function (item) { return '<button type="button" class="secondary js-dashboard-open-module" data-module="' + escapeAttr(item[1]) + '">' + escapeHtml(item[0]) + "</button>"; }).join("") + "</div>";
  }

  function renderInventoryOverview(items) {
    const totalProducts = items.length;
    const inventoryValue = items.reduce(function (sum, item) { return sum + Number(item.cost_value || 0); }, 0);
    const soldToday = (state.moduleData.dashboard && state.moduleData.dashboard.sales || []).reduce(function (sum, sale) {
      return sum + normalizeList(sale.items).reduce(function (lineTotal, line) { return lineTotal + Number(line.quantity || 0); }, 0);
    }, 0);
    const low = items.filter(function (item) { return String(item.status) === "low"; }).length;
    const out = items.filter(function (item) { return String(item.status) === "out_of_stock"; }).length;
    const over = items.filter(function (item) { return Number(item.current_stock || 0) > Number(item.min_stock || 0) * 4 && Number(item.min_stock || 0) > 0; }).length;
    const rows = [["Total products", numberText(totalProducts)], ["Inventory value", money(inventoryValue)], ["Products sold today", numberText(soldToday)], ["Low stock items", numberText(low)], ["Out of stock items", numberText(out)], ["Overstocked items", numberText(over)]];
    return '<div class="dashboard-link-grid">' + rows.map(function (row) { return '<button type="button" class="dashboard-link js-dashboard-open-module" data-module="inventory"><span>' + escapeHtml(row[0]) + '</span><strong>' + row[1] + "</strong></button>"; }).join("") + "</div>";
  }

  function renderAlerts(alerts) {
    return '<div class="dashboard-alert-columns"><div><h4 class="alert-red">Red</h4>' + renderAlertList(alerts.red) + '</div><div><h4 class="alert-yellow">Yellow</h4>' + renderAlertList(alerts.yellow) + '</div><div><h4 class="alert-green">Green</h4>' + renderAlertList(alerts.green) + "</div></div>";
  }

  function renderBestProducts(products) {
    return renderTable(["Code", "Product", "Qty Sold", "Sales Value", "Profit"], products.slice(0, 10).map(function (item) {
      const qty = Number(item.quantity_sold || item.quantity || 0);
      const sales = Number(item.revenue || item.total || 0);
      const profitVal = item.profit != null ? Number(item.profit) : item.cost != null ? sales - Number(item.cost) : null;
      return [escapeHtml(firstText(item.product_code, "—")), escapeHtml(firstText(item.product_name, item.name, "Unknown")), numberText(qty), money(sales), profitVal == null ? "—" : money(profitVal)];
    }), "No product sales yet.");
  }

  function renderSlowMovingProducts(sales, inventory) {
    const now = new Date();
    const soldMap = {};
    normalizeList(sales).forEach(function (sale) {
      const when = new Date(sale.created_at);
      normalizeList(sale.items).forEach(function (line) {
        const key = String(line.product_id);
        if (!soldMap[key] || when > soldMap[key]) soldMap[key] = when;
      });
    });
    const bands = { "30 Days": 0, "60 Days": 0, "90+ Days": 0 };
    normalizeList(inventory).forEach(function (item) {
      const last = soldMap[String(item.product_id)];
      const days = last ? Math.floor((now.getTime() - last.getTime()) / 864e5) : 999;
      if (days >= 90) bands["90+ Days"] += 1;
      else if (days >= 60) bands["60 Days"] += 1;
      else if (days >= 30) bands["30 Days"] += 1;
    });
    return renderTable(["Window", "Products"], Object.keys(bands).map(function (label) { return [escapeHtml(label), numberText(bands[label])]; }), "No slow-moving products.");
  }

  function renderCustomerDashboard(customers, sales) {
    const today = isoDate(new Date());
    const newCustomers = normalizeList(customers).filter(function (item) { return isoDate(new Date(item.created_at)) === today; }).length;
    const topCustomers = normalizeList(customers).slice().sort(function (a, b) { return Number(b.balance || 0) - Number(a.balance || 0); }).slice(0, 5);
    const totalDebt = normalizeList(customers).reduce(function (sum, item) { return sum + Math.max(0, Number(item.balance || 0)); }, 0);
    const totalLimit = normalizeList(customers).reduce(function (sum, item) { return sum + Math.max(0, Number(item.credit_limit || 0)); }, 0);
    const usage = totalLimit > 0 ? totalDebt / totalLimit * 100 : 0;
    return renderMetricCard("Customer metrics", [["New customers today", numberText(newCustomers)], ["Outstanding customer debts", money(totalDebt)], ["Customer credit limit usage", escapeHtml(usage.toFixed(1)) + "%"], ["Top customers", numberText(topCustomers.length)]]) + renderTable(["Customer", "Balance"], topCustomers.map(function (item) { return [escapeHtml(firstText(item.name, "—")), money(item.balance)]; }), "No customer balances.");
  }

  function renderSupplierDashboard(suppliers, purchases) {
    const pending = normalizeList(purchases).filter(function (item) { return item.status !== "received" && item.status !== "cancelled"; });
    const pendingValue = pending.reduce(function (sum, item) { return sum + Number(item.total || 0); }, 0);
    const owed = normalizeList(suppliers).reduce(function (sum, item) { return sum + Math.max(0, Number(item.balance || 0)); }, 0);
    const received = normalizeList(purchases).filter(function (item) { return item.status === "received"; }).slice(0, 5);
    return renderMetricCard("Supplier metrics", [["Pending deliveries", numberText(pending.length)], ["Pending PO value", money(pendingValue)], ["Amount owed to suppliers", money(owed)], ["Recently received stock", numberText(received.length)]]) + renderTable(["PO", "Supplier", "Status"], received.map(function (item) { return [escapeHtml(firstText(item.purchase_number, "—")), escapeHtml(firstText(item.supplier_name, "—")), renderBadge(firstText(item.status, "received"))]; }), "No recent receipts.");
  }

  function renderFinancialSummary(summary, profit, sales, expenses) {
    const methodMap = Object.fromEntries(normalizeList(summary.by_payment_method).map(function (item) { return [String(item.method || ""), Number(item.amount || 0)]; }));
    const discounts = normalizeList(sales).reduce(function (sum, sale) { return sum + Number(sale.discount_amount || 0); }, 0);
    const vat = normalizeList(sales).reduce(function (sum, sale) { return sum + Number(sale.tax_amount || 0); }, 0);
    const fallbackExpenses = normalizeList(expenses).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    const todayExpenses = Number(profit.expenses != null ? profit.expenses : fallbackExpenses);
    return renderMetricCard("Financial summary", [["Cash sales", money(methodMap.cash || 0)], ["M-Pesa sales", money(methodMap.mpesa || 0)], ["Card sales", money(methodMap.card || 0)], ["Bank sales", money(methodMap.bank_transfer || 0)], ["Credit sales", money(methodMap.credit || 0)], ["Expenses today", money(todayExpenses)], ["Gross profit", money(profit.gross_profit || 0)], ["Net profit", money(profit.net_profit || 0)], ["VAT collected", money(vat)], ["Discounts given", money(discounts)]]);
  }

  function renderStaffPerformance(users, sales) {
    const staffRows = normalizeList(users).filter(function (item) { return String(item.role || "").toLowerCase().indexOf("cash") >= 0; }).map(function (user) {
      const userSales = normalizeList(sales).filter(function (sale) { return firstText(sale.cashier_name, "").toLowerCase() === firstText(user.name, "").toLowerCase(); });
      const transactions = userSales.length;
      const total = userSales.reduce(function (sum, sale) { return sum + Number(sale.total || 0); }, 0);
      const returnsCount = 0;
      const discounts = userSales.reduce(function (sum, sale) { return sum + Number(sale.discount_amount || 0); }, 0);
      return [escapeHtml(firstText(user.name, "—")), money(total), numberText(transactions), numberText(returnsCount), money(discounts), renderBadge(user.is_active ? "online" : "offline"), '<button type="button" class="secondary small js-dashboard-open-module" data-module="sales">View</button>'];
    });
    return renderTable(["Cashier", "Sales", "Transactions", "Returns", "Discounts", "Login", "Details"], staffRows, "No cashier activity.");
  }

  function renderBranchPerformance(branchData, inventory) {
    const rows = normalizeList(branchData).map(function (item, index) {
      return [escapeHtml(firstText(item.name, item.branch_name, "—")), money(item.sales), money(item.gross_profit), money(item.net_profit), numberText(item.transactions), numberText(index + 1)];
    });
    return renderTable(["Branch", "Sales", "Gross Profit", "Net Profit", "Transactions", "Ranking"], rows, "No branch performance data.");
  }

  function renderActivityFeed(auditFeed, recentTransactions) {
    const rows = normalizeList(auditFeed).slice(0, 12).map(function (item) {
      return '<div class="activity-item"><span class="activity-item__time">' + escapeHtml(formatDateTime(item.created_at)) + '</span><span class="activity-item__text">' + escapeHtml(firstText(item.description, item.action, "Activity")) + "</span></div>";
    });
    if (rows.length) return '<div class="activity-feed">' + rows.join("") + "</div>";
    return renderTable(["Type", "Reference", "Date"], normalizeList(recentTransactions).map(function (item) {
      return [escapeHtml(firstText(item.type, item.status, "sale")), escapeHtml(firstText(item.reference, item.receipt_number, "—")), escapeHtml(formatDateTime(item.date || item.created_at))];
    }), "No recent activity.");
  }

  function renderBusinessInsights(data) {
    const inventory = normalizeList(data.inventory);
    const lowMarginProducts = normalizeList(data.topProducts).slice(0, 3).map(function (item) { return firstText(item.product_name, "Unknown"); });
    const lowStock = inventory.filter(function (item) { return String(item.status) === "low" || String(item.status) === "out_of_stock"; }).slice(0, 5).map(function (item) { return firstText(item.product_name, "—"); });
    const insights = [
      "Reorder soon: " + (lowStock.length ? lowStock.join(", ") : "stock levels are healthy."),
      "Slow-moving inventory detected in 90+ day bucket — run targeted promotions.",
      "Highest profit opportunities are concentrated in your top-selling products.",
      "Watch low-profit items: " + (lowMarginProducts.length ? lowMarginProducts.join(", ") : "insufficient data."),
      "Sales dip alerts trigger when today revenue is below yesterday by over 15%.",
      "Review unusual stock movement logs daily for shrinkage control.",
      "Suggested reorder quantity = max(min stock × 2 - current stock, 0)."
    ];
    return "<ul class=\"dashboard-insights\">" + insights.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>";
  }

  function renderElectricalWidgets(data) {
    const top = normalizeList(data.topProducts).slice(0, 5).map(function (item) { return firstText(item.product_name, "—"); });
    const pendingQuotes = normalizeList(data.quotations).filter(function (item) { return firstText(item.status, "draft") !== "converted"; }).length;
    return renderMetricCard("Electrical & hardware widgets", [["Fast-moving electrical items", escapeHtml(top.join(", ") || "—")], ["Cable stock by metre and roll", "Track with unit filters in inventory"], ["Top-selling brands", "Open Reports → Brand trends"], ["Warranty claims", "No claims endpoint configured"], ["Pending quotations", numberText(pendingQuotes)], ["Customer special orders", "Manage through quotations"], ["Goods awaiting collection", "Track through invoices (partial/unpaid)"]]);
  }

  function bindDashboardInteractions(body, role) {
    bindRowActions(body, {
      ".js-dashboard-open-module": function (event) { switchModule(event.currentTarget.dataset.module); },
      ".js-dashboard-range": function (event) {
        const nextRange = String(event.currentTarget.dataset.range || "today");
        if (state.ui.dashboardRange === nextRange) return;
        state.ui.dashboardRange = nextRange;
        switchModule("dashboard");
      },
      ".js-dashboard-theme": function () {
        state.ui.dashboardTheme = state.ui.dashboardTheme === "light" ? "dark" : "light";
        persistTheme(state.ui.dashboardTheme);
        applyTheme(state.ui.dashboardTheme);
        renderDashboard();
      }
    });
    bindDashboardDragDrop();
    startDashboardAutoRefresh();
  }

  function dashboardRole() {
    const role = String(state.user && state.user.role || "").toLowerCase();
    if (["super_admin", "business_owner", "administrator"].indexOf(role) >= 0) return "administrator";
    if (["branch_manager", "manager", "accountant", "storekeeper"].indexOf(role) >= 0) return "manager";
    return "cashier";
  }

  function dashboardRangeDates(range, now) {
    const end = isoDate(now);
    if (range === "year") return { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: end };
    if (range === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
    if (range === "week") return { from: isoDate(addDays(now, -6)), to: end };
    return { from: end, to: end };
  }

  function computeDashboardKpis(data) {
    const byMethod = Object.fromEntries(normalizeList(data.todaySummary && data.todaySummary.by_payment_method).map(function (item) { return [String(item.method || ""), Number(item.amount || 0)]; }));
    const yByMethod = Object.fromEntries(normalizeList(data.yesterdaySummary && data.yesterdaySummary.by_payment_method).map(function (item) { return [String(item.method || ""), Number(item.amount || 0)]; }));
    const pendingQuotations = normalizeList(data.quotations).filter(function (item) { return firstText(item.status, "draft") !== "converted"; }).length;
    const cashInTill = byMethod.cash || 0;
    const mpesa = byMethod.mpesa || 0;
    const credit = byMethod.credit || 0;
    return {
      todaySales: valueWithChange(data.todaySummary.total_sales || 0, data.yesterdaySummary.total_sales || 0),
      todayGrossProfit: valueWithChange(data.todayProfit.gross_profit || 0, data.yesterdayProfit.gross_profit || 0),
      todayNetProfit: valueWithChange(data.todayProfit.net_profit || 0, data.yesterdayProfit.net_profit || 0),
      transactions: valueWithChange(data.todaySummary.total_transactions || 0, data.yesterdaySummary.total_transactions || 0),
      averageSaleValue: valueWithChange(data.todaySummary.average_order_value || 0, data.yesterdaySummary.average_order_value || 0),
      cashInTill: valueWithChange(cashInTill, yByMethod.cash || 0),
      mpesaCollections: valueWithChange(mpesa, yByMethod.mpesa || 0),
      creditSales: valueWithChange(credit, yByMethod.credit || 0),
      pendingQuotations: valueWithChange(pendingQuotations, 0)
    };
  }

  function dashboardAnalytics(data, range) {
    const sales = normalizeList(data.sales);
    const chartRows = normalizeList(data.salesChart);
    const dailyWindow = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 365;
    const monthlyWindow = range === "year" ? 12 : range === "month" ? 6 : range === "week" ? 3 : 1;
    return {
      hourlySales: aggregateHourlySales(sales),
      dailySales: aggregateDailySales(sales, dailyWindow),
      monthlySales: aggregateMonthlySeries(chartRows, "sales", monthlyWindow),
      monthlyProfit: aggregateMonthlySeries(chartRows, "profit", monthlyWindow)
    };
  }

  function dashboardAlerts(data) {
    const inventory = normalizeList(data.inventory);
    const invoices = normalizeList(data.invoices);
    const purchases = normalizeList(data.purchases);
    const customers = normalizeList(data.customers);
    const outOfStock = inventory.filter(function (item) { return String(item.status) === "out_of_stock"; }).length;
    const lowStock = inventory.filter(function (item) { return String(item.status) === "low"; }).length;
    const negativeStock = inventory.filter(function (item) { return Number(item.current_stock || 0) < 0; }).length;
    const pendingPo = purchases.filter(function (item) { return item.status !== "received" && item.status !== "cancelled"; }).length;
    const unpaidInvoices = invoices.filter(function (item) { return ["draft", "sent", "partial", "overdue"].indexOf(String(item.status || "").toLowerCase()) >= 0; }).length;
    const overdueBalance = customers.filter(function (item) { return Number(item.balance || 0) > 0; }).length;
    const failedPayments = invoices.filter(function (item) { return String(item.status || "").toLowerCase() === "cancelled"; }).length;
    const auditFeed = normalizeList(data.auditFeed);
    const backupSuccess = auditFeed.some(function (item) { return String(item.action || "").indexOf("backup") >= 0; });
    const syncSuccess = auditFeed.some(function (item) { return String(item.action || "").indexOf("sync") >= 0; });
    return {
      red: [outOfStock ? outOfStock + " out-of-stock products" : "", negativeStock ? negativeStock + " negative stock records" : "", failedPayments ? failedPayments + " failed payments" : "", "No database sync failures detected"].filter(Boolean),
      yellow: [lowStock ? lowStock + " low-stock items" : "", pendingPo ? pendingPo + " pending purchase orders" : "", unpaidInvoices ? unpaidInvoices + " unpaid invoices" : "", overdueBalance ? overdueBalance + " overdue customer balances" : ""].filter(Boolean),
      green: [backupSuccess ? "Completed backups detected" : "Backup status unavailable", syncSuccess ? "Successful synchronizations detected" : "Synchronization status unavailable"]
    };
  }

  function renderAlertList(items) {
    if (!items || !items.length) return '<p class="muted small">No alerts</p>';
    return "<ul class=\"dashboard-alert-list\">" + items.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>";
  }

  function renderMiniChart(points, mode, moneyValue) {
    const rows = normalizeList(points).map(function (item) {
      return { label: firstText(item.label, item.date, item.month, "—"), value: Number(item.value || item.sales || item.total || 0) };
    });
    if (!rows.length) return '<div class="empty-state small">No chart data</div>';
    const values = rows.map(function (item) { return item.value; });
    const max = Math.max(1, Math.max.apply(Math, values));
    if (mode === "bar") {
      return '<div class="mini-bars">' + rows.map(function (item) {
        const pct = Math.max(2, Math.round(item.value / max * 100));
        return '<div class="mini-bars__row"><span>' + escapeHtml(item.label) + '</span><div class="mini-bars__bar"><i style="width:' + pct + '%"></i></div><strong>' + (moneyValue ? money(item.value) : numberText(item.value)) + "</strong></div>";
      }).join("") + "</div>";
    }
    const width = 360;
    const height = 110;
    const step = rows.length > 1 ? width / (rows.length - 1) : width;
    const path = rows.map(function (item, index) {
      const x = Math.round(index * step);
      const y = Math.round(height - item.value / max * height);
      return x + "," + y;
    }).join(" ");
    return '<svg class="mini-line-chart" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none"><polyline points="' + path + '" /></svg><div class="mini-line-chart__legend"><span>' + escapeHtml(rows[0].label) + '</span><span>' + escapeHtml(rows[rows.length - 1].label) + "</span></div>";
  }

  function orderedDashboardWidgets(widgets) {
    const order = normalizeList(state.ui.dashboardLayout && state.ui.dashboardLayout.order).map(String);
    if (!order.length) return widgets;
    const byKey = {};
    widgets.forEach(function (html) {
      const match = html.match(/data-widget-key="([^"]+)"/);
      if (match) byKey[match[1]] = html;
    });
    const sorted = [];
    order.forEach(function (key) { if (byKey[key]) sorted.push(byKey[key]); delete byKey[key]; });
    Object.keys(byKey).forEach(function (key) { sorted.push(byKey[key]); });
    return sorted;
  }

  function bindDashboardDragDrop() {
    const grid = document.getElementById("dashboardWidgetGrid");
    if (!grid) return;
    let dragEl = null;
    grid.querySelectorAll(".dashboard-widget").forEach(function (card) {
      card.addEventListener("dragstart", function () {
        dragEl = card;
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        dragEl = null;
        persistDashboardLayout(grid);
      });
      card.addEventListener("dragover", function (event) {
        event.preventDefault();
        if (!dragEl || dragEl === card) return;
        const rect = card.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        grid.insertBefore(dragEl, before ? card : card.nextSibling);
      });
    });
  }

  function persistDashboardLayout(grid) {
    const order = Array.from(grid.querySelectorAll(".dashboard-widget")).map(function (node) { return node.getAttribute("data-widget-key"); }).filter(Boolean);
    state.ui.dashboardLayout = { order: order };
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(state.ui.dashboardLayout));
  }

  function startDashboardAutoRefresh() {
    if (dashboardAutoRefreshTimer) window.clearInterval(dashboardAutoRefreshTimer);
    dashboardAutoRefreshTimer = window.setInterval(function () {
      if (state.activeModule !== "dashboard") return;
      loadDashboard().then(function () { if (state.activeModule === "dashboard") renderDashboard(); }).catch(function () {});
    }, 6e4);
  }

  function syncDashboardThemeControls() {
    document.querySelectorAll(".js-dashboard-theme").forEach(function (btn) {
      btn.textContent = "Theme: " + (state.ui.dashboardTheme === "light" ? "Light" : "Dark");
    });
  }

  function renderBrandingCard() {
    const branding = state.branding || {};
    const logoUrl = resolveBrandLogoUrl(branding);
    return '<section class="card brand-card"><div class="section-head"><h3>Business branding</h3></div><div class="brand-panel">' +
      '<img id="dashboardBrandLogo" class="brand-logo brand-logo--lg hidden" alt="Company logo" />' +
      '<div class="brand-panel__details">' +
        '<h4>' + escapeHtml(firstText(branding.business_name, branding.businessName, "UniquePOS")) + '</h4>' +
        '<p class="muted">' + escapeHtml(firstText(branding.tagline, "Official business branding applied across documents and exports.")) + '</p>' +
        '<div class="brand-panel__meta">' +
          '<span>' + escapeHtml(firstText(branding.business_phone, branding.businessPhone, "—")) + '</span>' +
          '<span>' + escapeHtml(firstText(branding.business_email, branding.businessEmail, "—")) + '</span>' +
        '</div>' +
      '</div>' +
    '</div></section>';
  }

  async function loadProducts() {
    const results = await Promise.all([
      apiJson("/api/products?limit=100").catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; }),
      apiJson("/api/brands").catch(function () { return []; }),
      apiJson("/api/suppliers?limit=100").catch(function () { return { data: [] }; }),
      apiJson("/api/branches/options").catch(function () { return []; }),
      apiJson("/api/products/imports").catch(function () { return { data: [] }; }),
      apiJson("/api/products/duplicates").catch(function () { return { data: [] }; })
    ]);
    state.moduleData.products = {
      products: normalizeList(results[0]),
      categories: normalizeList(results[1]),
      brands: normalizeList(results[2]),
      suppliers: normalizeList(results[3]),
      branches: normalizeList(results[4]),
      importJobs: normalizeList(results[5]),
      duplicates: normalizeList(results[6])
    };
    syncSelectedProducts(state.moduleData.products.products);
  }

  function renderProducts() {
    const body = moduleBody("products");
    const data = state.moduleData.products || {};
    const edit = state.ui.productEdit || {};
    const categoryEdit = state.ui.categoryEdit || {};
    const brandEdit = state.ui.brandEdit || {};
    const productsView = state.ui.productsView || "list";
    body.innerHTML = [
      renderFlash("products"),
      renderProductsBreadcrumb(productsView),
      renderProductsActionCard(productsView),
      productsView === "add" ? '<div class="module-grid two">' +
        '<section class="card"><div class="section-head"><h3>' + (edit.id ? "Edit product" : "Add product") + '</h3></div>' +
          '<form id="productForm" class="form-grid two">' +
            hiddenInput("id", edit.id) +
            (edit.id
              ? (isSuperAdmin()
                  ? textField("Product code", "product_code", edit.product_code, false)
                  : '<label><span>Product code</span><input type="text" name="product_code" value="' + escapeAttr(edit.product_code == null ? '' : edit.product_code) + '" readonly /></label>')
              : (isSuperAdmin()
                  ? textField("Product code", "product_code", edit.product_code, false, "Auto-generated")
                  : '<label><span>Product code</span><input type="text" name="product_code" value="" placeholder="Auto-generated" readonly /></label>')) +
            textField("Product name", "product_name", edit.product_name, true) +
            textField("Barcode", "barcode", edit.barcode) +
            textField("Unit", "unit", edit.unit, false, "pcs") +
            textField("Image URL", "image_url", edit.image_url) +
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
          '</form></section>' +
        '<section class="card"><div class="section-head"><h3>Reference data</h3></div>' +
          '<div class="stack gap-lg">' +
            '<div><h4>Categories</h4><form id="categoryForm" class="inline-form">' + hiddenInput("category_id", categoryEdit.id) + '<input name="name" placeholder="Category name" value="' + escapeAttr(categoryEdit.name) + '" required /><button type="submit">' + (categoryEdit.id ? "Update" : "Add") + '</button><button type="button" class="secondary" id="categoryResetBtn">Clear</button></form>' + renderSimpleList(data.categories, "category") + '</div>' +
            '<div><h4>Brands</h4><form id="brandForm" class="inline-form">' + hiddenInput("brand_id", brandEdit.id) + '<input name="name" placeholder="Brand name" value="' + escapeAttr(brandEdit.name) + '" required /><button type="submit">' + (brandEdit.id ? "Update" : "Add") + '</button><button type="button" class="secondary" id="brandResetBtn">Clear</button></form>' + renderSimpleList(data.brands, "brand") + '</div>' +
          '</div></section>' +
        '</div>' : "",
      productsView === "import" ? renderProductBulkToolsCard(data) + renderProductImportPreviewCard() + renderProductImportHistoryCard(data) : "",
      productsView === "list" ? renderTableCard("Product List", ["", "Code", "Name", "Category", "Brand", "Stock", "Price", "Actions"], (data.products || []).map(function (product) {
        return [
          '<input type="checkbox" class="js-product-select" data-id="' + escapeAttr(product.id) + '"' + (state.ui.selectedProducts[String(product.id)] ? ' checked' : '') + ' />',
          escapeHtml(firstText(product.product_code, "—")),
          escapeHtml(firstText(product.product_name, "—")),
          escapeHtml(firstText(product.category_name, "—")),
          escapeHtml(firstText(product.brand_name, "—")),
          escapeHtml(String(Number(product.current_stock || 0))) + ' / min ' + escapeHtml(String(Number(product.min_stock || 0))),
          money(product.selling_price),
          actionButtons([
            { cls: "js-edit-product", label: "Edit", id: product.id },
            { cls: "js-delete-product", label: "Delete", id: product.id, tone: "danger" },
            !product.barcode ? { cls: "js-barcode-product", label: "Barcode", id: product.id, tone: "secondary" } : null,
            product.barcode ? { cls: "js-label-product", label: "Label PDF", id: product.id, tone: "secondary" } : null
          ])
        ];
      }), "No products available.") : ""
    ].join("");

    bindRowActions(body, {
      ".js-products-view": function (event) {
        var nextView = event.currentTarget.dataset.view || "list";
        // Reset import state when leaving the import view
        if (state.ui.productsView === "import" && nextView !== "import") {
          state.ui.productImportFile = null;
          state.ui.productImport = { job: null, headers: [], mapping: {}, preview: [], total: 0, loading: false };
        }
        state.ui.productsView = nextView;
        renderProducts();
      }
    });
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
        state.ui.productsView = "add";
        renderProducts();
      },
      ".js-delete-product": function (event) {
        deleteProduct(event.currentTarget.dataset.id);
      },
      ".js-barcode-product": function (event) {
        generateBarcode(event.currentTarget.dataset.id);
      },
      ".js-label-product": function (event) {
        window.open("/api/products/barcode-labels.pdf?ids=" + encodeURIComponent(String(event.currentTarget.dataset.id)), "_blank", "noopener");
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
      },
      ".js-import-open": function (event) {
        viewProductImport(event.currentTarget.dataset.id);
      },
      ".js-import-undo": function (event) {
        undoProductImport(event.currentTarget.dataset.id);
      },
      ".js-import-errors": function (event) {
        window.open("/api/products/imports/" + encodeURIComponent(event.currentTarget.dataset.id) + "/errors.csv", "_blank", "noopener");
      },
      ".js-import-fix-row": function (event) {
        Promise.resolve(handleProductImportFixRow(event.currentTarget)).catch(handleActionError);
      }
    });
    body.querySelectorAll(".js-product-select").forEach(function (input) {
      input.addEventListener("change", function () {
        state.ui.selectedProducts[String(input.dataset.id)] = input.checked;
      });
    });
    bindClick("productImportParseBtn", handleProductImportParse);
    bindClick("productImportRemapBtn", handleProductImportRemap);
    bindClick("productImportStartBtn", handleProductImportStart);
    bindClick("productQuickPrintBtn", openSelectedBarcodeLabels);
    bindClick("productBulkPriceBtn", handleBulkPriceUpdate);
    bindClick("productBulkStockBtn", handleBulkStockUpdate);
    bindClick("productBulkCategoryBtn", handleBulkCategoryReassign);
    bindClick("productBulkImagesBtn", handleBulkImageUpdate);
    bindClick("productDuplicateRefreshBtn", refreshProductDuplicates);
    bindClick("productBarcodeLabelsBtn", openSelectedBarcodeLabels);
    bindProductImportFileHandlers();
  }

  function renderProductsBreadcrumb(view) {
    const trail = ["Dashboard", "Inventory", "Products"];
    if (view === "import") trail.push("Import");
    if (view === "add") trail.push("Add Product");
    return '<div class="products-breadcrumb">' + trail.map(escapeHtml).join(' <span>→</span> ') + '</div>';
  }

  function renderProductsActionCard(view) {
    function actionButton(target, icon, label) {
      return '<button type="button" class="products-action-btn js-products-view ' + (view === target ? "active" : "") + '" data-view="' + escapeAttr(target) + '">' + icon + " " + escapeHtml(label) + '</button>';
    }
    return '<section class="card"><div class="section-head"><h3>Products</h3></div><div class="products-action-grid">' +
      actionButton("list", "📋", "Product List") +
      actionButton("add", "➕", "Add Product") +
      actionButton("import", "📥", "Import Products") +
      '<a class="products-action-btn products-action-link" href="/api/products/export.xlsx">📤 Export Products</a>' +
      '<button type="button" class="products-action-btn secondary" id="productQuickPrintBtn">🏷️ Print Barcode Labels</button>' +
    '</div></section>';
  }

  function renderProductBulkToolsCard(data) {
    const info = state.ui.productImport || {};
    const mapping = info.mapping || {};
    const headers = info.headers || [];
    const isLoading = Boolean(info.loading);
    const importStarted = Boolean(info.job && ["queued", "processing"].includes(info.job.status));
    const hasJob = Boolean(info.job && !isLoading);
    const selectedFile = state.ui.productImportFile;
    var dropzoneText = isLoading
      ? "\u23F3 Reading file\u2026 please wait"
      : selectedFile
        ? "\u2705 " + escapeHtml(selectedFile.name) + " \u2014 click to change"
        : "\u2B06 Click here or drag & drop an Excel (.xlsx), CSV, or PDF file";
    return '<section class="card"><div class="section-head"><h3>Import products</h3></div><div class="stack gap-lg">' +
      '<div class="stack gap-sm">' +
        '<h4>1) Choose your file</h4>' +
        '<div class="dropzone' + (isLoading ? ' dropzone--loading' : '') + '" id="productImportDropzone" style="cursor:pointer">' + dropzoneText + '</div>' +
        '<input id="productImportFile" type="file" accept=".xlsx,.csv,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" />' +
        '<p class="muted small">Columns are auto-detected. <a href="/api/products/imports/templates/csv">Download CSV template</a> \u00b7 <a href="/api/products/imports/templates/xlsx">Download Excel template</a></p>' +
      '</div>' +
      '<div class="form-actions"><button type="button" id="productImportStartBtn"' + (!hasJob || importStarted || isLoading ? " disabled" : "") + '>Import Products</button></div>' +
      '<details class="advanced-settings"><summary>Advanced Settings</summary>' +
        '<div class="stack gap-sm advanced-settings__body">' +
          '<label><span>Paste rows from a spreadsheet</span><textarea id="productImportPaste" placeholder="Paste rows directly from Excel or Google Sheets"></textarea></label>' +
          '<div class="form-actions"><button type="button" id="productImportParseBtn">Preview pasted rows</button></div>' +
          '<div class="inline-form">' +
            '<label><span>Duplicate handling</span><select id="productImportDuplicateMode"><option value="update">Update existing</option><option value="skip">Skip duplicates</option><option value="duplicate">Create duplicates</option></select></label>' +
            checkField("Create missing categories, brands, and suppliers automatically", "productImportAutoCreate", true) +
          '</div>' +
          '<div class="module-grid three">' + Object.keys(PRODUCT_IMPORT_FIELDS).map(function (field) {
            return '<label><span>' + escapeHtml(mapFieldLabel(field)) + '</span><select class="js-import-map" data-field="' + escapeAttr(field) + '"><option value="">Auto detect</option>' + headers.map(function (header) {
              return '<option value="' + escapeAttr(header) + '"' + (mapping[field] === header ? ' selected' : '') + '>' + escapeHtml(header) + '</option>';
            }).join("") + '</select></label>';
          }).join("") + '</div>' +
          '<div class="form-actions"><button type="button" id="productImportRemapBtn">Revalidate mapping</button></div>' +
          renderProductDuplicatesCard(data) +
        '</div>' +
      '</details>' +
      (renderProductImportSummaryCard(info.job, true) || "") +
      '<div class="stack gap-sm">' +
        '<h4>Other bulk tools</h4>' +
        '<div class="inline-form">' +
          '<label><span>Price update</span><select id="productBulkPriceMode"><option value=\"percentage\">Percentage</option><option value=\"amount\">Amount</option></select></label>' +
          '<label><span>Target</span><select id="productBulkPriceTarget"><option value=\"selling_price\">Selling price</option><option value=\"cost_price\">Cost price</option><option value=\"both\">Both</option></select></label>' +
          '<label><span>Value</span><input id="productBulkPriceValue" type=\"number\" step=\"0.01\" /></label>' +
          '<button type=\"button\" id=\"productBulkPriceBtn\">Apply price update</button>' +
        '</div>' +
        '<div class="inline-form">' +
          '<label><span>Stock mode</span><select id=\"productBulkStockMode\"><option value=\"add\">Add</option><option value=\"subtract\">Subtract</option><option value=\"set\">Set exact</option></select></label>' +
          '<label><span>Quantity</span><input id=\"productBulkStockValue\" type=\"number\" step=\"1\" /></label>' +
          '<label><span>Reason</span><input id=\"productBulkStockReason\" type=\"text\" placeholder=\"Bulk correction\" /></label>' +
          '<button type=\"button\" id=\"productBulkStockBtn\">Adjust stock</button>' +
        '</div>' +
        '<div class=\"inline-form\">' +
          '<label><span>Reassign category</span><select id=\"productBulkCategoryId\"><option value=\"\">Select\u2026</option>' + optionTags(data.categories || [], null) + '</select></label>' +
          '<label><span>Or new category</span><input id=\"productBulkCategoryName\" type=\"text\" placeholder=\"Create if missing\" /></label>' +
          '<button type=\"button\" id=\"productBulkCategoryBtn\">Update category</button>' +
        '</div>' +
        '<div class=\"stack gap-sm\">' +
          '<label><span>Bulk image URL updates</span><textarea id=\"productBulkImagesText\" placeholder=\"product_code,image_url\\nSKU-001,https://example.com/image.jpg\"></textarea></label>' +
          '<div class=\"form-actions\"><button type=\"button\" id=\"productBulkImagesBtn\">Apply image URLs</button><button type=\"button\" class=\"secondary\" id=\"productBarcodeLabelsBtn\">Barcode labels PDF</button><a class=\"button-link\" href=\"/api/products/export.xlsx\">Export Excel</a><a class=\"button-link\" href=\"/api/products/export.pdf\">Export PDF</a><button type=\"button\" class=\"secondary\" id=\"productDuplicateRefreshBtn\">Refresh duplicates</button></div>' +
        '</div>' +
      '</div>' +
    '</div></section>';
  }

  function renderProductImportPreviewCard() {
    const info = state.ui.productImport || {};
    if (!info.job) return "";
    const previewRows = info.preview || [];
    const errorRows = previewRows.filter(function (row) { return Array.isArray(row.validation_errors) && row.validation_errors.length; });
    const validRows = previewRows.length - errorRows.length;
    var summaryLine = validRows + " product" + (validRows === 1 ? "" : "s") + " ready to import.";
    if (errorRows.length) summaryLine += " " + errorRows.length + " row" + (errorRows.length === 1 ? "" : "s") + " cannot be imported yet — fix them below.";
    return '<section class="card"><div class="section-head"><h3>2) Preview &amp; confirm</h3></div>' +
      '<div class="stack gap-lg">' +
        '<p class="muted small">' + escapeHtml(summaryLine) + ' Click <strong>Import Products</strong> above when you are ready.</p>' +
        renderTable(["Row", "SKU", "Product Name", "Action", "Status"], previewRows.slice(0, 25).map(function (row) {
          var hasErrors = Array.isArray(row.validation_errors) && row.validation_errors.length;
          return [
            escapeHtml(String(row.row_number)),
            escapeHtml(firstText(row.normalized_data && row.normalized_data.product_code, row.raw_data && row.raw_data["Product Code"], "\u2014")),
            escapeHtml(firstText(row.normalized_data && row.normalized_data.product_name, row.raw_data && row.raw_data["Product Name"], "\u2014")),
            escapeHtml(firstText(row.action, "create")),
            hasErrors ? '<span style="color:#f87171">\u26A0 Has errors</span>' : escapeHtml(firstText(row.status, "preview"))
          ];
        }), "No preview rows available.") +
        (errorRows.length ? '<div><h4 style="color:#f87171">\u26A0 Rows that need fixing (' + errorRows.length + ')</h4><p class="muted small">Only these rows are blocked. Fill in the missing values and click <strong>Fix row</strong> to clear the error — you do not need to re-upload the whole file.</p>' +
        errorRows.slice(0, 25).map(function (row) {
          var nd = row.normalized_data || {};
          var needsName = !nd.product_name;
          var needsPrice = nd.selling_price == null;
          var reasons = (row.validation_errors || []).join(" \u2022 ");
          return '<div class="import-row-fix" data-row-id="' + escapeAttr(String(row.id)) + '" data-job-id="' + escapeAttr(String(info.job.id)) + '" style="border:1px solid #f87171;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.5rem">' +
            '<div style="font-weight:600;margin-bottom:0.25rem">Row ' + escapeHtml(String(row.row_number)) + (nd.product_name ? ' \u2014 ' + escapeHtml(nd.product_name) : '') + '</div>' +
            '<p class="muted small" style="color:#f87171;margin-bottom:0.5rem">' + escapeHtml(reasons) + '</p>' +
            '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end">' +
              (needsName ? '<label style="flex:1;min-width:180px"><span class="muted small">Product Name</span><input type="text" class="import-fix-name" placeholder="Enter product name" value="' + escapeAttr(nd.product_name || '') + '" /></label>' : '') +
              (needsPrice ? '<label style="flex:0 0 140px"><span class="muted small">Selling Price (KES)</span><input type="number" step="0.01" min="0" class="import-fix-price" placeholder="0.00" value="' + escapeAttr(nd.selling_price != null ? String(nd.selling_price) : '') + '" /></label>' : '') +
              '<button type="button" class="js-import-fix-row secondary" style="align-self:flex-end">Fix row</button>' +
            '</div>' +
          '</div>';
        }).join("") + '</div>' : "") +
        renderProductImportSummaryCard(info.job) +
      '</div></section>';
  }

  function renderProductImportSummaryCard(job, compact) {
    if (!job) return "";
    return '<div class="import-summary' + (compact ? " compact" : "") + '">' +
      '<span class="badge badge-' + escapeAttr(firstText(job.status, "draft").toLowerCase()) + '">' + escapeHtml(titleize(firstText(job.status, "draft"))) + '</span>' +
      '<span><strong>Imported:</strong> ' + escapeHtml(String(Number(job.created_count || 0))) + '</span>' +
      '<span><strong>Updated:</strong> ' + escapeHtml(String(Number(job.updated_count || 0))) + '</span>' +
      '<span><strong>Skipped:</strong> ' + escapeHtml(String(Number(job.skipped_rows || 0))) + '</span>' +
      '<span><strong>Errors:</strong> ' + escapeHtml(String(Number(job.error_count || 0))) + '</span>' +
    '</div>';
  }

  function renderProductImportHistoryCard(data) {
    return renderTableCard("Import history", ["ID", "Source", "Status", "Rows", "Processed", "Actions"], (data.importJobs || []).slice(0, 10).map(function (job) {
      return [
        escapeHtml(String(job.id)),
        escapeHtml(firstText(job.source_name, job.file_name, job.source_type, "—")),
        renderBadge(firstText(job.status, "draft")),
        escapeHtml(String(Number(job.total_rows || 0))),
        escapeHtml(String(Number(job.processed_rows || 0))),
        actionButtons([
          { cls: "js-import-open", label: "Open", id: job.id, tone: "secondary" },
          job.status === "completed" && !job.undone_at ? { cls: "js-import-undo", label: "Undo", id: job.id, tone: "danger" } : null,
          Number(job.error_count || 0) > 0 ? { cls: "js-import-errors", label: "Errors CSV", id: job.id, tone: "secondary" } : null
        ])
      ];
    }), "No import history yet.");
  }

  function renderProductDuplicatesCard(data) {
    return renderTableCard("Duplicate detection", ["Type", "Value", "Count", "Product IDs"], (data.duplicates || []).slice(0, 10).map(function (row) {
      return [
        escapeHtml(firstText(row.duplicate_type, "—")),
        escapeHtml(firstText(row.duplicate_value, "—")),
        escapeHtml(String(Number(row.duplicate_count || 0))),
        escapeHtml(Array.isArray(row.product_ids) ? row.product_ids.join(", ") : "—")
      ];
    }), "No duplicate products detected.");
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
      image_url: optionalString(form, "image_url"),
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

  function syncSelectedProducts(products) {
    const next = {};
    (products || []).forEach(function (product) {
      const key = String(product.id);
      next[key] = Boolean(state.ui.selectedProducts[key]);
    });
    state.ui.selectedProducts = next;
  }

  function selectedProductIds() {
    return Object.keys(state.ui.selectedProducts).filter(function (id) { return state.ui.selectedProducts[id]; }).map(function (id) { return Number(id); });
  }

  function bindProductImportFileHandlers() {
    const fileInput = document.getElementById("productImportFile");
    const dropzone = document.getElementById("productImportDropzone");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        state.ui.productImportFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (state.ui.productImportFile) {
          Promise.resolve(handleProductImportParse()).catch(handleActionError);
        }
      });
    }
    if (dropzone) {
      // Click on dropzone opens the hidden file picker
      dropzone.addEventListener("click", function () {
        if (fileInput) fileInput.click();
      });
      ["dragenter", "dragover"].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropzone.classList.add("dropzone--active");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropzone.classList.remove("dropzone--active");
        });
      });
      dropzone.addEventListener("drop", function (event) {
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) {
          state.ui.productImportFile = file;
          if (fileInput) {
            try { fileInput.files = event.dataTransfer.files; } catch (_error) {}
          }
          Promise.resolve(handleProductImportParse()).catch(handleActionError);
        }
      });
    }
  }

  async function handleProductImportParse() {
    const pasteText = valueById("productImportPaste");
    const file = state.ui.productImportFile;

    if (!file && !pasteText) {
      throw new Error("Choose an import file or paste spreadsheet rows first.");
    }

    // Show loading state immediately so the user knows something is happening
    state.ui.productImport = Object.assign({}, state.ui.productImport, { loading: true });
    renderProducts();

    try {
      let result;
      if (file) {
        // Send the file as raw bytes to the combined upload-and-parse endpoint.
        // This single request eliminates the old two-step upload flow and the
        // super_admin permission barrier that blocked managers and storekeepers.
        // It also avoids multi-replica file loss (no temp disk storage needed).
        const fileBuffer = await file.arrayBuffer();
        const safeFilename = encodeURIComponent(file.name);
        const contentType = file.type || "application/octet-stream";
        const response = await authorizedFetch(
          "/api/products/imports/upload-and-parse?filename=" + safeFilename,
          {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: fileBuffer
          }
        );
        if (!response.ok) {
          const errorBody = await response.json().catch(function () { return {}; });
          if (response.status === 401) {
            clearSession();
            await routeAfterAuthChange({ showExpiredMessage: true });
            throw new Error("__AUTH_REDIRECT__");
          }
          throw new Error(firstText(errorBody.error, errorBody.message, "File upload failed."));
        }
        result = await response.json();
      } else {
        // Paste-text path: keep existing behaviour
        result = await apiJson("/api/products/imports/parse", {
          method: "POST",
          body: JSON.stringify({
            source_type: "paste",
            source_name: "Pasted spreadsheet data",
            file_name: null,
            object_path: null,
            paste_text: pasteText
          })
        });
      }

      state.ui.productImport = {
        job: result.job,
        headers: result.headers || [],
        mapping: result.mapping || {},
        preview: normalizeList(result.preview || result.rows || []),
        total: Number(result.job && result.job.total_rows || 0),
        loading: false
      };
      var errorCount = Number(result.job && result.job.error_count || 0);
      var totalRows = Number(result.job && result.job.total_rows || 0);
      var successMsg = "Preview ready: " + totalRows + " product" + (totalRows === 1 ? "" : "s") + " found.";
      if (errorCount) successMsg += " " + errorCount + " row" + (errorCount === 1 ? "" : "s") + " have issues — see below.";
      successMsg += " Click \u201cImport Products\u201d to save.";
      setFlash("products", "success", successMsg);
      await loadProducts();
      renderProducts();
    } catch (err) {
      // Clear loading state before re-throwing so the dropzone shows normally
      state.ui.productImport = Object.assign({}, state.ui.productImport, { loading: false });
      throw err;
    }
  }

  async function viewProductImport(id) {
    const result = await apiJson("/api/products/imports/" + id + "?limit=100");
    state.ui.productImport = {
      job: result.job,
      headers: Object.keys(((result.rows || [])[0] || {}).raw_data || {}),
      mapping: result.job && result.job.column_mapping || {},
      preview: normalizeList(result.rows),
      total: Number(result.total || 0)
    };
    if (result.job && ["queued", "processing"].includes(result.job.status)) {
      scheduleProductImportRefresh(id);
    } else {
      stopProductImportRefresh();
    }
    renderProducts();
  }

  async function handleProductImportRemap() {
    const info = state.ui.productImport;
    if (!info.job) throw new Error("Prepare an import preview first.");
    const mapping = {};
    document.querySelectorAll(".js-import-map").forEach(function (select) {
      if (select.value) mapping[select.dataset.field] = select.value;
    });
    const result = await apiJson("/api/products/imports/" + info.job.id + "/remap", {
      method: "POST",
      body: JSON.stringify({ mapping: mapping })
    });
    state.ui.productImport = {
      job: result.job,
      headers: info.headers,
      mapping: result.mapping || mapping,
      preview: normalizeList(result.preview),
      total: Number(result.job && result.job.total_rows || 0)
    };
    setFlash("products", "success", "Import mapping revalidated.");
    renderProducts();
  }

  async function handleProductImportStart() {
    const info = state.ui.productImport;
    if (!info.job) throw new Error("Prepare an import preview first.");
    const duplicateMode = document.getElementById("productImportDuplicateMode");
    const autoCreate = document.querySelector('input[name="productImportAutoCreate"]');
    const result = await apiJson("/api/products/imports/" + info.job.id + "/start", {
      method: "POST",
      body: JSON.stringify({
        on_duplicate: duplicateMode ? duplicateMode.value : "update",
        auto_create_references: autoCreate ? autoCreate.checked : true
      })
    });
    state.ui.productImport.job = result.job;
    scheduleProductImportRefresh(info.job.id);
    setFlash("products", "success", "Import started. We are processing your products.");
    await loadProducts();
    renderProducts();
  }

  function scheduleProductImportRefresh(id) {
    stopProductImportRefresh();
    window.__uniqueposProductImportPoll = window.setInterval(function () {
      apiJson("/api/products/imports/" + id + "?limit=100").then(function (result) {
        state.ui.productImport = {
          job: result.job,
          headers: Object.keys(((result.rows || [])[0] || {}).raw_data || state.ui.productImport.headers || {}),
          mapping: result.job && result.job.column_mapping || state.ui.productImport.mapping || {},
          preview: normalizeList(result.rows),
          total: Number(result.total || 0)
        };
        if (result.job && !["queued", "processing"].includes(result.job.status)) {
          stopProductImportRefresh();
          state.ui.productsView = "list";
          setFlash("products", "success", "Import finished. Imported " + Number(result.job.created_count || 0) + ", updated " + Number(result.job.updated_count || 0) + ", skipped " + Number(result.job.skipped_rows || 0) + ", with " + Number(result.job.error_count || 0) + " errors.");
          loadProducts().then(renderProducts);
          return;
        }
        renderProducts();
      }).catch(stopProductImportRefresh);
    }, 3000);
  }

  function stopProductImportRefresh() {
    if (window.__uniqueposProductImportPoll) {
      window.clearInterval(window.__uniqueposProductImportPoll);
      window.__uniqueposProductImportPoll = 0;
    }
  }

  async function handleProductImportFixRow(button) {
    const container = button.closest(".import-row-fix");
    if (!container) return;
    const jobId = container.dataset.jobId;
    const rowId = container.dataset.rowId;
    const nameInput = container.querySelector(".import-fix-name");
    const priceInput = container.querySelector(".import-fix-price");
    const updates = {};
    if (nameInput) updates.product_name = nameInput.value.trim();
    if (priceInput) {
      var rawPrice = priceInput.value.trim();
      if (rawPrice !== "") {
        var parsedPrice = parseFloat(rawPrice);
        if (!isFinite(parsedPrice)) throw new Error("Selling Price must be a valid number.");
        updates.selling_price = parsedPrice;
      } else {
        updates.selling_price = null;
      }
    }
    button.disabled = true;
    button.textContent = "Saving\u2026";
    try {
      const result = await apiJson("/api/products/imports/" + jobId + "/rows/" + rowId, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      const preview = state.ui.productImport.preview || [];
      state.ui.productImport.preview = preview.map(function (r) {
        if (String(r.id) === String(rowId)) return result.row;
        return r;
      });
      if (state.ui.productImport.job) {
        state.ui.productImport.job.error_count = result.job_error_count;
        state.ui.productImport.job.valid_rows = result.job_valid_rows;
      }
      if (result.valid) {
        setFlash("products", "success", "Row fixed and ready to import.");
      } else {
        setFlash("products", "warning", "Row updated but still has issues: " + (result.row.validation_errors || []).join(" \u2022 "));
      }
    } catch (err) {
      button.disabled = false;
      button.textContent = "Fix row";
      throw err;
    }
    renderProducts();
  }

  async function undoProductImport(id) {
    if (!window.confirm("Undo this completed import? Only the most recent completed import can be undone.")) return;
    await apiJson("/api/products/imports/" + id + "/undo", { method: "POST", body: JSON.stringify({}) });
    setFlash("products", "success", "Bulk import undone.");
    await loadProducts();
    renderProducts();
  }

  async function handleBulkPriceUpdate() {
    const ids = selectedProductIds();
    await apiJson("/api/products/bulk/price-updates", {
      method: "POST",
      body: JSON.stringify({
        product_ids: ids,
        mode: document.getElementById("productBulkPriceMode").value,
        target: document.getElementById("productBulkPriceTarget").value,
        value: Number(document.getElementById("productBulkPriceValue").value)
      })
    });
    setFlash("products", "success", "Bulk price update applied.");
    await loadProducts();
    renderProducts();
  }

  async function handleBulkStockUpdate() {
    const ids = selectedProductIds();
    await apiJson("/api/products/bulk/stock-adjustments", {
      method: "POST",
      body: JSON.stringify({
        product_ids: ids,
        mode: document.getElementById("productBulkStockMode").value,
        quantity: Number(document.getElementById("productBulkStockValue").value),
        reason: document.getElementById("productBulkStockReason").value
      })
    });
    setFlash("products", "success", "Bulk stock adjustment applied.");
    await loadProducts();
    renderProducts();
  }

  async function handleBulkCategoryReassign() {
    const ids = selectedProductIds();
    await apiJson("/api/products/bulk/category-reassign", {
      method: "POST",
      body: JSON.stringify({
        product_ids: ids,
        category_id: numberById("productBulkCategoryId"),
        category_name: valueById("productBulkCategoryName")
      })
    });
    setFlash("products", "success", "Bulk category reassignment applied.");
    await loadProducts();
    renderProducts();
  }

  async function handleBulkImageUpdate() {
    const lines = valueById("productBulkImagesText").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    const updates = lines.map(function (line) {
      const parts = line.split(",");
      return { product_code: trimText(parts[0]), image_url: trimText(parts.slice(1).join(",")) };
    }).filter(function (item) { return item.product_code && item.image_url; });
    await apiJson("/api/products/bulk/image-urls", {
      method: "POST",
      body: JSON.stringify({ updates: updates })
    });
    setFlash("products", "success", "Bulk image URL update applied.");
    await loadProducts();
    renderProducts();
  }

  async function refreshProductDuplicates() {
    await loadProducts();
    renderProducts();
  }

  function openSelectedBarcodeLabels() {
    const ids = selectedProductIds();
    if (!ids.length) throw new Error("Select at least one product first.");
    window.open("/api/products/barcode-labels.pdf?ids=" + encodeURIComponent(ids.join(",")), "_blank", "noopener");
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
      apiJson("/api/inventory/stock-count").catch(function () { return []; }),
      apiJson("/api/inventory/movements?limit=25").catch(function () { return { data: [] }; }),
      apiJson("/api/inventory/transfers?limit=25").catch(function () { return { data: [] }; }),
      apiJson("/api/products?limit=100").catch(function () { return { data: [] }; }),
      apiJson("/api/branches/options").catch(function () { return []; })
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
    var checkout = state.ui.posCheckout;
    var [salesResult, catResult, brandResult, custResult, quotesResult, invResult] = await Promise.all([
      apiJson("/api/pos/sales?limit=25").catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; }),
      apiJson("/api/brands").catch(function () { return []; }),
      apiJson("/api/customers?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/quotations?limit=25").catch(function () { return { data: [] }; }),
      apiJson("/api/invoices?limit=25").catch(function () { return { data: [] }; })
    ]);
    checkout.categories = normalizeList(catResult);
    checkout.brands = normalizeList(brandResult);
    checkout.customers = normalizeList(custResult);
    if (!checkout.products.length) {
      var prodResult = await apiJson("/api/products?limit=30").catch(function () { return { data: [] }; });
      checkout.products = normalizeList(prodResult);
    }
    state.moduleData.sales = {
      sales: normalizeList(salesResult),
      products: checkout.products,
      customers: normalizeList(custResult),
      quotations: normalizeList(quotesResult),
      invoices: normalizeList(invResult)
    };
  }

  function renderSales() {
    var body = moduleBody("sales");
    var checkout = state.ui.posCheckout;
    if (checkout.view === "history") {
      renderSalesHistoryView(body);
      return;
    }
    renderPosCheckout(body, checkout);
  }

  function renderSalesHistoryView(body) {
    var data = state.moduleData.sales || {};
    var composer = state.ui.salesComposer;
    body.innerHTML = [
      renderFlash("sales"),
      '<div class="pos-view-toggle">' +
        '<button type="button" class="secondary small" id="posBackToCheckoutBtn">← Back to Checkout</button>' +
      '</div>',
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

    bindClick("posBackToCheckoutBtn", function () {
      state.ui.posCheckout.view = "checkout";
      renderSales();
    });
    bindForm("salesComposerForm", handleSalesComposer);
    bindClick("salesAddRowBtn", function () {
      state.ui.salesComposer.rows += 1;
      renderSalesHistoryView(body);
    });
    var documentType = document.getElementById("salesDocumentType");
    if (documentType) {
      documentType.addEventListener("change", function () {
        state.ui.salesComposer.type = documentType.value;
        renderSalesHistoryView(body);
      });
    }
    bindRowActions(body, {
      ".js-sales-tab": function (event) {
        state.ui.salesTab = event.currentTarget.dataset.tab;
        renderSalesHistoryView(body);
      },
      ".js-delete-quotation": function (event) { deleteQuotation(event.currentTarget.dataset.id); },
      ".js-convert-quotation": function (event) { convertQuotation(event.currentTarget.dataset.id); },
      ".js-send-quotation": function (event) { updateQuotation(event.currentTarget.dataset.id, { status: "sent" }); },
      ".js-pay-invoice": function (event) { payInvoice(event.currentTarget.dataset.id); },
      ".js-update-invoice-status": function (event) { updateInvoiceStatus(event.currentTarget.dataset.id); },
      ".js-print-quotation": function (event) { openDocumentPrint("quotation", event.currentTarget.dataset.id, "a4"); },
      ".js-pdf-quotation": function (event) { openDocumentPdf("quotation", event.currentTarget.dataset.id); },
      ".js-email-quotation": function (event) { emailDocument("quotation", event.currentTarget.dataset.id); },
      ".js-whatsapp-quotation": function (event) { shareDocumentWhatsapp("quotation", event.currentTarget.dataset.id); },
      ".js-print-invoice": function (event) { openDocumentPrint("invoice", event.currentTarget.dataset.id, "a4"); },
      ".js-print-receipt": function (event) {
        var paper = window.prompt("Paper size: 58mm, 80mm or a4", "80mm");
        openDocumentPrint("receipt", event.currentTarget.dataset.id, paper || "80mm");
      },
      ".js-pdf-invoice": function (event) { openDocumentPdf("invoice", event.currentTarget.dataset.id); },
      ".js-pdf-receipt": function (event) { openDocumentPdf("receipt", event.currentTarget.dataset.id); },
      ".js-email-invoice": function (event) { emailDocument("invoice", event.currentTarget.dataset.id); },
      ".js-email-receipt": function (event) { emailDocument("receipt", event.currentTarget.dataset.id); },
      ".js-whatsapp-invoice": function (event) { shareDocumentWhatsapp("invoice", event.currentTarget.dataset.id); },
      ".js-whatsapp-receipt": function (event) { shareDocumentWhatsapp("receipt", event.currentTarget.dataset.id); },
      ".js-remove-sales-row": function () {
        state.ui.salesComposer.rows = Math.max(1, state.ui.salesComposer.rows - 1);
        renderSalesHistoryView(body);
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
    return renderTableCard("POS Sales History", ["Receipt", "Invoice #", "Customer", "Cashier", "Items", "Total", "Paid", "Method", "Status", "Date", "Actions"], (data.sales || []).map(function (item) {
      return [
        escapeHtml(firstText(item.receipt_number, "—")),
        escapeHtml(firstText(item.invoice_number, "—")),
        escapeHtml(firstText(item.customer_name, "Walk-in")),
        escapeHtml(firstText(item.cashier_name, "—")),
        escapeHtml(String((item.items || []).length)),
        money(item.total),
        money(item.amount_paid),
        escapeHtml(firstText(item.payment_method, "—")),
        renderBadge(firstText(item.status, "completed")),
        escapeHtml(formatDateTime(item.created_at)),
        actionButtons([
          { cls: "js-print-receipt", label: "🖨 Print", id: item.id, tone: "secondary" },
          { cls: "js-pdf-receipt", label: "PDF", id: item.id, tone: "secondary" },
          { cls: "js-whatsapp-receipt", label: "💬 WhatsApp", id: item.id, tone: "secondary" },
          { cls: "js-email-receipt", label: "✉ Email", id: item.id, tone: "secondary" }
        ])
      ];
    }), "No POS sales yet.");
  }

  // =============================================
  // POS CHECKOUT — modern two-panel checkout UI
  // =============================================

  var posSearchTimer = null;
  var posFlashTimer = null;

  function renderPosCheckout(body, checkout) {
    var categories = checkout.categories || [];
    var brands = checkout.brands || [];
    var customers = checkout.customers || [];

    var catChips = '<button type="button" class="pos-chip' + (!checkout.filter_category ? ' active' : '') + ' js-pos-cat" data-cat="">All</button>' +
      categories.map(function (c) {
        return '<button type="button" class="pos-chip' + (String(checkout.filter_category) === String(c.id) ? ' active' : '') + ' js-pos-cat" data-cat="' + escapeAttr(String(c.id)) + '">' + escapeHtml(c.name) + '</button>';
      }).join('');

    var brandChips = '<button type="button" class="pos-chip' + (!checkout.filter_brand ? ' active' : '') + ' js-pos-brand" data-brand="">All Brands</button>' +
      brands.slice(0, 15).map(function (b) {
        return '<button type="button" class="pos-chip' + (String(checkout.filter_brand) === String(b.id) ? ' active' : '') + ' js-pos-brand" data-brand="' + escapeAttr(String(b.id)) + '">' + escapeHtml(b.name) + '</button>';
      }).join('');

    var customerOptions = '<option value="">👤 Walk-in Customer</option>' +
      customers.map(function (c) {
        return '<option value="' + escapeAttr(String(c.id)) + '"' + (String(checkout.customer_id) === String(c.id) ? ' selected' : '') + '>' + escapeHtml(c.name) + (c.company ? ' (' + escapeHtml(c.company) + ')' : '') + '</option>';
      }).join('');

    var paymentLabels = { cash: '💵 Cash', mpesa: '📱 M-Pesa', card: '💳 Card', bank_transfer: '🏦 Bank', credit: '🧾 Credit', split: '⚡ Mixed' };
    var paymentBtns = ['cash', 'mpesa', 'card', 'bank_transfer', 'credit', 'split'].map(function (m) {
      return '<button type="button" class="pos-pay-btn js-pos-payment' + (checkout.payment_method === m ? ' active' : '') + '" data-method="' + escapeAttr(m) + '">' + escapeHtml(paymentLabels[m] || m) + '</button>';
    }).join('');

    var splitUI = checkout.payment_method === 'split' ? [
      '<div class="pos-split-payment" id="posSplitPayment">',
        '<div class="pos-split-row">',
          '<label>1st Payment</label>',
          '<select id="posSplit1Method"><option value="cash">💵 Cash</option><option value="mpesa">📱 M-Pesa</option><option value="card">💳 Card</option><option value="bank_transfer">🏦 Bank</option></select>',
          '<input type="number" id="posSplit1Amount" class="pos-inline-num" min="0" step="0.01" placeholder="Amount" value="' + escapeAttr(String(checkout.amount_paid || 0)) + '" />',
        '</div>',
        '<div class="pos-split-row">',
          '<label>2nd Payment</label>',
          '<select id="posSplit2Method"><option value="mpesa"' + (checkout.split_method2 === 'mpesa' ? ' selected' : '') + '>📱 M-Pesa</option><option value="cash"' + (checkout.split_method2 === 'cash' ? ' selected' : '') + '>💵 Cash</option><option value="card"' + (checkout.split_method2 === 'card' ? ' selected' : '') + '>💳 Card</option><option value="bank_transfer"' + (checkout.split_method2 === 'bank_transfer' ? ' selected' : '') + '>🏦 Bank</option></select>',
          '<input type="number" id="posSplit2Amount" class="pos-inline-num" min="0" step="0.01" placeholder="Amount" value="' + escapeAttr(String(checkout.split_amount2 || 0)) + '" />',
        '</div>',
      '</div>'
    ].join('') : '';

    var cashierName = (state.user && state.user.name) ? escapeHtml(state.user.name) : '—';

    body.innerHTML = [
      '<div class="pos-checkout" id="posCheckoutRoot">',
        '<div class="pos-checkout-topbar">',
          '<span class="pos-checkout-title">🧾 Point of Sale</span>',
          '<div class="pos-topbar-actions">',
            '<span class="pos-cashier-badge">👤 ' + cashierName + '</span>',
            '<button type="button" class="secondary small" id="posViewHistoryBtn">📋 History</button>',
          '</div>',
        '</div>',
        '<div class="pos-flash-msg hidden" id="posCheckoutFlash"></div>',
        '<div class="pos-checkout-layout">',

          // LEFT — products panel
          '<div class="pos-products-panel">',
            '<div class="pos-search-wrap">',
              '<input type="text" id="posSearchInput" class="pos-search-input" placeholder="🔍 Search name, SKU or scan barcode + Enter…" autocomplete="off" value="' + escapeAttr(checkout.search_query || '') + '" />',
            '</div>',
            '<div class="pos-filter-bar" id="posCategoryBar">' + catChips + '</div>',
            '<div class="pos-filter-bar pos-brand-bar" id="posBrandBar">' + brandChips + '</div>',
            '<div class="pos-product-grid" id="posProductGrid"></div>',
            '<div class="pos-grid-footer" id="posGridFooter"></div>',
          '</div>',

          // RIGHT — basket panel
          '<div class="pos-basket-panel" id="posBasketPanel">',
            '<select id="posCustomerSelect" class="pos-customer-select">' + customerOptions + '</select>',
            '<div class="pos-basket-scroll">',
              '<div class="pos-basket-items" id="posBasketItems"></div>',
              '<div class="pos-basket-empty' + (checkout.basket.length ? ' hidden' : '') + '" id="posBasketEmpty">Add products to start a sale.</div>',
            '</div>',
            '<div class="pos-basket-totals" id="posTotalsSection">',
              '<div class="pos-total-row"><span>Subtotal</span><span id="posTotalSubtotal">—</span></div>',
              '<div class="pos-total-row pos-total-discount">',
                '<span>Discount <input type="number" id="posDiscountInput" class="pos-inline-num" min="0" step="0.01" value="' + escapeAttr(String(checkout.discount_amount || 0)) + '" /></span>',
                '<span id="posTotalDiscount">—</span>',
              '</div>',
              '<div class="pos-total-row"><span>VAT</span><span id="posTotalVat">—</span></div>',
              '<div class="pos-total-row pos-total-shipping">',
                '<span>Shipping <input type="number" id="posShippingInput" class="pos-inline-num" min="0" step="0.01" value="' + escapeAttr(String(checkout.shipping_amount || 0)) + '" /></span>',
                '<span id="posTotalShipping">—</span>',
              '</div>',
              '<div class="pos-total-row pos-total-grand"><span>GRAND TOTAL</span><span id="posTotalGrand">—</span></div>',
            '</div>',
            '<div class="pos-payment-methods">' + paymentBtns + '</div>',
            splitUI,
            '<div class="pos-pay-row">',
              '<div class="pos-pay-field">',
                '<label class="pos-pay-label" for="posAmountPaid">Amount Paid</label>',
                '<input type="number" id="posAmountPaid" class="pos-amount-input" min="0" step="0.01" value="' + escapeAttr(String(checkout.amount_paid || 0)) + '" />',
              '</div>',
              '<div class="pos-balance-box">',
                '<span class="pos-balance-label">Change/Balance</span>',
                '<span class="pos-balance-val" id="posBalanceDue">—</span>',
              '</div>',
            '</div>',
            '<input type="text" id="posNotesInput" class="pos-notes-input" placeholder="📝 Notes…" value="' + escapeAttr(checkout.notes || '') + '" />',
            '<div class="pos-basket-actions">',
              '<button type="button" class="secondary small" id="posHoldBtn" title="Hold sale">⏸ Hold</button>',
              '<button type="button" class="secondary small" id="posRecallBtn" title="Recall held sale">📂 Recall' + (checkout.heldSales.length ? ' (' + checkout.heldSales.length + ')' : '') + '</button>',
              '<button type="button" class="danger-link small" id="posClearBasketBtn" title="Clear basket">🗑 Clear</button>',
              '<button type="button" class="secondary small" id="posApplyDiscountBtn">% Disc</button>',
            '</div>',
            '<button type="button" class="pos-complete-btn" id="posCompleteSaleBtn">✓ COMPLETE SALE</button>',
            '<div class="pos-after-actions hidden" id="posAfterActions">',
              '<button type="button" class="pos-after-btn pos-after-btn--primary" id="posViewInvoiceBtn">📄 View Invoice</button>',
              '<button type="button" class="pos-after-btn" id="posPrintReceiptBtn">🖨 Print</button>',
              '<button type="button" class="pos-after-btn" id="posEmailReceiptBtn">✉ Email</button>',
              '<button type="button" class="pos-after-btn" id="posWhatsappBtn">💬 WhatsApp</button>',
              '<button type="button" class="pos-after-btn pos-after-btn--new" id="posNewSaleBtn">＋ New Sale</button>',
            '</div>',
            '<input type="hidden" id="posLastSaleId" value="" />',
            '<input type="hidden" id="posLastInvoiceId" value="" />',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    posRenderProductGrid();
    posRenderBasket();
    bindCheckoutEvents(body, checkout);
  }

  function bindCheckoutEvents(body, checkout) {
    bindClick("posViewHistoryBtn", function () {
      state.ui.posCheckout.view = "history";
      renderSales();
    });

    var searchInput = document.getElementById("posSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var query = searchInput.value.trim();
        clearTimeout(posSearchTimer);
        posSearchTimer = setTimeout(function () {
          posLoadProducts(query, checkout.filter_category, checkout.filter_brand);
        }, 280);
      });
      searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          clearTimeout(posSearchTimer);
          Promise.resolve(posHandleBarcodeOrSearch(searchInput.value.trim())).catch(handleActionError);
        }
      });
      searchInput.focus();
    }

    body.querySelectorAll(".js-pos-cat").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var catId = btn.dataset.cat ? parseInt(btn.dataset.cat, 10) : null;
        checkout.filter_category = catId;
        body.querySelectorAll(".js-pos-cat").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var q = (document.getElementById("posSearchInput") || {}).value || "";
        posLoadProducts(q, catId, checkout.filter_brand);
      });
    });

    body.querySelectorAll(".js-pos-brand").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var brandId = btn.dataset.brand ? parseInt(btn.dataset.brand, 10) : null;
        checkout.filter_brand = brandId;
        body.querySelectorAll(".js-pos-brand").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var q = (document.getElementById("posSearchInput") || {}).value || "";
        posLoadProducts(q, checkout.filter_category, brandId);
      });
    });

    var grid = document.getElementById("posProductGrid");
    if (grid) {
      grid.addEventListener("click", function (event) {
        var addBtn = event.target.closest(".js-pos-add");
        if (addBtn) {
          var idx = parseInt(addBtn.dataset.productIdx, 10);
          var prod = checkout.products[idx];
          if (prod) posAddToBasket(prod);
          return;
        }
        var card = event.target.closest(".js-pos-card");
        var card = event.target.closest(".js-pos-card");
        if (card) {
          var idx2 = parseInt(card.dataset.productIdx, 10);
          var prod2 = checkout.products[idx2];
          if (prod2) posAddToBasket(prod2);
        }
      });
    }

    var basketItems = document.getElementById("posBasketItems");
    if (basketItems) {
      basketItems.addEventListener("click", function (event) {
        var qtyBtn = event.target.closest(".js-pos-qty");
        if (qtyBtn) {
          var lineIdx = parseInt(qtyBtn.dataset.line, 10);
          if (qtyBtn.dataset.action === "inc") posUpdateQty(lineIdx, 1);
          else if (qtyBtn.dataset.action === "dec") posUpdateQty(lineIdx, -1);
          return;
        }
        var removeBtn = event.target.closest(".js-pos-remove");
        if (removeBtn) posRemoveItem(parseInt(removeBtn.dataset.line, 10));
      });
    }

    var discountEl = document.getElementById("posDiscountInput");
    if (discountEl) {
      discountEl.addEventListener("input", function () {
        checkout.discount_amount = Number(discountEl.value) || 0;
        posRenderBasket();
      });
    }

    var amtPaidEl = document.getElementById("posAmountPaid");
    if (amtPaidEl) {
      amtPaidEl.addEventListener("input", function () {
        checkout.amount_paid = Number(amtPaidEl.value) || 0;
        posRenderBasket();
      });
    }

    var notesEl = document.getElementById("posNotesInput");
    if (notesEl) {
      notesEl.addEventListener("input", function () { checkout.notes = notesEl.value; });
    }

    var customerEl = document.getElementById("posCustomerSelect");
    if (customerEl) {
      customerEl.addEventListener("change", function () {
        checkout.customer_id = customerEl.value ? parseInt(customerEl.value, 10) : null;
        checkout.customer = checkout.customers.find(function (c) { return String(c.id) === customerEl.value; }) || null;
      });
    }

    var discountEl = document.getElementById("posDiscountInput");
    if (discountEl) {
      discountEl.addEventListener("input", function () {
        checkout.discount_amount = Math.max(0, Number(discountEl.value) || 0);
        posRenderBasket();
      });
    }

    var shippingEl = document.getElementById("posShippingInput");
    if (shippingEl) {
      shippingEl.addEventListener("input", function () {
        checkout.shipping_amount = Math.max(0, Number(shippingEl.value) || 0);
        posRenderBasket();
      });
    }

    body.querySelectorAll(".js-pos-payment").forEach(function (btn) {
      btn.addEventListener("click", function () {
        checkout.payment_method = btn.dataset.method;
        body.querySelectorAll(".js-pos-payment").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        // Re-render to show/hide split payment UI
        renderPosCheckout(body, checkout);
        posRenderProductGrid();
        posRenderBasket();
        bindCheckoutEvents(body, checkout);
      });
    });

    // Split payment field listeners
    var split1El = document.getElementById("posSplit1Amount");
    if (split1El) {
      split1El.addEventListener("input", function () {
        checkout.amount_paid = Math.max(0, Number(split1El.value) || 0);
        var apEl = document.getElementById("posAmountPaid");
        if (apEl) apEl.value = String(checkout.amount_paid);
        posRenderBasket();
      });
    }
    var split2El = document.getElementById("posSplit2Amount");
    if (split2El) {
      split2El.addEventListener("input", function () {
        checkout.split_amount2 = Math.max(0, Number(split2El.value) || 0);
        posRenderBasket();
      });
    }
    var split2MethodEl = document.getElementById("posSplit2Method");
    if (split2MethodEl) {
      split2MethodEl.addEventListener("change", function () {
        checkout.split_method2 = split2MethodEl.value;
      });
    }

    bindClick("posHoldBtn", posHoldSale);
    bindClick("posRecallBtn", posRecallSale);
    bindClick("posClearBasketBtn", posClearBasket);
    bindClick("posCompleteSaleBtn", function () {
      Promise.resolve(posCompleteSale()).catch(handleActionError);
    });
    bindClick("posApplyDiscountBtn", function () {
      var co = state.ui.posCheckout;
      var amt = window.prompt("Enter discount amount:", String(co.discount_amount || 0));
      if (amt === null) return;
      var num = Number(amt);
      if (!Number.isFinite(num) || num < 0) { posFlashMsg("Invalid discount amount.", "error"); return; }
      co.discount_amount = num;
      var de = document.getElementById("posDiscountInput");
      if (de) de.value = String(num);
      posRenderBasket();
    });
    bindClick("posViewInvoiceBtn", function () {
      var invoiceId = (document.getElementById("posLastInvoiceId") || {}).value;
      if (invoiceId) posShowInvoiceModal(state.ui.posCheckout.lastCompletedSale);
    });
    bindClick("posPrintReceiptBtn", function () {
      var saleId = (document.getElementById("posLastSaleId") || {}).value;
      if (!saleId) return;
      var paper = window.prompt("Paper size: 58mm, 80mm or a4", "80mm");
      openDocumentPrint("receipt", saleId, paper || "80mm");
    });
    bindClick("posEmailReceiptBtn", function () {
      var invoiceId = (document.getElementById("posLastInvoiceId") || {}).value;
      if (invoiceId) Promise.resolve(emailDocument("invoice", invoiceId)).catch(handleActionError);
    });
    bindClick("posWhatsappBtn", function () {
      var invoiceId = (document.getElementById("posLastInvoiceId") || {}).value;
      if (invoiceId) shareDocumentWhatsapp("invoice", invoiceId);
    });
    bindClick("posNewSaleBtn", function () {
      posClearBasket(true);
    });
  }

  async function posLoadProducts(query, categoryId, brandId) {
    var params = new URLSearchParams({ limit: "30" });
    if (query) params.set("search", query);
    if (categoryId) params.set("category_id", String(categoryId));
    if (brandId) params.set("brand_id", String(brandId));
    try {
      var result = await apiJson("/api/products?" + params.toString());
      state.ui.posCheckout.products = normalizeList(result);
    } catch (_e) {
      state.ui.posCheckout.products = [];
    }
    posRenderProductGrid();
  }

  async function posHandleBarcodeOrSearch(query) {
    if (!query) return;
    var checkout = state.ui.posCheckout;
    var exact = checkout.products.find(function (p) { return p.barcode && p.barcode.trim() === query.trim(); });
    if (exact) {
      posAddToBasket(exact);
      var si = document.getElementById("posSearchInput");
      if (si) si.value = "";
      checkout.search_query = "";
      return;
    }
    var params = new URLSearchParams({ limit: "30", search: query });
    if (checkout.filter_category) params.set("category_id", String(checkout.filter_category));
    if (checkout.filter_brand) params.set("brand_id", String(checkout.filter_brand));
    var result = await apiJson("/api/products?" + params.toString());
    checkout.products = normalizeList(result);
    var barcodeMatch = checkout.products.find(function (p) { return p.barcode && p.barcode.trim() === query.trim(); });
    if (barcodeMatch) {
      posAddToBasket(barcodeMatch);
      var si2 = document.getElementById("posSearchInput");
      if (si2) si2.value = "";
      checkout.search_query = "";
      await posLoadProducts("", checkout.filter_category, checkout.filter_brand);
    } else {
      checkout.search_query = query;
      posRenderProductGrid();
    }
  }

  function posRenderProductGrid() {
    var grid = document.getElementById("posProductGrid");
    var footer = document.getElementById("posGridFooter");
    if (!grid) return;
    var products = state.ui.posCheckout.products;
    if (!products || !products.length) {
      grid.innerHTML = '<div class="pos-grid-empty">No products found. Try a different search or barcode.</div>';
      if (footer) footer.textContent = "";
      return;
    }
    grid.innerHTML = products.map(function (p, idx) {
      var thumb = p.image_url
        ? '<img class="pos-product-thumb" src="' + escapeAttr(p.image_url) + '" alt="" loading="lazy" />'
        : '<div class="pos-no-image">📦</div>';
      var stock = Number(p.current_stock || 0);
      var minStock = Number(p.min_stock || 0);
      var stockClass = stock <= 0 ? "pos-stock-out" : stock <= minStock ? "pos-stock-low" : "pos-stock-ok";
      var stockText = stock <= 0 ? "✗ Out of stock" : "✓ " + stock + (p.unit ? " " + p.unit : "");
      return [
        '<div class="pos-product-card js-pos-card" data-product-idx="' + idx + '" title="' + escapeAttr(p.product_name) + '">',
          thumb,
          '<div class="pos-product-body">',
            '<div class="pos-product-name">' + escapeHtml(p.product_name) + '</div>',
            '<div class="pos-product-sku">' + escapeHtml(firstText(p.product_code, '—')) + (p.barcode ? ' · ' + escapeHtml(p.barcode) : '') + '</div>',
            '<div class="pos-product-price">' + money(p.selling_price) + '</div>',
            '<div class="pos-product-stock ' + stockClass + '">' + escapeHtml(stockText) + '</div>',
          '</div>',
          '<button type="button" class="pos-add-btn js-pos-add" data-product-idx="' + idx + '" title="Add to basket">+</button>',
        '</div>'
      ].join('');
    }).join('');
    if (footer) footer.textContent = "Showing " + products.length + " product" + (products.length !== 1 ? "s" : "");
  }

  function posCalcTotals(checkout) {
    var subtotal = 0;
    var vat = 0;
    (checkout.basket || []).forEach(function (line) {
      var lineAmt = (Number(line.unit_price) - Number(line.line_discount || 0)) * Number(line.quantity);
      subtotal += lineAmt;
      vat += lineAmt * (Number(line.vat_rate || 0) / 100);
    });
    var discount = Number(checkout.discount_amount || 0);
    var shipping = Number(checkout.shipping_amount || 0);
    var total = Math.max(0, subtotal - discount + vat + shipping);
    return { subtotal: subtotal, discount: discount, vat: vat, shipping: shipping, total: total };
  }

  function posRenderBasket() {
    var itemsEl = document.getElementById("posBasketItems");
    var emptyEl = document.getElementById("posBasketEmpty");
    if (!itemsEl) return;
    var checkout = state.ui.posCheckout;
    var basket = checkout.basket || [];

    if (emptyEl) {
      if (basket.length) emptyEl.classList.add("hidden");
      else emptyEl.classList.remove("hidden");
    }

    itemsEl.innerHTML = basket.map(function (line, idx) {
      var lineBase = (Number(line.unit_price) - Number(line.line_discount || 0)) * Number(line.quantity);
      var lineVat = lineBase * (Number(line.vat_rate || 0) / 100);
      var lineTotal = lineBase + lineVat;
      var stockOk = line.stock >= line.quantity;
      return [
        '<div class="pos-basket-row' + (stockOk ? '' : ' pos-basket-row--low-stock') + '">',
          '<div class="pos-basket-row-main">',
            '<div class="pos-basket-row-name">' + escapeHtml(line.product_name) + '</div>',
            '<div class="pos-basket-row-meta">',
              (line.product_code ? '<span class="pos-row-code">' + escapeHtml(line.product_code) + '</span>' : ''),
              '<span class="pos-row-stock ' + (stockOk ? 'pos-stock-ok' : 'pos-stock-out') + '">Stock: ' + escapeHtml(String(line.stock || 0)) + '</span>',
              (line.vat_rate ? '<span class="pos-row-vat">VAT ' + escapeHtml(String(line.vat_rate)) + '%</span>' : ''),
            '</div>',
            '<div class="pos-basket-row-price">' + money(line.unit_price) + (line.line_discount ? ' −' + money(line.line_discount) : '') + '</div>',
          '</div>',
          '<div class="pos-basket-row-controls">',
            '<button type="button" class="pos-qty-btn js-pos-qty" data-line="' + idx + '" data-action="dec">−</button>',
            '<input type="number" class="pos-qty-input js-pos-qty-input" data-line="' + idx + '" value="' + escapeAttr(String(line.quantity)) + '" min="1" step="1" />',
            '<button type="button" class="pos-qty-btn js-pos-qty" data-line="' + idx + '" data-action="inc">+</button>',
          '</div>',
          '<div class="pos-basket-row-total">' + money(lineTotal) + '</div>',
          '<button type="button" class="pos-remove-btn js-pos-remove" data-line="' + idx + '" title="Remove">✕</button>',
        '</div>'
      ].join('');
    }).join('');

    // Bind qty input events
    itemsEl.querySelectorAll('.js-pos-qty-input').forEach(function (input) {
      input.addEventListener('change', function () {
        var idx2 = parseInt(input.dataset.line, 10);
        var val = Math.max(1, parseInt(input.value, 10) || 1);
        var line = checkout.basket[idx2];
        if (line) { line.quantity = val; posRenderBasket(); }
      });
    });

    var t = posCalcTotals(checkout);
    var amtPaid = Number(checkout.amount_paid || 0);
    var balance = amtPaid - t.total;

    function setTxt(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    setTxt("posTotalSubtotal", money(t.subtotal));
    setTxt("posTotalDiscount", "−" + money(t.discount));
    setTxt("posTotalVat", money(t.vat));
    setTxt("posTotalShipping", money(t.shipping));
    setTxt("posTotalGrand", money(t.total));
    var balEl = document.getElementById("posBalanceDue");
    if (balEl) {
      balEl.textContent = money(balance);
      balEl.className = "pos-balance-val " + (balance < 0 ? "pos-balance-negative" : balance === 0 ? "pos-balance-zero" : "pos-balance-positive");
    }
  }

  function posAddToBasket(product) {
    var checkout = state.ui.posCheckout;
    var existing = checkout.basket.find(function (line) { return line.product_id === product.id; });
    if (existing) {
      existing.quantity += 1;
      existing.stock = Number(product.current_stock || 0);
    } else {
      checkout.basket.push({
        product_id: product.id,
        product_code: product.product_code || '',
        product_name: product.product_name,
        unit_price: Number(product.selling_price),
        quantity: 1,
        line_discount: 0,
        vat_rate: Number(product.vat_rate || 0),
        stock: Number(product.current_stock || 0)
      });
    }
    posRenderBasket();
    posFlashMsg(product.product_name + " added.");
  }

  function posUpdateQty(lineIdx, delta) {
    var checkout = state.ui.posCheckout;
    var line = checkout.basket[lineIdx];
    if (!line) return;
    line.quantity = Math.max(1, line.quantity + delta);
    posRenderBasket();
  }

  function posRemoveItem(lineIdx) {
    state.ui.posCheckout.basket.splice(lineIdx, 1);
    posRenderBasket();
  }

  function posClearBasket(skipConfirm) {
    var co = state.ui.posCheckout;
    if (!skipConfirm && co.basket.length && !window.confirm("Clear all items from basket?")) return;
    co.basket = [];
    co.discount_amount = 0;
    co.shipping_amount = 0;
    co.notes = "";
    co.amount_paid = 0;
    co.customer_id = null;
    co.customer = null;
    co.lastCompletedSale = null;
    posRenderBasket();
    var els = ["posCustomerSelect", "posDiscountInput", "posShippingInput", "posAmountPaid"];
    els.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = id === "posCustomerSelect" ? "" : "0"; });
    var ne = document.getElementById("posNotesInput");
    if (ne) ne.value = "";
    var aa = document.getElementById("posAfterActions");
    if (aa) aa.classList.add("hidden");
    var btn = document.getElementById("posCompleteSaleBtn");
    if (btn) { btn.disabled = false; btn.textContent = "✓ COMPLETE SALE"; }
  }

  function posHoldSale() {
    var co = state.ui.posCheckout;
    if (!co.basket.length) { posFlashMsg("Basket is empty.", "error"); return; }
    co.heldSales.push({ basket: co.basket.slice(), customer_id: co.customer_id, customer: co.customer, discount_amount: co.discount_amount, shipping_amount: co.shipping_amount, notes: co.notes });
    co.basket = [];
    co.customer_id = null;
    co.customer = null;
    co.discount_amount = 0;
    co.shipping_amount = 0;
    co.notes = "";
    co.amount_paid = 0;
    posRenderBasket();
    posFlashMsg("Sale held. " + co.heldSales.length + " held sale(s).");
    var btn = document.getElementById("posRecallBtn");
    if (btn) btn.textContent = "📂 Recall (" + co.heldSales.length + ")";
  }

  function posRecallSale() {
    var co = state.ui.posCheckout;
    if (!co.heldSales.length) { posFlashMsg("No held sales.", "error"); return; }
    if (co.basket.length && !window.confirm("Replace current basket with held sale?")) return;
    var held = co.heldSales.pop();
    co.basket = held.basket;
    co.customer_id = held.customer_id;
    co.customer = held.customer;
    co.discount_amount = held.discount_amount;
    co.shipping_amount = held.shipping_amount || 0;
    co.notes = held.notes;
    co.amount_paid = 0;
    posRenderBasket();
    var ce = document.getElementById("posCustomerSelect");
    if (ce && co.customer_id) ce.value = String(co.customer_id);
    var de = document.getElementById("posDiscountInput");
    if (de) de.value = String(co.discount_amount);
    var se = document.getElementById("posShippingInput");
    if (se) se.value = String(co.shipping_amount);
    var ne = document.getElementById("posNotesInput");
    if (ne) ne.value = co.notes || "";
    posFlashMsg("Sale recalled.");
    var btn = document.getElementById("posRecallBtn");
    if (btn) btn.textContent = co.heldSales.length ? "📂 Recall (" + co.heldSales.length + ")" : "📂 Recall";
  }

  async function posCompleteSale() {
    var co = state.ui.posCheckout;
    if (co.submitting) { posFlashMsg("Sale is being processed, please wait.", "error"); return; }
    if (!co.basket.length) { posFlashMsg("Add items first.", "error"); return; }
    var totals = posCalcTotals(co);
    var amtPaid = Number(co.amount_paid || 0);
    if (co.payment_method === 'split') {
      amtPaid = Number(co.amount_paid || 0) + Number(co.split_amount2 || 0);
    }
    if (amtPaid <= 0 && co.payment_method !== "credit") { posFlashMsg("Enter the amount paid.", "error"); return; }
    if (co.payment_method !== "credit" && co.payment_method !== "split" && amtPaid < totals.total) {
      posFlashMsg("Amount paid (" + money(amtPaid) + ") is less than the total (" + money(totals.total) + ").", "error");
      return;
    }
    var payload = {
      items: co.basket.map(function (line) {
        return { product_id: line.product_id, quantity: line.quantity, unit_price: line.unit_price, discount: line.line_discount || 0, vat_rate: line.vat_rate || 0 };
      }),
      discount_amount: co.discount_amount || 0,
      shipping_amount: co.shipping_amount || 0,
      amount_paid: amtPaid,
      payment_method: co.payment_method || "cash"
    };
    if (co.customer_id) payload.customer_id = co.customer_id;
    var btn = document.getElementById("posCompleteSaleBtn");
    co.submitting = true;
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Processing…"; }
    try {
      var result = await apiJson("/api/pos/sale", { method: "POST", body: JSON.stringify(payload) });
      co.lastSaleId = result && result.id ? String(result.id) : null;
      co.lastInvoiceId = result && result.invoice_id ? String(result.invoice_id) : null;
      co.lastInvoiceNumber = result && result.invoice_number ? result.invoice_number : null;
      co.lastCompletedSale = result;
      var lsi = document.getElementById("posLastSaleId");
      if (lsi) lsi.value = co.lastSaleId || "";
      var lii = document.getElementById("posLastInvoiceId");
      if (lii) lii.value = co.lastInvoiceId || "";
      co.basket = [];
      co.discount_amount = 0;
      co.shipping_amount = 0;
      co.notes = "";
      co.amount_paid = 0;
      co.split_amount2 = 0;
      co.customer_id = null;
      co.customer = null;
      posRenderBasket();
      // Show after-sale actions
      var aa = document.getElementById("posAfterActions");
      if (aa) aa.classList.remove("hidden");
      if (btn) { btn.disabled = false; btn.textContent = "✓ COMPLETE SALE"; }
      // Auto-show invoice modal
      posShowInvoiceModal(result);
      // Update dashboard stats in background
      loadDashboard().then(renderDashboardStats).catch(function () {});
    } catch (e) {
      posFlashMsg(e && e.message ? e.message : "Sale failed.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✓ COMPLETE SALE"; }
    } finally {
      co.submitting = false;
    }
  }

  function posShowInvoiceModal(saleResult) {
    if (!saleResult) return;
    var invoiceId = saleResult.invoice_id;
    var invoiceNumber = saleResult.invoice_number || saleResult.receipt_number || '—';
    var saleId = saleResult.id;
    var customerName = saleResult.customer_name || 'Walk-in Customer';
    var cashierName = saleResult.cashier_name || (state.user && state.user.name) || '—';
    var paymentMethod = saleResult.payment_method || '—';
    var total = money(saleResult.total || 0);
    var amountPaid = money(saleResult.amount_paid || 0);
    var change = money(saleResult.change || 0);
    var createdAt = saleResult.created_at ? new Date(saleResult.created_at).toLocaleString() : new Date().toLocaleString();
    var items = saleResult.items || [];

    var itemRows = items.map(function (item) {
      return '<tr>' +
        '<td>' + escapeHtml(item.product_name || '—') + '</td>' +
        '<td class="inv-td-num">' + escapeHtml(String(item.quantity)) + '</td>' +
        '<td class="inv-td-num">' + money(item.unit_price) + '</td>' +
        '<td class="inv-td-num">' + money(item.discount || 0) + '</td>' +
        '<td class="inv-td-num">' + escapeHtml(String(item.vat_rate || 0)) + '%</td>' +
        '<td class="inv-td-num">' + money(item.total) + '</td>' +
        '</tr>';
    }).join('');

    var branding = state.branding || {};
    var companyName = branding.business_name || 'UniquePOS';
    var companyAddr = branding.business_address || '';
    var companyPhone = branding.business_phone || '';
    var companyEmail = branding.business_email || '';

    var modalHtml = [
      '<div class="pos-invoice-modal-overlay" id="posInvoiceModalOverlay">',
        '<div class="pos-invoice-modal" id="posInvoiceModal">',
          '<div class="pos-invoice-modal-header">',
            '<h2>✅ Sale Complete — Invoice #' + escapeHtml(invoiceNumber) + '</h2>',
            '<button type="button" class="pos-modal-close" id="posInvoiceModalClose" aria-label="Close">✕</button>',
          '</div>',
          '<div class="pos-invoice-modal-body" id="posInvoiceContent">',
            // Invoice document
            '<div class="inv-doc">',
              '<div class="inv-header">',
                (branding.logo_url ? '<img class="inv-logo" src="' + escapeAttr(branding.logo_url) + '" alt="Logo" />' : ''),
                '<div class="inv-company">',
                  '<h3>' + escapeHtml(companyName) + '</h3>',
                  (companyAddr ? '<div>' + escapeHtml(companyAddr) + '</div>' : ''),
                  (companyPhone ? '<div>Tel: ' + escapeHtml(companyPhone) + '</div>' : ''),
                  (companyEmail ? '<div>' + escapeHtml(companyEmail) + '</div>' : ''),
                '</div>',
                '<div class="inv-meta">',
                  '<div class="inv-meta-row"><span>Invoice #:</span><strong>' + escapeHtml(invoiceNumber) + '</strong></div>',
                  '<div class="inv-meta-row"><span>Receipt #:</span><span>' + escapeHtml(saleResult.receipt_number || '—') + '</span></div>',
                  '<div class="inv-meta-row"><span>Date:</span><span>' + escapeHtml(createdAt) + '</span></div>',
                  '<div class="inv-meta-row"><span>Customer:</span><span>' + escapeHtml(customerName) + '</span></div>',
                  '<div class="inv-meta-row"><span>Cashier:</span><span>' + escapeHtml(cashierName) + '</span></div>',
                  '<div class="inv-meta-row"><span>Payment:</span><span>' + escapeHtml(paymentMethod) + '</span></div>',
                '</div>',
              '</div>',
              '<table class="inv-table">',
                '<thead><tr><th>Item</th><th class="inv-td-num">Qty</th><th class="inv-td-num">Unit Price</th><th class="inv-td-num">Discount</th><th class="inv-td-num">VAT</th><th class="inv-td-num">Total</th></tr></thead>',
                '<tbody>' + itemRows + '</tbody>',
              '</table>',
              '<div class="inv-totals">',
                '<div class="inv-total-row"><span>Subtotal</span><span>' + money(saleResult.subtotal || 0) + '</span></div>',
                (Number(saleResult.discount_amount || 0) > 0 ? '<div class="inv-total-row"><span>Discount</span><span>−' + money(saleResult.discount_amount) + '</span></div>' : ''),
                '<div class="inv-total-row"><span>VAT</span><span>' + money(saleResult.tax_amount || 0) + '</span></div>',
                '<div class="inv-total-row inv-total-grand"><span>TOTAL</span><span>' + total + '</span></div>',
                '<div class="inv-total-row"><span>Amount Paid</span><span>' + amountPaid + '</span></div>',
                '<div class="inv-total-row inv-total-change"><span>Change</span><span>' + change + '</span></div>',
              '</div>',
              (branding.receipt_footer ? '<div class="inv-footer">' + escapeHtml(branding.receipt_footer) + '</div>' : ''),
            '</div>',
          '</div>',
          '<div class="pos-invoice-modal-actions">',
            '<button type="button" class="pos-inv-btn pos-inv-btn--primary" id="posInvPrintA4">🖨 Print A4</button>',
            '<button type="button" class="pos-inv-btn pos-inv-btn--primary" id="posInvPrint80">🧾 Print Receipt (80mm)</button>',
            '<button type="button" class="pos-inv-btn" id="posInvDownloadPdf">⬇ Download PDF</button>',
            '<button type="button" class="pos-inv-btn" id="posInvWhatsapp">💬 WhatsApp</button>',
            '<button type="button" class="pos-inv-btn" id="posInvEmail">✉ Email</button>',
            '<button type="button" class="pos-inv-btn" id="posInvCopyLink">🔗 Copy Link</button>',
            '<button type="button" class="pos-inv-btn pos-inv-btn--success" id="posInvNewSale">＋ New Sale</button>',
            '<button type="button" class="pos-inv-btn pos-inv-btn--secondary" id="posInvClose">✓ Save & Close</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    // Inject modal into DOM
    var existing = document.getElementById("posInvoiceModalOverlay");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    // Bind modal buttons
    var overlay = document.getElementById("posInvoiceModalOverlay");
    function closeModal() { if (overlay) overlay.remove(); }

    var closeBtn = document.getElementById("posInvoiceModalClose");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    var invCloseBtn = document.getElementById("posInvClose");
    if (invCloseBtn) invCloseBtn.addEventListener("click", closeModal);

    var printA4Btn = document.getElementById("posInvPrintA4");
    if (printA4Btn) printA4Btn.addEventListener("click", function () {
      if (invoiceId) openDocumentPrint("invoice", invoiceId, "a4");
    });

    var print80Btn = document.getElementById("posInvPrint80");
    if (print80Btn) print80Btn.addEventListener("click", function () {
      if (saleId) openDocumentPrint("receipt", saleId, "80mm");
    });

    var pdfBtn = document.getElementById("posInvDownloadPdf");
    if (pdfBtn) pdfBtn.addEventListener("click", function () {
      if (invoiceId) openDocumentPdf("invoice", invoiceId);
    });

    var waBtn = document.getElementById("posInvWhatsapp");
    if (waBtn) waBtn.addEventListener("click", function () {
      if (invoiceId) shareDocumentWhatsapp("invoice", invoiceId);
    });

    var emailBtn = document.getElementById("posInvEmail");
    if (emailBtn) emailBtn.addEventListener("click", function () {
      if (invoiceId) Promise.resolve(emailDocument("invoice", invoiceId)).catch(handleActionError);
    });

    var copyBtn = document.getElementById("posInvCopyLink");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var link = invoiceId ? window.location.origin + "/api/documents/invoice/" + invoiceId + "/pdf" : "";
      if (link && navigator.clipboard) {
        navigator.clipboard.writeText(link).then(function () {
          posFlashMsg("Invoice link copied to clipboard.");
        }).catch(function () { window.prompt("Copy this link:", link); });
      } else if (link) {
        window.prompt("Copy this link:", link);
      }
    });

    var newSaleBtn = document.getElementById("posInvNewSale");
    if (newSaleBtn) newSaleBtn.addEventListener("click", function () {
      closeModal();
      posClearBasket(true);
    });

    // Close on overlay click outside modal
    if (overlay) overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  async function posGenerateInvoice() {
    // Now a no-op since invoice is auto-generated with each sale
    posFlashMsg("Invoice is auto-generated when you complete a sale.");
  }

  function posFlashMsg(msg, type) {
    var el = document.getElementById("posCheckoutFlash");
    if (!el) return;
    el.textContent = msg;
    el.className = "pos-flash-msg " + (type === "error" ? "pos-flash-error" : "pos-flash-success");
    el.classList.remove("hidden");
    clearTimeout(posFlashTimer);
    posFlashTimer = setTimeout(function () { el.classList.add("hidden"); }, 3500);
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
        textField("Logo URL", "logo_url", resolveBrandLogoUrl(s)) +
        '<label class="span-2"><span>Company logo upload</span><div class="logo-upload-card">' +
          '<img id="brandingLogoPreview" class="brand-logo brand-logo--xl hidden" alt="Company logo preview" />' +
          '<div class="logo-upload-card__body">' +
            '<input id="brandingLogoFile" type="file" accept="' + BRAND_LOGO_UPLOAD_TYPES.join(",") + '" />' +
            '<div class="form-actions"><button type="button" class="secondary" id="brandingLogoUploadBtn">Upload logo</button><button type="button" class="secondary" id="brandingLogoRestoreBtn">Restore default</button></div>' +
            '<p class="muted small">Uploaded logos are stored permanently and become the active company logo everywhere immediately after upload.</p>' +
          '</div>' +
        '</div></label>' +
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
    bindClick("brandingLogoUploadBtn", uploadBrandingLogo);
    bindClick("brandingLogoRestoreBtn", restoreDefaultBrandingLogo);
    bindBrandLogoPreview();
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

  function bindBrandLogoPreview() {
    const logoField = document.querySelector('#brandingForm [name="logo_url"]');
    const preview = document.getElementById("brandingLogoPreview");
    if (!logoField || !preview) return;
    const sync = function () {
      applyBrandLogo(preview, firstText(logoField.value, DEFAULT_COMPANY_LOGO_URL));
    };
    logoField.addEventListener("input", sync);
    sync();
  }

  async function uploadBrandingLogo() {
    const input = document.getElementById("brandingLogoFile");
    if (!input || !input.files || !input.files[0]) throw new Error("Choose a logo file to upload.");
    const file = input.files[0];
    if (!BRAND_LOGO_UPLOAD_TYPES.includes(file.type)) throw new Error("Choose a PNG, JPG, WEBP, GIF, or SVG logo.");
    if (file.size > BRAND_LOGO_UPLOAD_LIMIT) throw new Error("Logo files must be 2MB or smaller.");
    const uploadTicket = await apiJson("/api/storage/uploads/request-url", {
      method: "POST",
      body: JSON.stringify({ name: file.name, size: file.size, content_type: file.type })
    });
    const uploadResponse = await authorizedFetch(uploadTicket.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer()
    });
    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.json().catch(function () { return {}; });
      throw new Error(firstText(errorBody.error, "Logo upload failed."));
    }
    await apiJson("/api/settings/branding", {
      method: "PATCH",
      body: JSON.stringify({ logo_url: uploadTicket.object_path })
    });
    setFlash("settings", "success", "Logo uploaded and applied everywhere.");
    input.value = "";
    await Promise.all([loadSettings(), loadBranding()]);
    renderSettings();
  }

  async function restoreDefaultBrandingLogo() {
    await apiJson("/api/settings/branding", {
      method: "PATCH",
      body: JSON.stringify({ logo_url: DEFAULT_COMPANY_LOGO_URL })
    });
    setFlash("settings", "success", "Default company logo restored.");
    await Promise.all([loadSettings(), loadBranding()]);
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
    const stats = state.dashboardStats || {};
    if (state.activeModule !== "dashboard") return;
    const sales = stats.todaySales && stats.todaySales.value != null ? money(stats.todaySales.value) : "—";
    const tx = stats.transactions && stats.transactions.value != null ? numberText(stats.transactions.value) : "—";
    pos.moduleSubtitle.textContent = "Today: " + sales + " across " + tx + " transactions.";
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

  function valueById(id) {
    const element = document.getElementById(id);
    return element ? String(element.value || "").trim() : "";
  }

  function numberById(id) {
    const value = valueById(id);
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

  function isoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    date.setDate(date.getDate() + Number(days || 0));
    return date;
  }

  function valueWithChange(current, previous) {
    const cur = Number(current || 0);
    const prev = Number(previous || 0);
    const change = prev === 0 ? (cur === 0 ? 0 : 100) : (cur - prev) / Math.abs(prev) * 100;
    return { value: cur, change: Number.isFinite(change) ? change : 0 };
  }

  function aggregateHourlySales(sales) {
    const byHour = {};
    for (let i = 0; i < 24; i += 1) byHour[i] = 0;
    const today = localDateKey(new Date());
    normalizeList(sales).forEach(function (item) {
      const when = new Date(item.created_at);
      if (localDateKey(when) !== today) return;
      byHour[when.getHours()] += Number(item.total || 0);
    });
    return Object.keys(byHour).map(function (hour) {
      return { label: hour.padStart ? hour.padStart(2, "0") + ":00" : ("0" + hour).slice(-2) + ":00", value: byHour[hour] };
    }).filter(function (item) { return item.value > 0; }).slice(-12);
  }

  function aggregateDailySales(sales, days) {
    const result = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = addDays(new Date(), -i);
      const key = localDateKey(date);
      const total = normalizeList(sales).filter(function (item) { return localDateKey(item.created_at) === key; }).reduce(function (sum, item) { return sum + Number(item.total || 0); }, 0);
      result.push({ label: key.slice(5), value: total });
    }
    return result;
  }

  function aggregateMonthlySeries(rows, field, limit) {
    const map = {};
    normalizeList(rows).forEach(function (item) {
      const date = firstText(item.date, "");
      const key = date ? date.slice(0, 7) : "—";
      map[key] = (map[key] || 0) + Number(item[field] || item.sales || 0);
    });
    return Object.keys(map).sort().slice(-Math.max(1, Number(limit || 12))).map(function (month) {
      return { label: month, value: map[month] };
    });
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function readStoredTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  }

  function persistTheme(theme) {
    localStorage.setItem(THEME_STORAGE_KEY, theme === "light" ? "light" : "dark");
  }

  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  }

  function readStoredDashboardLayout() {
    try {
      return JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) || '{"order":[]}');
    } catch (_error) {
      return { order: [] };
    }
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
