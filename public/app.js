(function () {
  const TOKEN_KEY = "uniquepos.token";
  const USER_KEY = "uniquepos.user";
  const DEFAULT_ROUTE = "dashboard";
  const DEFAULT_BRANDING = {
    business_name: "Unique Solar Kenya Ltd",
    tagline: "Smart POS for solar retail, quotations, receipts and inventory.",
    business_address: "Nairobi, Kenya",
    business_phone: "+254 700 000000",
    business_email: "sales@uniquesolarkenya.co.ke"
  };
  const DEFAULT_DASHBOARD = {
    todaySales: 125450,
    todayProfit: 38750,
    cashInTill: 45200,
    mpesaCollections: 32600,
    transactions: 36,
    pendingQuotations: 12,
    creditSales: 58900,
    lowStockItems: 18,
    outOfStockItems: 7,
    chart: [76000, 98000, 89400, 132000, 110500, 149000, 125450]
  };
  const SALE_CATEGORIES = [
    "All Products",
    "Solar Panels",
    "Inverters",
    "Batteries",
    "Accessories",
    "Cables",
    "Electricals",
    "Others"
  ];
  const PAYMENT_METHODS = ["cash", "mpesa", "bank_transfer", "card", "credit"];
  const IMPORT_FIELDS = [
    ["product_code", "Product Code / SKU"],
    ["barcode", "Barcode"],
    ["product_name", "Product Name"],
    ["category", "Category"],
    ["brand", "Brand"],
    ["unit", "Unit"],
    ["cost_price", "Cost Price"],
    ["selling_price", "Selling Price"],
    ["vat_rate", "Tax / VAT"],
    ["min_stock", "Reorder Level"],
    ["current_stock", "Current Stock"],
    ["supplier", "Supplier"],
    ["location", "Location"],
    ["description", "Description"],
    ["image_url", "Image URL"]
  ];
  const IMPORT_NUMERIC_FIELDS = {
    cost_price: true,
    selling_price: true,
    vat_rate: true,
    min_stock: true,
    current_stock: true
  };
  const NAV_ITEMS = [
    ["dashboard", "Dashboard", "fa-solid fa-gauge-high"],
    ["sales", "Sales", "fa-solid fa-cart-shopping"],
    ["products", "Products", "fa-solid fa-box-open"],
    ["customers", "Customers", "fa-solid fa-users"],
    ["suppliers", "Suppliers", "fa-solid fa-truck-field"],
    ["purchases", "Purchases", "fa-solid fa-file-invoice-dollar"],
    ["inventory", "Inventory", "fa-solid fa-warehouse"],
    ["invoices", "Invoices", "fa-solid fa-file-lines"],
    ["quotations", "Quotations", "fa-solid fa-file-signature"],
    ["reports", "Reports", "fa-solid fa-chart-column"],
    ["expenses", "Expenses", "fa-solid fa-money-bill-wave"],
    ["accounting", "Accounting", "fa-solid fa-calculator"],
    ["users", "User Management", "fa-solid fa-user-shield"],
    ["settings", "Settings", "fa-solid fa-gear"],
    ["logout", "Logout", "fa-solid fa-right-from-bracket"]
  ];
  const ROUTE_META = {
    dashboard: ["Dashboard", "Operational overview, performance and activity."],
    sales: ["New Sale", "Fast checkout for products, customers, quotations and receipts."],
    products: ["Products", "Browse products, pricing, categories and stock levels."],
    customers: ["Customers", "Customer relationships, balances and quick account creation."],
    suppliers: ["Suppliers", "Supplier contacts and procurement relationships."],
    purchases: ["Purchases", "Purchase records, receiving and supplier obligations."],
    inventory: ["Inventory", "Stock count, movement history and replenishment control."],
    invoices: ["Invoices", "Manage A4 tax invoices, payments and receivables."],
    quotations: ["Quotations", "Track proposals and convert approved quotes to invoices."],
    reports: ["Reports", "Sales, profit and inventory value performance views."],
    expenses: ["Expenses", "Operational expenditure overview and recent entries."],
    accounting: ["Accounting", "High-level receivables, payables and net position summary."],
    users: ["User Management", "Team access, roles and branch accountability."],
    settings: ["Settings", "Business profile, branding and payment setup."],
    logout: ["Logout", "End the current session."]
  };

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: readJson(USER_KEY),
    branding: Object.assign({}, DEFAULT_BRANDING),
    activeRoute: DEFAULT_ROUTE,
    search: "",
    loading: false,
    branches: [],
    cache: {},
    chart: null,
    toastTimer: null,
    modalDocument: null,
    importer: {
      history: [],
      loading: false,
      job: null,
      headers: [],
      mapping: {},
      preview: [],
      sourceName: "",
      duplicateMode: "update",
      selectedRow: null,
      savingRow: false,
      lastFileName: "",
      pollTimer: null
    },
    pos: {
      products: [],
      categories: [],
      customers: [],
      basket: [],
      held: [],
      customer_id: "",
      payment_method: "cash",
      discount_amount: 0,
      shipping_amount: 0,
      amount_paid: 0,
      notes: "",
      categoryFilter: "All Products",
      search: ""
    }
  };

  const els = {
    loginShell: document.getElementById("loginShell"),
    appShell: document.getElementById("appShell"),
    apiStatus: document.getElementById("apiStatus"),
    brandHeadline: document.getElementById("brandHeadline"),
    brandSummary: document.getElementById("brandSummary"),
    loginForm: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    totpWrap: document.getElementById("totpWrap"),
    totp: document.getElementById("totp"),
    submitBtn: document.getElementById("submitBtn"),
    loginMessage: document.getElementById("loginMessage"),
    sidebar: document.getElementById("sidebar"),
    sidebarNav: document.getElementById("sidebarNav"),
    sidebarBrandName: document.getElementById("sidebarBrandName"),
    sidebarUserInitials: document.getElementById("sidebarUserInitials"),
    sidebarUserName: document.getElementById("sidebarUserName"),
    sidebarUserRole: document.getElementById("sidebarUserRole"),
    pageTitle: document.getElementById("pageTitle"),
    pageSubtitle: document.getElementById("pageSubtitle"),
    viewRoot: document.getElementById("viewRoot"),
    branchSelect: document.getElementById("branchSelect"),
    userSelect: document.getElementById("userSelect"),
    topbarDate: document.getElementById("topbarDate"),
    topbarTime: document.getElementById("topbarTime"),
    globalSearchInput: document.getElementById("globalSearchInput"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    modalOverlay: document.getElementById("modalOverlay"),
    modalWindow: document.getElementById("modalWindow"),
    modalTitle: document.getElementById("modalTitle"),
    modalSubtitle: document.getElementById("modalSubtitle"),
    modalActions: document.getElementById("modalActions"),
    modalBody: document.getElementById("modalBody"),
    toast: document.getElementById("toast")
  };

  init();

  async function init() {
    renderSidebar();
    bindEvents();
    updateTopbarClock();
    window.setInterval(updateTopbarClock, 1000);
    await Promise.all([loadHealth(), loadBranding()]);
    if (state.token) await refreshSession();
    if (state.user) {
      showApp();
      await loadTopbarReferenceData();
      routeTo(readRoute());
    } else {
      showLogin();
    }
  }

  function bindEvents() {
    window.addEventListener("hashchange", function () {
      if (state.user) routeTo(readRoute());
    });

    document.addEventListener("submit", function (event) {
      const form = event.target;
      if (form.id === "loginForm") return handleLogin(event);
      if (form.id === "modalForm") return handleModalFormSubmit(event);
      if (form.id === "settingsBusinessForm") return handleSettingsBusinessSubmit(event);
      if (form.id === "settingsBrandingForm") return handleSettingsBrandingSubmit(event);
    });

    document.addEventListener("click", function (event) {
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        const route = routeButton.getAttribute("data-route");
        if (route === "logout") return signOut();
        location.hash = route;
        closeSidebar();
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const action = actionButton.getAttribute("data-action");
      handleAction(action, actionButton, event);
    });

    document.addEventListener("change", function (event) {
      const target = event.target;
      if (target.id === "posCustomerSelect") {
        state.pos.customer_id = target.value || "";
        renderCurrentRoute();
      }
      if (target.id === "branchSelect") {
        showToast("Branch selector updated locally.", "success");
      }
      if (target.id === "userSelect") {
        showToast("User profile switched visually only.", "success");
      }
    });

    document.addEventListener("input", function (event) {
      const target = event.target;
      if (target.id === "globalSearchInput") {
        state.search = target.value.trim();
        renderCurrentRoute();
      }
      if (target.id === "posProductSearch") {
        state.pos.search = target.value.trim();
        renderCurrentRoute();
      }
      if (target.id === "posDiscountInput") {
        state.pos.discount_amount = clampMoney(target.value);
        renderCurrentRoute();
      }
      if (target.id === "posShippingInput") {
        state.pos.shipping_amount = clampMoney(target.value);
        renderCurrentRoute();
      }
      if (target.id === "posAmountPaidInput") {
        state.pos.amount_paid = clampMoney(target.value);
        renderCurrentRoute();
      }
      if (target.id === "posNotesInput") {
        state.pos.notes = target.value;
      }
    });

    els.sidebarToggle.addEventListener("click", function () {
      els.sidebar.classList.toggle("is-open");
    });

    els.modalOverlay.addEventListener("click", function (event) {
      if (event.target === els.modalOverlay) closeModal();
    });
  }

  async function handleAction(action, button, event) {
    if (!action) return;
    switch (action) {
      case "logout":
        signOut();
        return;
      case "notify":
        showToast("Notifications panel can be connected to backend alerts later.", "success");
        return;
      case "close-modal":
        closeModal();
        return;
      case "quick-add-product":
        openProductModal();
        return;
      case "bulk-import-products":
      openBulkImportModal();
        return;
      case "bulk-import-pick-file":
      pickBulkImportFile();
      return;
      case "bulk-import-apply-mapping":
      await applyBulkImportMapping();
      return;
      case "bulk-import-start":
      await startBulkImport();
      return;
      case "bulk-import-refresh-history":
      await loadBulkImportHistory();
      renderCurrentRoute();
      return;
      case "bulk-import-edit-row":
      selectBulkImportRow(button.dataset.rowId);
      return;
      case "bulk-import-save-row":
      await saveBulkImportRow(button.dataset.rowId);
      return;
      case "bulk-import-download-errors":
      await downloadBulkImportErrors(button.dataset.jobId);
      return;
      case "bulk-import-download-template":
      await downloadAuthorizedFile(button.dataset.url, button.dataset.name);
      return;
      case "quick-add-customer":
      openCustomerModal();
      return;
      case "quick-receive-stock":
        openReceiveStockModal();
        return;
      case "quick-new-quotation":
        if (state.activeRoute !== "sales") location.hash = "sales";
        openQuotationModal();
        return;
      case "open-quotation-modal":
        openQuotationModal();
        return;
      case "pos-category":
        state.pos.categoryFilter = button.dataset.value || "All Products";
        renderCurrentRoute();
        return;
      case "pos-payment":
        state.pos.payment_method = button.dataset.value || "cash";
        renderCurrentRoute();
        return;
      case "add-to-basket":
        addProductToBasket(button.dataset.id);
        return;
      case "basket-inc":
        updateBasketQuantity(button.dataset.id, 1);
        return;
      case "basket-dec":
        updateBasketQuantity(button.dataset.id, -1);
        return;
      case "basket-remove":
        removeBasketItem(button.dataset.id);
        return;
      case "hold-sale":
        holdSale("held");
        return;
      case "suspend-sale":
        createQuotationFromBasket();
        return;
      case "cancel-sale":
        clearBasket(true);
        return;
      case "complete-sale":
        completeSale();
        return;
      case "recall-held":
        recallHeldSale(button.dataset.index);
        return;
      case "open-document":
        openDocumentModal(button.dataset.type, button.dataset.id, button.dataset.paper || "a4", button.dataset.title || "Document");
        return;
      case "download-document":
        downloadDocumentPdf(button.dataset.type, button.dataset.id, button.dataset.paper || defaultDocumentPaper(button.dataset.type));
        return;
      case "print-document":
        printDocument(button.dataset.type, button.dataset.id, button.dataset.paper || "a4");
        return;
      case "email-document":
        emailDocument(button.dataset.type, button.dataset.id);
        return;
      case "share-document":
        shareDocumentWhatsapp(button.dataset.type, button.dataset.id, button.dataset.paper || defaultDocumentPaper(button.dataset.type));
        return;
      case "convert-quotation":
        convertQuotation(button.dataset.id);
        return;
      case "record-invoice-payment":
        recordInvoicePayment(button.dataset.id);
        return;
      case "refresh-route":
        await routeTo(state.activeRoute, { force: true });
        return;
      default:
        return;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginMessage("", "");
    const payload = {
      email: els.email.value.trim(),
      password: els.password.value
    };
    if (!payload.email || !payload.password) {
      setLoginMessage("error", "Username/email and password are required.");
      return;
    }
    if (!els.totpWrap.classList.contains("hidden")) payload.totp_code = els.totp.value.trim();

    els.submitBtn.disabled = true;
    els.submitBtn.textContent = "Signing in…";
    try {
      const result = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
        noAuth: true,
        skipAuthRedirect: true
      });
      if (result && result.two_factor_required) {
        els.totpWrap.classList.remove("hidden");
        setLoginMessage("success", "Enter your authentication code to continue.");
        return;
      }
      if (!result || !result.token || !result.user) throw new Error("Login succeeded without a usable session.");
      persistSession(result.token, result.user);
      els.loginForm.reset();
      els.totpWrap.classList.add("hidden");
      showApp();
      await loadTopbarReferenceData();
      routeTo(readRoute());
    } catch (error) {
      setLoginMessage("error", error.message || "Unable to sign in.");
    } finally {
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = "Sign in";
    }
  }

  async function refreshSession() {
    try {
      const user = await apiJson("/api/auth/me", { skipAuthRedirect: true });
      persistSession(state.token, user);
    } catch (_error) {
      clearSession();
    }
  }

  async function signOut() {
    try {
      if (state.token) await authorizedFetch("/api/auth/logout", { method: "POST" });
    } catch (_error) {}
    clearSession();
    state.cache = {};
    destroyChart();
    closeModal();
    showLogin();
    location.hash = "";
    showToast("Signed out.", "success");
  }

  async function loadHealth() {
    try {
      const res = await fetch("/api/healthz");
      const data = await res.json();
      if (res.ok && data && data.status === "ok") {
        els.apiStatus.textContent = "Service online and ready.";
        els.apiStatus.style.borderColor = "rgba(46, 125, 50, 0.35)";
      } else {
        throw new Error("Unexpected health response");
      }
    } catch (_error) {
      els.apiStatus.textContent = "Service not responding yet. Confirm deployment variables and database access.";
      els.apiStatus.style.borderColor = "rgba(211, 47, 47, 0.35)";
    }
  }

  async function loadBranding() {
    try {
      const branding = await apiJson("/api/settings/branding", { noAuth: true, skipAuthRedirect: true });
      state.branding = Object.assign({}, DEFAULT_BRANDING, branding || {});
    } catch (_error) {
      state.branding = Object.assign({}, DEFAULT_BRANDING);
    }
    document.title = state.branding.business_name || DEFAULT_BRANDING.business_name;
    els.brandHeadline.textContent = state.branding.business_name || DEFAULT_BRANDING.business_name;
    els.brandSummary.textContent = firstText(
      state.branding.tagline,
      state.branding.description,
      DEFAULT_BRANDING.tagline
    );
    els.sidebarBrandName.textContent = state.branding.business_name || DEFAULT_BRANDING.business_name;
  }

  async function loadTopbarReferenceData() {
    const [branches] = await Promise.all([
      apiJson("/api/branches/options").catch(function () { return []; })
    ]);
    state.branches = normalizeList(branches);
    renderTopbarSelectors();
  }

  function showApp() {
    updateUserUI();
    els.loginShell.classList.add("hidden");
    els.appShell.classList.remove("hidden");
  }

  function showLogin() {
    els.appShell.classList.add("hidden");
    els.loginShell.classList.remove("hidden");
  }

  function updateUserUI() {
    const user = state.user || {};
    const name = firstText(user.name, user.email, "Admin");
    const role = firstText(user.role, "administrator").replace(/[_-]+/g, " ");
    const initials = name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join("") || "US";
    els.sidebarUserName.textContent = name;
    els.sidebarUserRole.textContent = titleize(role);
    els.sidebarUserInitials.textContent = initials;
  }

  function renderSidebar() {
    els.sidebarNav.innerHTML = NAV_ITEMS.map(function (item) {
      const route = item[0];
      const label = item[1];
      const icon = item[2];
      const isLogout = route === "logout";
      return '<li><button class="sidebar-link' + (state.activeRoute === route ? ' is-active' : '') + '" ' +
        (isLogout ? 'data-action="logout"' : 'data-route="' + escapeAttr(route) + '"') + '>' +
        '<span class="sidebar-link__left"><i class="' + icon + '"></i><span>' + escapeHtml(label) + '</span></span>' +
        (route === state.activeRoute && !isLogout ? '<i class="fa-solid fa-chevron-right"></i>' : '') +
        '</button></li>';
    }).join("");
  }

  function updateTopbarClock() {
    const now = new Date();
    if (els.topbarDate) {
      els.topbarDate.textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }
    if (els.topbarTime) {
      els.topbarTime.textContent = now.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      });
    }
  }

  function renderTopbarSelectors() {
    const branchOptions = state.branches.length
      ? state.branches.map(function (branch, index) {
          return '<option value="' + escapeAttr(String(branch.id || index + 1)) + '">' + escapeHtml(firstText(branch.name, branch.branch_name, "Main Branch")) + '</option>';
        }).join("")
      : '<option value="main">Main Branch</option>';
    const user = state.user || {};
    els.branchSelect.innerHTML = branchOptions;
    els.userSelect.innerHTML = '<option value="' + escapeAttr(String(user.id || "me")) + '">' + escapeHtml(firstText(user.name, user.email, "Admin")) + '</option>';
  }

  function readRoute() {
    const value = String(location.hash || "").replace(/^#/, "").trim();
    return ROUTE_META[value] ? value : DEFAULT_ROUTE;
  }

  async function routeTo(route, options) {
    const nextRoute = ROUTE_META[route] ? route : DEFAULT_ROUTE;
    if (!state.user) return;
    state.activeRoute = nextRoute;
    renderSidebar();
    const meta = ROUTE_META[nextRoute] || ROUTE_META[DEFAULT_ROUTE];
    els.pageTitle.textContent = meta[0];
    els.pageSubtitle.textContent = meta[1];
    if (!options || !options.force) renderLoading();
    try {
      await loadRouteData(nextRoute, options && options.force);
      renderCurrentRoute();
    } catch (error) {
      renderError(error);
    }
  }

  async function loadRouteData(route, force) {
    if (force) delete state.cache[route];
    switch (route) {
      case "dashboard":
        return loadDashboardData();
      case "sales":
        return loadSalesData();
      case "products":
        return loadProductsData();
      case "customers":
        return loadCustomersData();
      case "suppliers":
        return loadSuppliersData();
      case "purchases":
        return loadPurchasesData();
      case "inventory":
        return loadInventoryData();
      case "invoices":
        return loadInvoicesData();
      case "quotations":
        return loadQuotationsData();
      case "reports":
        return loadReportsData();
      case "expenses":
        return loadExpensesData();
      case "accounting":
        return loadAccountingData();
      case "users":
        return loadUsersData();
      case "settings":
        return loadSettingsData();
      default:
        return Promise.resolve();
    }
  }

  async function loadDashboardData() {
    const today = isoDate(new Date());
    const [stats, recent, topProducts, chart, quotations, invoices, inventory, sales] = await Promise.all([
      apiJson("/api/dashboard/stats").catch(function () { return {}; }),
      apiJson("/api/dashboard/recent-transactions").catch(function () { return []; }),
      apiJson("/api/dashboard/top-products").catch(function () { return []; }),
      apiJson("/api/dashboard/sales-chart").catch(function () { return []; }),
      apiJson("/api/quotations?limit=40").catch(function () { return { data: [] }; }),
      apiJson("/api/invoices?limit=40").catch(function () { return { data: [] }; }),
      apiJson("/api/inventory/stock-count").catch(function () { return []; }),
      apiJson("/api/pos/sales?limit=30").catch(function () { return { data: [] }; })
    ]);
    state.cache.dashboard = {
      stats: stats || {},
      recent: normalizeList(recent),
      topProducts: normalizeList(topProducts),
      chart: normalizeList(chart),
      quotations: normalizeList(quotations),
      invoices: normalizeList(invoices),
      inventory: normalizeList(inventory),
      sales: normalizeList(sales),
      date: today
    };
  }

  async function loadSalesData() {
    const [products, categories, customers, sales] = await Promise.all([
      apiJson("/api/products?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; }),
      apiJson("/api/customers?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/pos/sales?limit=12").catch(function () { return { data: [] }; })
    ]);
    state.pos.products = normalizeList(products);
    state.pos.categories = normalizeList(categories);
    state.pos.customers = normalizeList(customers);
    state.cache.sales = { recentSales: normalizeList(sales) };
  }

  async function loadProductsData() {
    const [products, categories] = await Promise.all([
      apiJson("/api/products?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; })
    ]);
    state.cache.products = { products: normalizeList(products), categories: normalizeList(categories) };
  }

  async function loadCustomersData() {
    const customers = await apiJson("/api/customers?limit=200").catch(function () { return { data: [] }; });
    state.cache.customers = { customers: normalizeList(customers) };
  }

  async function loadSuppliersData() {
    const suppliers = await apiJson("/api/suppliers?limit=150").catch(function () { return { data: [] }; });
    state.cache.suppliers = { suppliers: normalizeList(suppliers) };
  }

  async function loadPurchasesData() {
    const purchases = await apiJson("/api/purchases?limit=120").catch(function () { return { data: [] }; });
    state.cache.purchases = { purchases: normalizeList(purchases) };
  }

  async function loadInventoryData() {
    const [stock, movements, transfers] = await Promise.all([
      apiJson("/api/inventory/stock-count").catch(function () { return []; }),
      apiJson("/api/inventory/movements?limit=40").catch(function () { return { data: [] }; }),
      apiJson("/api/inventory/transfers?limit=40").catch(function () { return { data: [] }; })
    ]);
    state.cache.inventory = {
      stock: normalizeList(stock),
      movements: normalizeList(movements),
      transfers: normalizeList(transfers)
    };
  }

  async function loadInvoicesData() {
    const invoices = await apiJson("/api/invoices?limit=120").catch(function () { return { data: [] }; });
    state.cache.invoices = { invoices: normalizeList(invoices) };
  }

  async function loadQuotationsData() {
    const quotations = await apiJson("/api/quotations?limit=120").catch(function () { return { data: [] }; });
    state.cache.quotations = { quotations: normalizeList(quotations) };
  }

  async function loadReportsData() {
    const range = defaultDateRange();
    const query = reportQuery(range);
    const [salesSummary, profitLoss, inventoryValue] = await Promise.all([
      apiJson("/api/reports/sales-summary?" + query).catch(function () { return {}; }),
      apiJson("/api/reports/profit-loss?" + query).catch(function () { return {}; }),
      apiJson("/api/reports/inventory-valuation").catch(function () { return []; })
    ]);
    state.cache.reports = {
      salesSummary: salesSummary || {},
      profitLoss: profitLoss || {},
      inventoryValue: normalizeList(inventoryValue),
      range: range
    };
  }

  async function loadExpensesData() {
    const expenses = await apiJson("/api/expenses?limit=150").catch(function () { return { data: [] }; });
    state.cache.expenses = { expenses: normalizeList(expenses) };
  }

  async function loadAccountingData() {
    await Promise.all([loadInvoicesData(), loadExpensesData(), loadReportsData(), loadPurchasesData()]);
    state.cache.accounting = { loaded: true };
  }

  async function loadUsersData() {
    const users = await apiJson("/api/users").catch(function () { return []; });
    state.cache.users = { users: normalizeList(users) };
  }

  async function loadSettingsData() {
    const [settings, branding] = await Promise.all([
      apiJson("/api/settings").catch(function () { return {}; }),
      apiJson("/api/settings/branding").catch(function () { return {}; })
    ]);
    state.cache.settings = { settings: settings || {}, branding: branding || {} };
  }

  function renderCurrentRoute() {
    const route = state.activeRoute;
    switch (route) {
      case "dashboard":
        renderDashboard();
        break;
      case "sales":
        renderSales();
        break;
      case "products":
        renderProducts();
        break;
      case "customers":
        renderCustomers();
        break;
      case "suppliers":
        renderSuppliers();
        break;
      case "purchases":
        renderPurchases();
        break;
      case "inventory":
        renderInventory();
        break;
      case "invoices":
        renderInvoices();
        break;
      case "quotations":
        renderQuotations();
        break;
      case "reports":
        renderReports();
        break;
      case "expenses":
        renderExpenses();
        break;
      case "accounting":
        renderAccounting();
        break;
      case "users":
        renderUsers();
        break;
      case "settings":
        renderSettings();
        break;
      default:
        renderDashboard();
    }
  }

  function renderLoading() {
    els.viewRoot.innerHTML = '<section class="card loader-card"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><div>Loading ' + escapeHtml((ROUTE_META[state.activeRoute] || ["page"])[0]) + '…</div></section>';
  }

  function renderError(error) {
    destroyChart();
    els.viewRoot.innerHTML = '<section class="card section-card page-empty"><i class="fa-solid fa-circle-exclamation"></i><h3>Unable to load this view</h3><p>' + escapeHtml(error && error.message ? error.message : 'Unexpected error.') + '</p><div class="inline-group"><button class="btn btn-primary" data-action="refresh-route">Try again</button></div></section>';
  }

  function renderDashboard() {
    const data = state.cache.dashboard || {};
    const recentSales = applySearch(data.sales || [], state.search, ["invoice_number", "customer_name", "payment_method", "status"]);
    const topProducts = applySearch(data.topProducts || [], state.search, ["product_name", "name"]);
    const stats = computeDashboardStats(data);

    els.viewRoot.innerHTML = [
      renderWorkspaceHero(),
      '<div class="dashboard-showcase">',
      '<div class="dashboard-main">',
      renderDashboardPrimaryKpis(stats),
      renderDashboardSecondaryKpis(stats),
      '<div class="dashboard-grid">',
      '<section class="card dashboard-chart-card"><div class="section-head"><div><h3>Sales chart</h3><p>Last 7 days performance</p></div><span class="badge success">Live</span></div><div class="chart-wrap"><canvas id="salesChartCanvas"></canvas></div></section>',
      '<section class="card side-card"><div class="section-head"><div><h3>Top selling products</h3><p>Most active solar and electrical lines</p></div></div>' +
        (topProducts.length ? '<div class="list-stack">' + topProducts.slice(0, 6).map(function (product) {
          const totalAmount = firstNumber(product.total_amount, product.total_sales, 0);
          const soldCount = firstNumber(product.quantity_sold, product.qty_sold, product.total_quantity, 0);
          return '<div class="list-item"><div class="list-item__rank">' + escapeHtml(String(topProducts.indexOf(product) + 1)) + '</div><div><div class="list-item__title">' + escapeHtml(firstText(product.product_name, product.name, "Product")) + '</div><div class="list-item__meta">' + escapeHtml(firstText(product.category_name, product.category, "Sales performance")) + '</div></div><strong>' + escapeHtml(totalAmount ? money(totalAmount) : numberText(soldCount) + ' sold') + '</strong></div>';
        }).join("") + '</div>' : renderEmptyInline("No top selling products available.")) + '</section>',
      '<section class="card recent-sales-card"><div class="section-head"><div><h3>Recent sales</h3><p>Latest invoices and receipts issued</p></div><button class="btn btn-outline" data-route="invoices">View invoices</button></div>' +
        renderTable([
          "Invoice", "Customer", "Amount", "Payment", "Status"
        ], recentSales.slice(0, 8).map(function (row) {
          return [
            escapeHtml(firstText(row.invoice_number, row.receipt_number, row.reference, "—")),
            escapeHtml(firstText(row.customer_name, "Walk-in Customer")),
            money(firstNumber(row.total, row.amount, 0)),
            escapeHtml(titleize(firstText(row.payment_method, "cash"))),
            renderBadge(firstText(row.status, "paid"))
          ];
        }), "No sales available.") + '</section>',
      '<section class="card quick-actions-card"><div class="section-head"><div><h3>Quick actions</h3><p>Common cashier and operations shortcuts</p></div></div>' + renderQuickActions() + '</section>',
      '</div>',
      '</div>',
      renderDashboardDocumentRail(data),
      '</div>'
    ].join("");
    renderSalesChart(data.chart || [], stats.chartValues);
  }

  function renderSales() {
    const products = filterPosProducts();
    const totals = calculatePosTotals();
    const recentSales = applySearch((state.cache.sales || {}).recentSales || [], state.search, ["customer_name", "invoice_number", "receipt_number"]);
    const customerOptions = '<option value="">Walk-in Customer</option>' + state.pos.customers.map(function (customer) {
      return '<option value="' + escapeAttr(String(customer.id)) + '"' + (String(state.pos.customer_id) === String(customer.id) ? ' selected' : '') + '>' + escapeHtml(firstText(customer.name, customer.company, "Customer")) + '</option>';
    }).join("");

    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="quick-add-customer"><i class="fa-solid fa-user-plus"></i>Add Customer</button><button class="btn btn-outline" data-action="open-quotation-modal"><i class="fa-solid fa-file-signature"></i>New Quotation</button></div><div class="stats-inline"><span class="document-chip">Held Sales: ' + escapeHtml(String(state.pos.held.length)) + '</span><span class="document-chip">Basket Items: ' + escapeHtml(String(state.pos.basket.length)) + '</span></div></div>',
      '<div class="pos-layout">',
      '<section class="card section-card pos-column pos-column--catalog"><div class="section-head"><div><h3>New Sale</h3><p>Search, scan barcode or browse by category</p></div><span class="badge warning">Counter Mode</span></div><label class="search-field search-field--compact"><i class="fa-solid fa-magnifying-glass"></i><input id="posProductSearch" type="search" placeholder="Scan barcode or search product..." value="' + escapeAttr(state.pos.search) + '" /></label><div class="pos-catalog-shell"><div class="pos-categories-panel">' + renderPosCategoryChips() + '</div><div class="pos-products-panel">' + renderProductGrid(products) + '</div></div></section>',
      '<section class="card section-card pos-column"><div class="section-head"><div><h3>Basket</h3><p>Build the sale and apply price adjustments</p></div><span class="document-chip">Items ' + escapeHtml(String(state.pos.basket.length)) + '</span></div>' + renderBasketTable() + '<div class="pos-summary"><div class="pos-summary-row"><span>Subtotal</span><strong>' + money(totals.subtotal) + '</strong></div><div class="pos-summary-row"><span>Discount</span><strong><input id="posDiscountInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.discount_amount)) + '" /></strong></div><div class="pos-summary-row"><span>VAT (16%)</span><strong>' + money(totals.vat) + '</strong></div><div class="pos-summary-row"><span>Shipping</span><strong><input id="posShippingInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.shipping_amount)) + '" /></strong></div><div class="pos-summary-row total"><span>Grand Total</span><strong>' + money(totals.total) + '</strong></div></div></section>',
      '<section class="card section-card pos-column pos-column--payment"><div class="section-head"><div><h3>Customer & Payment</h3><p>Assign buyer, payment method and notes</p></div></div><div class="inline-group"><select id="posCustomerSelect">' + customerOptions + '</select><button class="btn btn-outline" data-action="quick-add-customer"><i class="fa-solid fa-plus"></i></button></div><div class="payment-options">' + PAYMENT_METHODS.map(function (method) {
        return '<button class="payment-chip' + (state.pos.payment_method === method ? ' active' : '') + '" data-action="pos-payment" data-value="' + escapeAttr(method) + '">' + escapeHtml(titleize(method.replace("bank_transfer", "bank"))) + '</button>';
      }).join("") + '</div><div class="form-grid"><label><span>Cash Received</span><input id="posAmountPaidInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.amount_paid)) + '" /></label><div class="document-chip document-chip--balance"><strong>Balance / Change</strong><div>' + money(state.pos.amount_paid - totals.total) + '</div></div><label class="form-span-2"><span>Notes</span><textarea id="posNotesInput" placeholder="Sale notes, delivery note, installation details...">' + escapeHtml(state.pos.notes || "") + '</textarea></label></div><div class="pos-action-grid"><button class="btn btn-outline" data-action="hold-sale">Hold Sale</button><button class="btn btn-secondary" data-action="suspend-sale">Suspend</button><button class="btn btn-danger" data-action="cancel-sale">Cancel</button><button class="btn btn-primary" data-action="complete-sale">Complete Sale</button></div>' + renderHeldSales() + '</section>',
      '</div>',
      '<section class="card section-card" style="margin-top:20px"><div class="section-head"><div><h3>Recent POS Sales</h3><p>Latest completed transactions</p></div><button class="btn btn-outline" data-route="dashboard">Back to dashboard</button></div>' + renderTable(["Receipt", "Customer", "Amount", "Method", "Status", "Actions"], recentSales.slice(0, 8).map(function (sale) {
        return [
          escapeHtml(firstText(sale.receipt_number, sale.invoice_number, "—")),
          escapeHtml(firstText(sale.customer_name, "Walk-in Customer")),
          money(firstNumber(sale.total, sale.amount, 0)),
          escapeHtml(titleize(firstText(sale.payment_method, "cash"))),
          renderBadge(firstText(sale.status, "paid")),
          renderDocumentButtons("receipt", sale.id, "80mm", "Receipt")
        ];
      }), "No recent sales available.") + '</section>'
    ].join("");
  }

  function renderProducts() {
    const products = applySearch((state.cache.products || {}).products || [], state.search, ["product_name", "product_code", "barcode", "category_name"]);
    const summary = productSummary(products);
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="quick-add-product"><i class="fa-solid fa-plus"></i>Add Product</button><button class="btn btn-outline" data-route="inventory"><i class="fa-solid fa-warehouse"></i>Inventory</button></div><div class="stats-inline"><span class="document-chip">Categories: ' + escapeHtml(String(summary.categories)) + '</span><span class="document-chip">Low Stock: ' + escapeHtml(String(summary.lowStock)) + '</span></div></div>',
      renderOverviewTiles([
        ["Products", numberText(summary.total)],
        ["Low Stock", numberText(summary.lowStock)],
        ["Out of Stock", numberText(summary.outOfStock)],
        ["Average Price", money(summary.avgPrice)]
      ]),
      '<section class="card section-card">' + renderTable(["Product", "SKU", "Category", "Price", "Stock"], products.map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(firstText(item.product_code, item.barcode, "—")),
          escapeHtml(firstText(item.category_name, item.category, "Uncategorised")),
          money(firstNumber(item.selling_price, 0)),
          renderStockPill(item)
        ];
      }), "No products found.") + '</section>'
    ].join("");
  }

  function renderCustomers() {
    const customers = applySearch((state.cache.customers || {}).customers || [], state.search, ["name", "phone", "email", "company"]);
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="quick-add-customer"><i class="fa-solid fa-user-plus"></i>Add Customer</button><button class="btn btn-outline" data-route="sales">Open POS</button></div></div>',
      renderOverviewTiles([
        ["Customers", numberText(customers.length)],
        ["With Credit", numberText(customers.filter(function (customer) { return firstNumber(customer.balance, 0) > 0; }).length)],
        ["Email Records", numberText(customers.filter(function (customer) { return firstText(customer.email); }).length)],
        ["Phone Records", numberText(customers.filter(function (customer) { return firstText(customer.phone); }).length)]
      ]),
      '<section class="card section-card">' + renderTable(["Customer", "Phone", "Email", "Company", "Balance"], customers.map(function (customer) {
        return [
          escapeHtml(firstText(customer.name, "—")),
          escapeHtml(firstText(customer.phone, "—")),
          escapeHtml(firstText(customer.email, "—")),
          escapeHtml(firstText(customer.company, "—")),
          money(firstNumber(customer.balance, 0))
        ];
      }), "No customers found.") + '</section>'
    ].join("");
  }

  function renderSuppliers() {
    const suppliers = applySearch((state.cache.suppliers || {}).suppliers || [], state.search, ["name", "phone", "email"]);
    els.viewRoot.innerHTML = renderSimpleModulePage(
      "Suppliers",
      suppliers,
      [["Suppliers", numberText(suppliers.length)], ["With Email", numberText(suppliers.filter(function (item) { return firstText(item.email); }).length)], ["With Payables", numberText(suppliers.filter(function (item) { return firstNumber(item.balance, 0) > 0; }).length)], ["Phone Records", numberText(suppliers.filter(function (item) { return firstText(item.phone); }).length)]],
      ["Supplier", "Phone", "Email", "Balance"],
      function (item) {
        return [escapeHtml(firstText(item.name, "—")), escapeHtml(firstText(item.phone, "—")), escapeHtml(firstText(item.email, "—")), money(firstNumber(item.balance, 0))];
      },
      "No suppliers found."
    );
  }

  function renderPurchases() {
    const purchases = applySearch((state.cache.purchases || {}).purchases || [], state.search, ["reference", "supplier_name", "status"]);
    els.viewRoot.innerHTML = renderSimpleModulePage(
      "Purchases",
      purchases,
      [["Purchase Orders", numberText(purchases.length)], ["Received", numberText(purchases.filter(function (item) { return firstText(item.status) === 'received'; }).length)], ["Pending", numberText(purchases.filter(function (item) { return firstText(item.status) !== 'received'; }).length)], ["Total Value", money(sumBy(purchases, function (item) { return firstNumber(item.total, item.grand_total, 0); }))]],
      ["Reference", "Supplier", "Total", "Status", "Date"],
      function (item) {
        return [
          escapeHtml(firstText(item.reference, item.purchase_number, "—")),
          escapeHtml(firstText(item.supplier_name, "—")),
          money(firstNumber(item.total, item.grand_total, 0)),
          renderBadge(firstText(item.status, "draft")),
          escapeHtml(formatDate(item.created_at))
        ];
      },
      "No purchases found."
    );
  }

  function renderInventory() {
    const data = state.cache.inventory || {};
    const stock = applySearch(data.stock || [], state.search, ["product_name", "product_code", "category_name"]);
    const low = stock.filter(function (item) { return isLowStock(item); }).length;
    const out = stock.filter(function (item) { return firstNumber(item.current_stock, 0) <= 0; }).length;
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="quick-receive-stock"><i class="fa-solid fa-boxes-stacked"></i>Receive Stock</button><button class="btn btn-outline" data-route="products">Product List</button></div></div>',
      renderOverviewTiles([
        ["Stock Lines", numberText(stock.length)],
        ["Low Stock", numberText(low)],
        ["Out of Stock", numberText(out)],
        ["Stock Value", money(sumBy(stock, function (item) { return firstNumber(item.current_stock, 0) * firstNumber(item.cost_price, item.selling_price, 0); }))]
      ]),
      '<div class="two-column-grid"><section class="card section-card">' + renderTable(["Product", "SKU", "Stock", "Min", "Status"], stock.map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(firstText(item.product_code, "—")),
          escapeHtml(numberText(firstNumber(item.current_stock, 0))),
          escapeHtml(numberText(firstNumber(item.min_stock, 0))),
          renderStockPill(item)
        ];
      }), "No stock records found.") + '</section><section class="card section-card"><div class="section-head"><div><h3>Recent stock movements</h3><p>Latest inventory activity</p></div></div>' + renderTable(["Product", "Type", "Quantity", "Date"], (data.movements || []).slice(0, 10).map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(titleize(firstText(item.movement_type, item.type, "movement"))),
          escapeHtml(numberText(firstNumber(item.quantity, 0))),
          escapeHtml(formatDateTime(item.created_at))
        ];
      }), "No recent movements.") + '</section></div>'
    ].join("");
  }

  function renderInvoices() {
    const invoices = applySearch((state.cache.invoices || {}).invoices || [], state.search, ["invoice_number", "customer_name", "status"]);
    els.viewRoot.innerHTML = [
      renderOverviewTiles([
        ["Invoices", numberText(invoices.length)],
        ["Outstanding", money(sumBy(invoices, function (item) { return firstNumber(item.balance_due, 0); }))],
        ["Paid", numberText(invoices.filter(function (item) { return firstText(item.status) === 'paid'; }).length)],
        ["Value", money(sumBy(invoices, function (item) { return firstNumber(item.total, 0); }))]
      ]),
      '<section class="card section-card">' + renderTable(["Invoice No", "Customer", "Total", "Paid", "Balance", "Status", "Actions"], invoices.map(function (invoice) {
        return [
          escapeHtml(firstText(invoice.invoice_number, "—")),
          escapeHtml(firstText(invoice.customer_name, "Walk-in Customer")),
          money(firstNumber(invoice.total, 0)),
          money(firstNumber(invoice.amount_paid, 0)),
          money(firstNumber(invoice.balance_due, 0)),
          renderBadge(firstText(invoice.status, "sent")),
          renderDocumentButtons("invoice", invoice.id, "a4", "Invoice") + ' <button class="btn btn-outline" data-action="record-invoice-payment" data-id="' + escapeAttr(String(invoice.id)) + '"><i class="fa-solid fa-wallet"></i>Pay</button>'
        ];
      }), "No invoices found.") + '</section>'
    ].join("");
  }

  function renderQuotations() {
    const quotations = applySearch((state.cache.quotations || {}).quotations || [], state.search, ["quotation_number", "customer_name", "status"]);
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="open-quotation-modal"><i class="fa-solid fa-plus"></i>Create Quotation</button><button class="btn btn-outline" data-route="sales">Use current basket</button></div></div>',
      renderOverviewTiles([
        ["Quotations", numberText(quotations.length)],
        ["Pending", numberText(quotations.filter(function (item) { return firstText(item.status, 'draft') !== 'converted'; }).length)],
        ["Converted", numberText(quotations.filter(function (item) { return firstText(item.status) === 'converted'; }).length)],
        ["Total Value", money(sumBy(quotations, function (item) { return firstNumber(item.total, 0); }))]
      ]),
      '<section class="card section-card">' + renderTable(["Quotation No", "Customer", "Valid Until", "Total", "Status", "Actions"], quotations.map(function (quotation) {
        return [
          escapeHtml(firstText(quotation.quotation_number, "—")),
          escapeHtml(firstText(quotation.customer_name, "Walk-in Customer")),
          escapeHtml(formatDate(quotation.valid_until)),
          money(firstNumber(quotation.total, 0)),
          renderBadge(firstText(quotation.status, "draft")),
          renderDocumentButtons("quotation", quotation.id, "a4", "Quotation") + ' <button class="btn btn-secondary" data-action="convert-quotation" data-id="' + escapeAttr(String(quotation.id)) + '"><i class="fa-solid fa-repeat"></i>Convert</button>'
        ];
      }), "No quotations found.") + '</section>'
    ].join("");
  }

  function renderReports() {
    const data = state.cache.reports || {};
    const salesSummary = data.salesSummary || {};
    const profitLoss = data.profitLoss || {};
    const inventoryValue = data.inventoryValue || [];
    els.viewRoot.innerHTML = [
      renderOverviewTiles([
        ["Sales Summary", money(firstNumber(salesSummary.total_sales, salesSummary.sales, DEFAULT_DASHBOARD.todaySales))],
        ["Gross Profit", money(firstNumber(profitLoss.gross_profit, DEFAULT_DASHBOARD.todayProfit))],
        ["Net Profit", money(firstNumber(profitLoss.net_profit, DEFAULT_DASHBOARD.todayProfit * 0.86))],
        ["Inventory Value", money(sumBy(inventoryValue, function (item) { return firstNumber(item.stock_value, item.total_value, 0); }))]
      ]),
      '<div class="two-column-grid"><section class="card section-card"><div class="section-head"><div><h3>Sales summary</h3><p>Current month business performance</p></div></div><div class="stats-inline">' +
        renderDocumentChip("Date Range", formatDate(data.range && data.range.from) + " → " + formatDate(data.range && data.range.to)) +
        renderDocumentChip("Transactions", numberText(firstNumber(salesSummary.transactions, salesSummary.total_transactions, DEFAULT_DASHBOARD.transactions))) +
        renderDocumentChip("Average Sale", money(firstNumber(salesSummary.average_sale, 0))) +
      '</div></section><section class="card section-card"><div class="section-head"><div><h3>Profit & Loss</h3><p>High-level profitability view</p></div></div><div class="stats-inline">' +
        renderDocumentChip("Revenue", money(firstNumber(profitLoss.revenue, salesSummary.total_sales, DEFAULT_DASHBOARD.todaySales))) +
        renderDocumentChip("Expenses", money(firstNumber(profitLoss.expenses, 0))) +
        renderDocumentChip("Net", money(firstNumber(profitLoss.net_profit, DEFAULT_DASHBOARD.todayProfit))) +
      '</div></section></div>',
      '<section class="card section-card"><div class="section-head"><div><h3>Inventory valuation</h3><p>Product valuation by line item</p></div></div>' + renderTable(["Product", "Stock", "Unit Cost", "Stock Value"], inventoryValue.map(function (item) {
        return [
          escapeHtml(firstText(item.product_name, "—")),
          escapeHtml(numberText(firstNumber(item.current_stock, item.stock, 0))),
          money(firstNumber(item.cost_price, item.unit_cost, 0)),
          money(firstNumber(item.stock_value, item.total_value, 0))
        ];
      }), "No valuation records found.") + '</section>'
    ].join("");
  }

  function renderExpenses() {
    const expenses = applySearch((state.cache.expenses || {}).expenses || [], state.search, ["description", "category", "payment_method"]);
    els.viewRoot.innerHTML = renderSimpleModulePage(
      "Expenses",
      expenses,
      [["Expenses", numberText(expenses.length)], ["Total", money(sumBy(expenses, function (item) { return firstNumber(item.amount, 0); }))], ["Cash", numberText(expenses.filter(function (item) { return firstText(item.payment_method) === 'cash'; }).length)], ["Mpesa", numberText(expenses.filter(function (item) { return firstText(item.payment_method) === 'mpesa'; }).length)]],
      ["Description", "Category", "Method", "Amount", "Date"],
      function (item) {
        return [
          escapeHtml(firstText(item.description, "—")),
          escapeHtml(firstText(item.category, "—")),
          escapeHtml(titleize(firstText(item.payment_method, "cash"))),
          money(firstNumber(item.amount, 0)),
          escapeHtml(formatDate(item.created_at))
        ];
      },
      "No expenses found."
    );
  }

  function renderAccounting() {
    const invoices = (state.cache.invoices || {}).invoices || [];
    const expenses = (state.cache.expenses || {}).expenses || [];
    const purchases = (state.cache.purchases || {}).purchases || [];
    const reports = state.cache.reports || {};
    const receivables = sumBy(invoices, function (item) { return firstNumber(item.balance_due, 0); });
    const revenue = firstNumber((reports.salesSummary || {}).total_sales, DEFAULT_DASHBOARD.todaySales);
    const expenseTotal = sumBy(expenses, function (item) { return firstNumber(item.amount, 0); });
    const payables = sumBy(purchases, function (item) { return firstNumber(item.balance_due, item.total, 0); });
    els.viewRoot.innerHTML = [
      renderOverviewTiles([
        ["Revenue", money(revenue)],
        ["Receivables", money(receivables)],
        ["Payables", money(payables)],
        ["Net Position", money(revenue - expenseTotal - payables)]
      ]),
      '<div class="two-column-grid"><section class="card section-card"><div class="section-head"><div><h3>Receivables & Collections</h3><p>Open customer balances</p></div></div>' + renderTable(["Invoice", "Customer", "Balance", "Status"], invoices.slice(0, 10).map(function (item) {
        return [
          escapeHtml(firstText(item.invoice_number, "—")),
          escapeHtml(firstText(item.customer_name, "Walk-in Customer")),
          money(firstNumber(item.balance_due, 0)),
          renderBadge(firstText(item.status, "sent"))
        ];
      }), "No invoices available.") + '</section><section class="card section-card"><div class="section-head"><div><h3>Expense & payable summary</h3><p>Operating and supplier commitments</p></div></div><div class="stats-inline">' +
      renderDocumentChip("Expenses", money(expenseTotal)) + renderDocumentChip("Supplier Payables", money(payables)) + renderDocumentChip("Purchase Orders", numberText(purchases.length)) + '</div></section></div>'
    ].join("");
  }

  function renderUsers() {
    const users = applySearch((state.cache.users || {}).users || [], state.search, ["name", "email", "role"]);
    els.viewRoot.innerHTML = renderSimpleModulePage(
      "Users",
      users,
      [["Users", numberText(users.length)], ["Cashiers", numberText(users.filter(function (item) { return firstText(item.role) === 'cashier'; }).length)], ["Managers", numberText(users.filter(function (item) { return contains(firstText(item.role), 'manager'); }).length)], ["Active Records", numberText(users.length)]],
      ["Name", "Email", "Role", "Branch"],
      function (item) {
        return [
          escapeHtml(firstText(item.name, "—")),
          escapeHtml(firstText(item.email, "—")),
          renderBadge(firstText(item.role, "user")),
          escapeHtml(firstText(item.branch_name, item.branch, "Main Branch"))
        ];
      },
      "No users available or permission denied."
    );
  }

  function renderSettings() {
    const data = state.cache.settings || {};
    const settings = data.settings || {};
    const branding = Object.assign({}, state.branding, data.branding || {});
    els.viewRoot.innerHTML = [
      '<div class="settings-panels">',
      '<section class="card section-card"><div class="section-head"><div><h3>Business Settings</h3><p>Primary business identity used across transactions.</p></div></div><form id="settingsBusinessForm" class="form-grid two"><label><span>Business Name</span><input name="business_name" value="' + escapeAttr(firstText(settings.business_name, branding.business_name, DEFAULT_BRANDING.business_name)) + '" /></label><label><span>Currency</span><input name="currency" value="' + escapeAttr(firstText(settings.currency, 'KES')) + '" /></label><label><span>Phone</span><input name="business_phone" value="' + escapeAttr(firstText(settings.business_phone, branding.business_phone, DEFAULT_BRANDING.business_phone)) + '" /></label><label><span>Email</span><input name="business_email" value="' + escapeAttr(firstText(settings.business_email, branding.business_email, DEFAULT_BRANDING.business_email)) + '" /></label><label class="form-span-2"><span>Address</span><textarea name="business_address">' + escapeHtml(firstText(settings.business_address, branding.business_address, DEFAULT_BRANDING.business_address)) + '</textarea></label><div class="form-span-2"><button class="btn btn-primary" type="submit">Save Business Settings</button></div></form></section>',
      '<section class="card section-card"><div class="section-head"><div><h3>Branding</h3><p>Document header and front-end branding values.</p></div></div><form id="settingsBrandingForm" class="form-grid two"><label><span>Display Name</span><input name="business_name" value="' + escapeAttr(firstText(branding.business_name, DEFAULT_BRANDING.business_name)) + '" /></label><label><span>Tagline</span><input name="tagline" value="' + escapeAttr(firstText(branding.tagline, branding.description, DEFAULT_BRANDING.tagline)) + '" /></label><label><span>Phone</span><input name="business_phone" value="' + escapeAttr(firstText(branding.business_phone, DEFAULT_BRANDING.business_phone)) + '" /></label><label><span>Email</span><input name="business_email" value="' + escapeAttr(firstText(branding.business_email, DEFAULT_BRANDING.business_email)) + '" /></label><label class="form-span-2"><span>Address</span><textarea name="business_address">' + escapeHtml(firstText(branding.business_address, DEFAULT_BRANDING.business_address)) + '</textarea></label><div class="form-span-2"><button class="btn btn-primary" type="submit">Save Branding</button></div></form></section>',
      '</div>'
    ].join("");
  }

  function renderDashboardPrimaryKpis(stats) {
    const cards = [
      ["Today’s Sales", stats.todaySales, "fa-solid fa-sack-dollar", true],
      ["Today’s Profit", stats.todayProfit, "fa-solid fa-chart-line", true],
      ["Cash in Till", stats.cashInTill, "fa-solid fa-cash-register", true],
      ["Mpesa Collections", stats.mpesaCollections, "fa-solid fa-mobile-screen-button", true]
    ];
    return '<div class="kpi-grid">' + cards.map(function (card) {
      return renderKpiCard(card[0], card[1], card[2], card[3]);
    }).join("") + '</div>';
  }

  function renderDashboardSecondaryKpis(stats) {
    const cards = [
      ["Transactions", stats.transactions, "fa-solid fa-receipt", false],
      ["Pending Quotations", stats.pendingQuotations, "fa-solid fa-file-signature", false],
      ["Credit Sales", stats.creditSales, "fa-solid fa-handshake", true],
      ["Low Stock Items", stats.lowStockItems, "fa-solid fa-triangle-exclamation", false],
      ["Out of Stock Items", stats.outOfStockItems, "fa-solid fa-box-open", false]
    ];
    return '<div class="kpi-grid--secondary">' + cards.map(function (card) {
      return renderKpiCard(card[0], card[1], card[2], card[3]);
    }).join("") + '</div>';
  }

  function renderKpiCard(label, value, icon, moneyFlag) {
    return '<article class="card kpi-card"><div class="kpi-card__head"><div><div class="kpi-card__label">' + escapeHtml(label) + '</div><div class="kpi-card__value">' + (moneyFlag ? money(value) : escapeHtml(numberText(value))) + '</div></div><div class="kpi-card__icon"><i class="' + icon + '"></i></div></div><div class="kpi-card__trend up">Updated from live records</div></article>';
  }

  function renderQuickActions() {
    const actions = [
      ["sales", "New Sale", "fa-solid fa-cart-plus", "Open POS counter"],
      ["quotations", "New Quotation", "fa-solid fa-file-circle-plus", "Prepare customer quote"],
      ["products", "Add Product", "fa-solid fa-boxes-packing", "Create stock item"],
      ["inventory", "Receive Stock", "fa-solid fa-boxes-stacked", "Record incoming stock"],
      ["customers", "Add Customer", "fa-solid fa-user-plus", "Register buyer"],
      ["reports", "View Reports", "fa-solid fa-chart-pie", "Open analytics"]
    ];
    return '<div class="dashboard-quick-actions">' + actions.map(function (item) {
      return '<button class="quick-action-btn" data-route="' + item[0] + '"><i class="' + item[2] + '"></i><span>' + item[1] + '</span><small>' + item[3] + '</small></button>';
    }).join("") + '</div>';
  }

  function renderPosCategoryChips() {
    return '<div class="filter-chips">' + SALE_CATEGORIES.map(function (name) {
      return '<button class="chip' + (state.pos.categoryFilter === name ? ' active' : '') + '" data-action="pos-category" data-value="' + escapeAttr(name) + '">' + escapeHtml(name) + '</button>';
    }).join("") + '</div>';
  }

  function renderProductGrid(products) {
    if (!products.length) return renderEmptyInline("No products match the current search or category.");
    return '<div class="product-grid">' + products.map(function (product) {
      const image = sanitizeUrl(product.image_url);
      return '<article class="product-card"><div class="product-card__image">' + (image ? '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(firstText(product.product_name, 'Product')) + '" />' : '<i class="fa-solid fa-solar-panel"></i>') + '</div><div class="product-card__body"><div class="product-card__title">' + escapeHtml(firstText(product.product_name, 'Product')) + '</div><div class="product-card__meta"><span>' + money(firstNumber(product.selling_price, 0)) + '</span>' + renderStockPill(product) + '</div><button class="btn btn-primary" data-action="add-to-basket" data-id="' + escapeAttr(String(product.id)) + '"><i class="fa-solid fa-plus"></i>Add</button></div></article>';
    }).join("") + '</div>';
  }

  function renderBasketTable() {
    if (!state.pos.basket.length) return '<div class="empty-state"><i class="fa-solid fa-basket-shopping"></i>Basket is empty. Add products to begin.</div>';
    return '<div class="data-table-wrap"><table class="basket-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead><tbody>' + state.pos.basket.map(function (line) {
      return '<tr><td><strong>' + escapeHtml(line.product_name) + '</strong><div class="table-caption">' + escapeHtml(firstText(line.product_code, '')) + '</div></td><td><div class="qty-control"><button data-action="basket-dec" data-id="' + escapeAttr(String(line.product_id)) + '">-</button><strong>' + escapeHtml(String(line.quantity)) + '</strong><button data-action="basket-inc" data-id="' + escapeAttr(String(line.product_id)) + '">+</button></div></td><td>' + money(line.unit_price) + '</td><td>' + money(lineTotal(line)) + '</td><td><button class="btn btn-danger" data-action="basket-remove" data-id="' + escapeAttr(String(line.product_id)) + '"><i class="fa-solid fa-trash"></i></button></td></tr>';
    }).join("") + '</tbody></table></div>';
  }

  function renderHeldSales() {
    if (!state.pos.held.length) return '<div class="empty-note">No held sales.</div>';
    return '<div class="held-sales-panel"><h4>Held Sales</h4><div class="held-sales-list">' + state.pos.held.map(function (held, index) {
      return '<div class="held-sale"><div><strong>' + escapeHtml(held.label) + '</strong><div class="table-caption">' + escapeHtml(numberText(held.basket.length)) + ' items · ' + money(held.total) + '</div></div><button class="btn btn-outline" data-action="recall-held" data-index="' + escapeAttr(String(index)) + '">Recall</button></div>';
    }).join("") + '</div></div>';
  }

  function renderWorkspaceHero() {
    const now = new Date();
    return '<section class="workspace-hero"><div><span class="workspace-hero__eyebrow">Dashboard</span><h2>Welcome back, ' + escapeHtml(firstText(state.user && state.user.name, state.user && state.user.email, "Admin")) + '</h2><p>Live business activity, documents and counter operations in one workspace.</p></div><div class="workspace-hero__clock"><span>' + escapeHtml(now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" })) + '</span><strong>' + escapeHtml(now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })) + '</strong></div></section>';
  }

  function renderDashboardDocumentRail(data) {
    const invoice = (data.invoices || [])[0];
    const receipt = (data.sales || [])[0];
    const quotation = (data.quotations || [])[0];
    return '<aside class="dashboard-rail">' +
      renderDocumentPreviewCard("Invoice (A4)", invoice, "invoice", "a4", "Latest invoice preview", [
        ["Customer", firstText(invoice && invoice.customer_name, "Walk-in Customer")],
        ["Number", firstText(invoice && invoice.invoice_number, "Draft")],
        ["Status", titleize(firstText(invoice && invoice.status, "sent"))],
        ["Balance", money(firstNumber(invoice && invoice.balance_due, 0))]
      ]) +
      renderDocumentPreviewCard("Receipt (80mm)", receipt, "receipt", "80mm", "Latest counter receipt", [
        ["Customer", firstText(receipt && receipt.customer_name, "Walk-in Customer")],
        ["Number", firstText(receipt && receipt.receipt_number, receipt && receipt.invoice_number, "—")],
        ["Method", titleize(firstText(receipt && receipt.payment_method, "cash"))],
        ["Amount", money(firstNumber(receipt && receipt.total, receipt && receipt.amount, 0))]
      ]) +
      renderDocumentPreviewCard("Quotation (A4)", quotation, "quotation", "a4", "Latest quotation draft", [
        ["Customer", firstText(quotation && quotation.customer_name, "Walk-in Customer")],
        ["Number", firstText(quotation && quotation.quotation_number, "Draft")],
        ["Valid Until", formatDate(quotation && quotation.valid_until)],
        ["Total", money(firstNumber(quotation && quotation.total, 0))]
      ]) +
    '</aside>';
  }

  function renderDocumentPreviewCard(title, record, type, paper, caption, rows) {
    const hasRecord = record && record.id != null;
    const actions = hasRecord
      ? '<div class="document-preview__actions"><button class="btn btn-secondary" data-action="open-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(record.id)) + '" data-paper="' + escapeAttr(paper) + '" data-title="' + escapeAttr(titleize(type)) + '"><i class="fa-solid fa-print"></i>Preview</button><button class="btn btn-outline" data-action="download-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(record.id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-file-pdf"></i>PDF</button></div>'
      : '<div class="document-preview__actions"><button class="btn btn-outline" data-route="' + escapeAttr(type === "receipt" ? "sales" : type + "s") + '"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open Module</button></div>';
    return '<section class="card document-preview-card"><div class="document-preview__header"><div><span class="workspace-hero__eyebrow">' + escapeHtml(title) + '</span><h3>' + escapeHtml(titleize(type)) + '</h3><p>' + escapeHtml(caption) + '</p></div><div class="document-preview__badge"><img src="/assets/unique-solar-kenya-logo.svg" alt="Unique Solar Kenya" /></div></div><div class="document-preview__body">' +
      rows.map(function (row) {
        return '<div class="document-preview__row"><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(String(row[1])) + '</strong></div>';
      }).join("") +
      '<div class="document-preview__total"><span>Total</span><strong>' + money(firstNumber(record && record.total, record && record.amount, record && record.balance_due, 0)) + '</strong></div></div>' + actions + '</section>';
  }

  function renderDocumentButtons(type, id, paper, label) {
    return '<div class="table-actions"><button class="btn btn-outline" data-action="open-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '" data-title="' + escapeAttr(label) + '"><i class="fa-solid fa-eye"></i>Preview</button><button class="btn btn-outline" data-action="download-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-file-pdf"></i>Download PDF</button></div>';
  }

  function renderOverviewTiles(rows) {
    return '<section class="overview-grid">' + rows.map(function (row) {
      return '<article class="card overview-tile"><div class="kpi-card__label">' + escapeHtml(row[0]) + '</div><strong>' + escapeHtml(String(row[1])) + '</strong></article>';
    }).join("") + '</section>';
  }

  function renderSimpleModulePage(title, list, stats, headers, mapper, emptyText) {
    return [
      renderOverviewTiles(stats),
      '<section class="card section-card"><div class="section-head"><div><h3>' + escapeHtml(title) + '</h3><p>Live records from the backend API.</p></div></div>' + renderTable(headers, list.map(mapper), emptyText) + '</section>'
    ].join("");
  }

  function renderTable(headers, rows, emptyText) {
    if (!rows.length) return '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>' + escapeHtml(emptyText) + '</div>';
    return '<div class="data-table-wrap"><table class="data-table"><thead><tr>' + headers.map(function (header) {
      return '<th>' + escapeHtml(header) + '</th>';
    }).join("") + '</tr></thead><tbody>' + rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join("") + '</tr>';
    }).join("") + '</tbody></table></div>';
  }

  function renderEmptyInline(text) {
    return '<div class="empty-state"><i class="fa-regular fa-face-smile"></i>' + escapeHtml(text) + '</div>';
  }

  function renderStockPill(item) {
    const stock = firstNumber(item.current_stock, item.stock, 0);
    const minStock = firstNumber(item.min_stock, 0);
    if (stock <= 0) return '<span class="stock-pill out">Out of stock</span>';
    if (stock <= minStock) return '<span class="stock-pill low">Low stock</span>';
    return '<span class="stock-pill ok">In stock</span>';
  }

  function renderBadge(value) {
    const status = String(value || "status").toLowerCase();
    let tone = "warning";
    if (["paid", "completed", "approved", "active", "cashier", "administrator", "business owner", "super admin", "branch manager"].includes(status.replace(/[_-]+/g, " "))) {
      tone = "success";
    } else if (["cancelled", "rejected", "out_of_stock", "overdue"].includes(status)) {
      tone = "danger";
    }
    return '<span class="badge ' + tone + '">' + escapeHtml(titleize(status)) + '</span>';
  }

  function renderDocumentChip(label, value) {
    return '<span class="document-chip"><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(String(value)) + '</span>';
  }

  function computeDashboardStats(data) {
    const stats = data.stats || {};
    const sales = data.sales || [];
    const inventory = data.inventory || [];
    const quotations = data.quotations || [];
    const invoices = data.invoices || [];
    const todaySales = firstNumber(stats.today_sales, stats.total_sales_today, sumBy(sales, function (item) { return firstNumber(item.total, 0); }), DEFAULT_DASHBOARD.todaySales);
    const todayProfit = firstNumber(stats.today_profit, stats.gross_profit_today, DEFAULT_DASHBOARD.todayProfit);
    const cashInTill = firstNumber(stats.cash_in_till, sumBy(sales.filter(function (item) { return firstText(item.payment_method) === 'cash'; }), function (item) { return firstNumber(item.amount_paid, item.total, 0); }), DEFAULT_DASHBOARD.cashInTill);
    const mpesaCollections = firstNumber(stats.mpesa_collections, sumBy(sales.filter(function (item) { return contains(firstText(item.payment_method), 'mpesa'); }), function (item) { return firstNumber(item.amount_paid, item.total, 0); }), DEFAULT_DASHBOARD.mpesaCollections);
    const transactions = firstNumber(stats.transactions, stats.total_transactions, sales.length, DEFAULT_DASHBOARD.transactions);
    const pendingQuotations = quotations.filter(function (item) { return !["converted", "approved"].includes(firstText(item.status, "draft")); }).length || DEFAULT_DASHBOARD.pendingQuotations;
    const creditSales = firstNumber(stats.credit_sales, sumBy(invoices.filter(function (item) { return firstNumber(item.balance_due, 0) > 0; }), function (item) { return firstNumber(item.balance_due, 0); }), DEFAULT_DASHBOARD.creditSales);
    const lowStockItems = inventory.filter(isLowStock).length || DEFAULT_DASHBOARD.lowStockItems;
    const outOfStockItems = inventory.filter(function (item) { return firstNumber(item.current_stock, 0) <= 0; }).length || DEFAULT_DASHBOARD.outOfStockItems;
    return {
      todaySales: todaySales,
      todayProfit: todayProfit,
      cashInTill: cashInTill,
      mpesaCollections: mpesaCollections,
      transactions: transactions,
      pendingQuotations: pendingQuotations,
      creditSales: creditSales,
      lowStockItems: lowStockItems,
      outOfStockItems: outOfStockItems,
      chartValues: DEFAULT_DASHBOARD.chart
    };
  }

  function renderSalesChart(chartRows, fallback) {
    const canvas = document.getElementById("salesChartCanvas");
    if (!canvas || typeof Chart === "undefined") return;
    destroyChart();
    const labels = [];
    const values = [];
    normalizeList(chartRows).forEach(function (row) {
      labels.push(firstText(row.label, row.day, formatDate(row.date), "Day"));
      values.push(firstNumber(row.total_sales, row.sales, row.amount, 0));
    });
    const safeLabels = labels.length ? labels : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const safeValues = values.length ? values : fallback;
    state.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: safeLabels,
        datasets: [{
          label: "Sales (KES)",
          data: safeValues,
          borderRadius: 10,
          backgroundColor: [
            "rgba(247, 147, 30, 0.95)",
            "rgba(247, 147, 30, 0.88)",
            "rgba(247, 147, 30, 0.82)",
            "rgba(8, 61, 109, 0.92)",
            "rgba(8, 61, 109, 0.84)",
            "rgba(247, 147, 30, 0.76)",
            "rgba(8, 61, 109, 0.76)"
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: function (value) { return "KES " + numberText(value); } } }
        }
      }
    });
  }

  function destroyChart() {
    if (state.chart && typeof state.chart.destroy === "function") {
      state.chart.destroy();
      state.chart = null;
    }
  }

  function filterPosProducts() {
    let products = state.pos.products.slice();
    const query = firstText(state.pos.search, state.search).toLowerCase();
    if (query) {
      products = products.filter(function (item) {
        return [item.product_name, item.product_code, item.barcode, item.category_name].some(function (value) {
          return contains(String(value || "").toLowerCase(), query);
        });
      });
    }
    const filter = state.pos.categoryFilter;
    if (filter && filter !== "All Products") {
      products = products.filter(function (item) {
        const category = firstText(item.category_name, item.category, "Others");
        if (filter === "Others") return SALE_CATEGORIES.indexOf(category) === -1;
        return category.toLowerCase() === filter.toLowerCase();
      });
    }
    return products;
  }

  function addProductToBasket(productId) {
    const product = state.pos.products.find(function (item) { return String(item.id) === String(productId); });
    if (!product) return;
    const existing = state.pos.basket.find(function (line) { return String(line.product_id) === String(productId); });
    if (existing) {
      existing.quantity += 1;
    } else {
      state.pos.basket.push({
        product_id: product.id,
        product_code: firstText(product.product_code, product.barcode, ""),
        product_name: firstText(product.product_name, "Product"),
        unit_price: firstNumber(product.selling_price, 0),
        quantity: 1,
        vat_rate: firstNumber(product.vat_rate, 16),
        discount: 0,
        current_stock: firstNumber(product.current_stock, 0)
      });
    }
    renderCurrentRoute();
    showToast(firstText(product.product_name, "Product") + " added to basket.", "success");
  }

  function updateBasketQuantity(productId, delta) {
    const line = state.pos.basket.find(function (item) { return String(item.product_id) === String(productId); });
    if (!line) return;
    line.quantity = Math.max(1, line.quantity + delta);
    renderCurrentRoute();
  }

  function removeBasketItem(productId) {
    state.pos.basket = state.pos.basket.filter(function (item) { return String(item.product_id) !== String(productId); });
    renderCurrentRoute();
  }

  function calculatePosTotals() {
    const subtotal = sumBy(state.pos.basket, function (item) { return firstNumber(item.unit_price, 0) * firstNumber(item.quantity, 0); });
    const vat = sumBy(state.pos.basket, function (item) { return firstNumber(item.unit_price, 0) * firstNumber(item.quantity, 0) * (firstNumber(item.vat_rate, 0) / 100); });
    const discount = firstNumber(state.pos.discount_amount, 0);
    const shipping = firstNumber(state.pos.shipping_amount, 0);
    const total = Math.max(0, subtotal + vat + shipping - discount);
    return { subtotal: subtotal, vat: vat, discount: discount, shipping: shipping, total: total };
  }

  function lineTotal(line) {
    const base = firstNumber(line.unit_price, 0) * firstNumber(line.quantity, 0);
    return base + (base * firstNumber(line.vat_rate, 0) / 100) - firstNumber(line.discount, 0);
  }

  function holdSale(mode) {
    if (!state.pos.basket.length) {
      showToast("Add items before holding a sale.", "error");
      return;
    }
    const totals = calculatePosTotals();
    state.pos.held.unshift({
      label: mode === "held" ? "Held Sale" : "Suspended Sale",
      basket: clone(state.pos.basket),
      customer_id: state.pos.customer_id,
      payment_method: state.pos.payment_method,
      discount_amount: state.pos.discount_amount,
      shipping_amount: state.pos.shipping_amount,
      notes: state.pos.notes,
      total: totals.total
    });
    clearBasket(false);
    showToast("Sale held successfully.", "success");
  }

  function recallHeldSale(index) {
    const held = state.pos.held.splice(Number(index), 1)[0];
    if (!held) return;
    state.pos.basket = held.basket || [];
    state.pos.customer_id = held.customer_id || "";
    state.pos.payment_method = held.payment_method || "cash";
    state.pos.discount_amount = firstNumber(held.discount_amount, 0);
    state.pos.shipping_amount = firstNumber(held.shipping_amount, 0);
    state.pos.notes = held.notes || "";
    renderCurrentRoute();
    showToast("Held sale recalled.", "success");
  }

  function clearBasket(showNotice) {
    state.pos.basket = [];
    state.pos.customer_id = "";
    state.pos.payment_method = "cash";
    state.pos.discount_amount = 0;
    state.pos.shipping_amount = 0;
    state.pos.amount_paid = 0;
    state.pos.notes = "";
    if (showNotice) showToast("Basket cleared.", "success");
    renderCurrentRoute();
  }

  async function completeSale() {
    if (!state.pos.basket.length) {
      showToast("Add products before completing the sale.", "error");
      return;
    }
    const totals = calculatePosTotals();
    if (state.pos.payment_method !== "credit" && firstNumber(state.pos.amount_paid, 0) < totals.total) {
      showToast("Amount paid is less than the grand total.", "error");
      return;
    }
    const payload = {
      customer_id: state.pos.customer_id || undefined,
      discount_amount: state.pos.discount_amount || 0,
      shipping_amount: state.pos.shipping_amount || 0,
      amount_paid: state.pos.payment_method === "credit" ? 0 : firstNumber(state.pos.amount_paid, 0),
      payment_method: state.pos.payment_method,
      items: state.pos.basket.map(function (line) {
        return {
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          discount: firstNumber(line.discount, 0),
          vat_rate: firstNumber(line.vat_rate, 16)
        };
      })
    };
    try {
      const sale = await apiJson("/api/pos/sale", { method: "POST", body: JSON.stringify(payload) });
      showToast("Sale completed successfully.", "success");
      clearBasket(false);
      await Promise.all([loadDashboardData(), loadSalesData(), loadInvoicesData()]);
      openDocumentModal("receipt", sale.id, "80mm", "Receipt", {
        relatedDocuments: sale && sale.invoice_id ? [{ type: "invoice", id: sale.invoice_id, paper: "a4", title: "Invoice" }] : []
      });
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Sale failed.", "error");
    }
  }

  async function createQuotationFromBasket() {
    if (!state.pos.basket.length) {
      showToast("Add products before creating a quotation.", "error");
      return;
    }
    const validUntil = isoDate(addDays(new Date(), 14));
    const payload = {
      customer_id: state.pos.customer_id || undefined,
      valid_until: validUntil,
      notes: state.pos.notes || "Quotation created from POS basket",
      discount_amount: state.pos.discount_amount || 0,
      items: state.pos.basket.map(function (line) {
        return {
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          discount: firstNumber(line.discount, 0),
          vat_rate: firstNumber(line.vat_rate, 16)
        };
      })
    };
    try {
      await apiJson("/api/quotations", { method: "POST", body: JSON.stringify(payload) });
      showToast("Quotation created from current basket.", "success");
      clearBasket(false);
      await loadQuotationsData();
      location.hash = "quotations";
    } catch (error) {
      showToast(error.message || "Unable to create quotation.", "error");
    }
  }

  async function convertQuotation(id) {
    try {
      await apiJson("/api/quotations/" + encodeURIComponent(id) + "/convert", { method: "POST", body: JSON.stringify({}) });
      showToast("Quotation converted to invoice.", "success");
      await Promise.all([loadQuotationsData(), loadInvoicesData(), loadDashboardData()]);
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Unable to convert quotation.", "error");
    }
  }

  async function recordInvoicePayment(id) {
    const invoice = ((state.cache.invoices || {}).invoices || []).find(function (item) { return String(item.id) === String(id); });
    const defaultAmount = firstNumber(invoice && invoice.balance_due, 0);
    const amount = window.prompt("Payment amount", String(defaultAmount));
    if (!amount) return;
    const method = window.prompt("Payment method (cash, mpesa, bank_transfer, card, credit)", "cash");
    if (!method) return;
    try {
      await apiJson("/api/invoices/" + encodeURIComponent(id) + "/pay", {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method: method, reference: "", notes: "" })
      });
      showToast("Invoice payment recorded.", "success");
      await Promise.all([loadInvoicesData(), loadDashboardData()]);
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Unable to record invoice payment.", "error");
    }
  }

  async function openDocumentModal(type, id, paper, title, options) {
    const docType = documentType(type);
    const normalizedPaper = paper || defaultDocumentPaper(docType);
    const relatedDocuments = options && Array.isArray(options.relatedDocuments) ? options.relatedDocuments : [];
    resetModalDocument();
    openModal({
      title: title + " Preview",
      subtitle: "Loading PDF preview with print, download and share actions.",
      wide: true,
      actions: renderDocumentActionBar(docType, id, normalizedPaper, relatedDocuments)
    });
    els.modalBody.innerHTML = '<div class="loader-card"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><div>Generating PDF preview…</div></div>';
    try {
      const pdfDocument = await fetchDocumentPdf(docType, id, normalizedPaper);
      state.modalDocument = {
        type: docType,
        id: String(id),
        paper: normalizedPaper,
        title: title || titleize(docType),
        objectUrl: pdfDocument.objectUrl,
        fileName: pdfDocument.fileName,
        relatedDocuments: relatedDocuments
      };
      els.modalBody.innerHTML = '<div class="document-view"><div class="document-meta"><span class="document-chip">Type: ' + escapeHtml(title || titleize(docType)) + '</span><span class="document-chip">Paper: ' + escapeHtml(normalizedPaper.toUpperCase()) + '</span><span class="document-chip">File: ' + escapeHtml(pdfDocument.fileName) + '</span></div><iframe class="modal-frame" title="Document Preview" src="' + escapeAttr(pdfDocument.objectUrl + '#toolbar=1&navpanes=0&scrollbar=1') + '"></iframe></div>';
    } catch (error) {
      els.modalBody.innerHTML = '<div class="page-empty"><i class="fa-solid fa-circle-exclamation"></i><p>' + escapeHtml(error.message || 'Unable to load document preview.') + '</p></div>';
      showToast(error.message || "Unable to generate document PDF.", "error");
    }
  }

  function renderDocumentActionBar(type, id, paper, relatedDocuments) {
    const related = Array.isArray(relatedDocuments) ? relatedDocuments : [];
    return related.map(function (document) {
      return '<button class="btn btn-outline" data-action="open-document" data-type="' + escapeAttr(document.type) + '" data-id="' + escapeAttr(String(document.id)) + '" data-paper="' + escapeAttr(document.paper || defaultDocumentPaper(document.type)) + '" data-title="' + escapeAttr(document.title || titleize(document.type)) + '"><i class="fa-solid fa-file-lines"></i>Preview ' + escapeHtml(document.title || titleize(document.type)) + '</button>';
    }).concat([
      '<button class="btn btn-primary" data-action="print-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-print"></i>Print</button>',
      '<button class="btn btn-outline" data-action="download-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-file-pdf"></i>Download PDF</button>',
      '<button class="btn btn-outline" data-action="share-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-share-nodes"></i>Share</button>',
      '<button class="btn btn-outline" data-action="email-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '"><i class="fa-solid fa-envelope"></i>Email</button>',
      '<button class="btn btn-danger" data-action="close-modal"><i class="fa-solid fa-xmark"></i>Close</button>'
    ]).join("");
  }

  async function printDocument(type, id, paper) {
    const docType = documentType(type);
    try {
      const pdfDocument = await ensureDocumentPdf(docType, id, paper);
      const frame = document.createElement("iframe");
      let printStarted = false;
      frame.className = "hidden";
      frame.src = pdfDocument.objectUrl;
      frame.onload = function () {
        printStarted = true;
        window.setTimeout(function () {
          try {
            if (frame.contentWindow) {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            }
          } catch (printError) {
            showToast("Open the preview and use your browser print dialog if printing stays blocked.", "error");
          }
        }, 400);
      };
      frame.onerror = function () {
        showToast("Unable to load the PDF for printing.", "error");
      };
      document.body.appendChild(frame);
      window.setTimeout(function () {
        if (!printStarted) {
          showToast("Print preview is taking too long to load. Try the Download PDF button instead.", "error");
        }
      }, 5000);
      window.setTimeout(function () {
        frame.remove();
        if (!state.modalDocument || state.modalDocument.objectUrl !== pdfDocument.objectUrl) {
          URL.revokeObjectURL(pdfDocument.objectUrl);
        }
      }, 6e4);
    } catch (error) {
      showToast(error.message || "Unable to print document.", "error");
    }
  }

  async function downloadDocumentPdf(type, id, paper) {
    const docType = documentType(type);
    try {
      const pdfDocument = await fetchDocumentPdf(docType, id, paper || defaultDocumentPaper(docType));
      triggerBlobDownload(pdfDocument.objectUrl, pdfDocument.fileName);
      if (!state.modalDocument || String(state.modalDocument.id) !== String(id) || state.modalDocument.type !== docType) {
        window.setTimeout(function () {
          URL.revokeObjectURL(pdfDocument.objectUrl);
        }, 1000);
      }
    } catch (error) {
      showToast(error.message || "Unable to download PDF.", "error");
    }
  }

  async function emailDocument(type, id) {
    const email = window.prompt("Recipient email address");
    if (!email) return;
    try {
      await apiJson("/api/documents/" + encodeURIComponent(documentType(type)) + "/" + encodeURIComponent(id) + "/email", {
        method: "POST",
        body: JSON.stringify({ to: email })
      });
      showToast("Document email sent.", "success");
    } catch (error) {
      showToast(error.message || "Unable to send email.", "error");
    }
  }

  async function shareDocumentWhatsapp(type, id, paper) {
    try {
      const pdfDocument = await fetchDocumentPdf(documentType(type), id, paper || defaultDocumentPaper(type));
      const file = typeof File === "function" ? new File([pdfDocument.blob], pdfDocument.fileName, { type: "application/pdf" }) : null;
      if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: pdfDocument.fileName, text: "POS document PDF" });
        if (!state.modalDocument || state.modalDocument.objectUrl !== pdfDocument.objectUrl) {
          window.setTimeout(function () {
            URL.revokeObjectURL(pdfDocument.objectUrl);
          }, 1000);
        }
        showToast("Document shared.", "success");
        return;
      }
      triggerBlobDownload(pdfDocument.objectUrl, pdfDocument.fileName);
      if (!state.modalDocument || state.modalDocument.objectUrl !== pdfDocument.objectUrl) {
        window.setTimeout(function () {
          URL.revokeObjectURL(pdfDocument.objectUrl);
        }, 1000);
      }
      showToast("File sharing is not available in this browser. PDF downloaded instead.", "warning");
    } catch (error) {
      showToast(error.message || "Unable to share document.", "error");
    }
  }

  function openModal(options) {
    els.modalWindow.className = 'modal-window' + (options && options.wide ? ' modal-window--wide' : ' modal-window--compact');
    els.modalTitle.textContent = options && options.title ? options.title : 'Modal';
    els.modalSubtitle.textContent = options && options.subtitle ? options.subtitle : '';
    els.modalActions.innerHTML = options && options.actions ? options.actions : '';
    els.modalBody.innerHTML = options && options.body ? options.body : '';
    els.modalOverlay.classList.remove("hidden");
  }

  function closeModal() {
    els.modalOverlay.classList.add("hidden");
    els.modalActions.innerHTML = "";
    els.modalBody.innerHTML = "";
    resetModalDocument();
  }

  function openCustomerModal() {
    openModal({
      title: "Add Customer",
      subtitle: "Create a customer account for sales, quotations and invoices.",
      body: '<form id="modalForm" data-kind="customer" class="form-grid two"><label><span>Customer Name</span><input name="name" required /></label><label><span>Phone</span><input name="phone" /></label><label><span>Email</span><input name="email" type="email" /></label><label><span>Company</span><input name="company" /></label><label class="form-span-2"><span>Address</span><textarea name="address"></textarea></label><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Save Customer</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
    });
  }

  function openProductModal() {
    openModal({
      title: "Add Product",
      subtitle: "Create a product for POS and stock control.",
      body: '<form id="modalForm" data-kind="product" class="form-grid two"><label><span>Product Code / SKU</span><input name="product_code" required /></label><label><span>Product Name</span><input name="product_name" required /></label><label><span>Selling Price</span><input type="number" min="0" step="0.01" name="selling_price" required /></label><label><span>Cost Price</span><input type="number" min="0" step="0.01" name="cost_price" required /></label><label><span>Category</span><input name="category" placeholder="Solar Panels, Batteries..." /></label><label><span>Opening Stock</span><input type="number" min="0" step="1" name="current_stock" /></label><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Save Product</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
    });
  }

  function openReceiveStockModal() {
    const options = state.pos.products.length ? state.pos.products : ((state.cache.products || {}).products || []);
    openModal({
      title: "Receive Stock",
      subtitle: "Record incoming inventory for a selected product.",
      body: '<form id="modalForm" data-kind="stock" class="form-grid two"><label><span>Product</span><select name="product_id" required><option value="">Select product</option>' + options.map(function (item) {
        return '<option value="' + escapeAttr(String(item.id)) + '">' + escapeHtml(firstText(item.product_name, 'Product')) + '</option>';
      }).join("") + '</select></label><label><span>Quantity</span><input type="number" min="1" step="1" name="quantity" required /></label><label><span>Reference</span><input name="reference" placeholder="GRN-001" /></label><label><span>Notes</span><input name="notes" /></label><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Receive Stock</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
    });
  }

  function openQuotationModal() {
    const customerOptions = '<option value="">Walk-in Customer</option>' + state.pos.customers.map(function (customer) {
      return '<option value="' + escapeAttr(String(customer.id)) + '">' + escapeHtml(firstText(customer.name, customer.company, 'Customer')) + '</option>';
    }).join("");
    const prefilledItems = state.pos.basket.length ? state.pos.basket.map(function (line) {
      return '<div class="document-chip">' + escapeHtml(line.product_name) + ' × ' + escapeHtml(String(line.quantity)) + ' · ' + money(line.unit_price) + '</div>';
    }).join("") : '<div class="empty-note">Use the POS basket to prefill quotation items.</div>';
    openModal({
      title: "Create Quotation",
      subtitle: "Generate an A4 quotation from the current basket.",
      body: '<form id="modalForm" data-kind="quotation" class="form-grid two"><label><span>Customer</span><select name="customer_id">' + customerOptions + '</select></label><label><span>Valid Until</span><input type="date" name="valid_until" value="' + escapeAttr(isoDate(addDays(new Date(), 14))) + '" /></label><label class="form-span-2"><span>Notes</span><textarea name="notes">Quotation created from POS workspace.</textarea></label><div class="form-span-2"><span>Items</span><div class="document-chip-list">' + prefilledItems + '</div></div><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Create Quotation</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
    });
  }

  async function handleModalFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const kind = form.dataset.kind;
    const payload = formToObject(form);
    try {
      if (kind === "customer") {
        await apiJson("/api/customers", { method: "POST", body: JSON.stringify(payload) });
        await Promise.all([loadCustomersData(), loadSalesData()]);
        showToast("Customer added.", "success");
      }
      if (kind === "product") {
        payload.current_stock = payload.current_stock ? Number(payload.current_stock) : undefined;
        payload.selling_price = Number(payload.selling_price || 0);
        payload.cost_price = Number(payload.cost_price || 0);
        await apiJson("/api/products", { method: "POST", body: JSON.stringify(payload) });
        await Promise.all([loadProductsData(), loadSalesData(), loadInventoryData()]);
        showToast("Product added.", "success");
      }
      if (kind === "stock") {
        payload.quantity = Number(payload.quantity || 0);
        await apiJson("/api/inventory/receive", { method: "POST", body: JSON.stringify(payload) });
        await Promise.all([loadInventoryData(), loadProductsData(), loadSalesData()]);
        showToast("Stock received.", "success");
      }
      if (kind === "quotation") {
        if (!state.pos.basket.length) throw new Error("Add items to the basket first.");
        payload.discount_amount = state.pos.discount_amount || 0;
        payload.items = state.pos.basket.map(function (line) {
          return {
            product_id: line.product_id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            discount: firstNumber(line.discount, 0),
            vat_rate: firstNumber(line.vat_rate, 16)
          };
        });
        await apiJson("/api/quotations", { method: "POST", body: JSON.stringify(payload) });
        await loadQuotationsData();
        showToast("Quotation created.", "success");
      }
      closeModal();
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Unable to save record.", "error");
    }
  }

  async function handleSettingsBusinessSubmit(event) {
    event.preventDefault();
    const payload = formToObject(event.target);
    try {
      await apiJson("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
      await loadSettingsData();
      showToast("Business settings saved.", "success");
    } catch (error) {
      showToast(error.message || "Unable to save settings.", "error");
    }
  }

  async function handleSettingsBrandingSubmit(event) {
    event.preventDefault();
    const payload = formToObject(event.target);
    try {
      await apiJson("/api/settings/branding", { method: "PATCH", body: JSON.stringify(payload) });
      await Promise.all([loadBranding(), loadSettingsData()]);
      showToast("Branding saved.", "success");
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Unable to save branding.", "error");
    }
  }

  function showToast(message, type) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.className = 'toast ' + (type || 'success');
    els.toast.classList.remove('hidden');
    state.toastTimer = setTimeout(function () {
      els.toast.classList.add('hidden');
    }, 3200);
  }

  function setLoginMessage(type, message) {
    els.loginMessage.className = 'inline-message ' + (type || '');
    els.loginMessage.textContent = message || '';
    if (!message) els.loginMessage.classList.add('hidden');
    else els.loginMessage.classList.remove('hidden');
  }

  async function apiJson(url, options) {
    const opts = options || {};
    const noAuth = opts.noAuth;
    const skipAuthRedirect = opts.skipAuthRedirect;
    const fetchOptions = Object.assign({}, opts);
    delete fetchOptions.noAuth;
    delete fetchOptions.skipAuthRedirect;
    const res = noAuth ? await fetchWithJson(url, fetchOptions) : await authorizedFetch(url, fetchOptions);
    if (!res.ok) {
      const errorBody = await res.json().catch(function () { return {}; });
      if (res.status === 401 && !skipAuthRedirect) {
        clearSession();
        showLogin();
      }
      throw new Error(firstText(errorBody.error, errorBody.message, res.statusText, 'Request failed'));
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function defaultDocumentPaper(type) {
    return documentType(type) === "receipt" ? "80mm" : "a4";
  }

  function parseDocumentFileName(res, fallback) {
    const header = firstText(res && res.headers && res.headers.get("Content-Disposition"), "");
    const match = header.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
    if (!match || !match[1]) return fallback;
    try {
      return decodeURIComponent(String(match[1]).replace(/"/g, "").trim()) || fallback;
    } catch (error) {
      return String(match[1]).replace(/"/g, "").trim() || fallback;
    }
  }

  function buildDocumentPdfEndpoint(type, id, paper) {
    return "/api/documents/" + encodeURIComponent(documentType(type)) + "/" + encodeURIComponent(id) + "/pdf?paper=" + encodeURIComponent(paper || defaultDocumentPaper(type));
  }

  async function fetchDocumentPdf(type, id, paper) {
    const url = buildDocumentPdfEndpoint(type, id, paper);
    const res = await authorizedFetch(url, { headers: { Accept: "application/pdf" } });
    if (res.status === 401) {
      clearSession();
      showLogin();
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!res.ok) {
      const errorBody = await res.json().catch(function () { return {}; });
      throw new Error(firstText(errorBody.error, errorBody.message, res.statusText, "Unable to generate PDF"));
    }
    const contentType = firstText(res.headers.get("Content-Type"), "");
    if (contentType.toLowerCase().indexOf("application/pdf") === -1) {
      throw new Error("The server returned an invalid PDF response.");
    }
    const blob = await res.blob();
    if (!blob || !blob.size) {
      throw new Error("The generated PDF was empty.");
    }
    const fallback = documentType(type) + "-" + String(id) + ".pdf";
    return {
      blob: blob,
      objectUrl: URL.createObjectURL(blob),
      fileName: parseDocumentFileName(res, fallback)
    };
  }

  async function ensureDocumentPdf(type, id, paper) {
    if (state.modalDocument && state.modalDocument.objectUrl && state.modalDocument.type === documentType(type) && String(state.modalDocument.id) === String(id) && state.modalDocument.paper === (paper || defaultDocumentPaper(type))) {
      return state.modalDocument;
    }
    return fetchDocumentPdf(type, id, paper || defaultDocumentPaper(type));
  }

  function triggerBlobDownload(objectUrl, fileName) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName || "document.pdf";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetModalDocument() {
    if (state.modalDocument && state.modalDocument.objectUrl) {
      URL.revokeObjectURL(state.modalDocument.objectUrl);
    }
    state.modalDocument = null;
  }

  function fetchWithJson(url, options) {
    const next = options || {};
    const headers = new Headers(next.headers || {});
    if (next.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(url, Object.assign({}, next, { headers: headers }));
  }

  function authorizedFetch(url, options) {
    const next = options || {};
    const headers = new Headers(next.headers || {});
    if (state.token) headers.set('Authorization', 'Bearer ' + state.token);
    if (next.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(url, Object.assign({}, next, { headers: headers }));
  }

  function persistSession(token, user) {
    state.token = token || '';
    state.user = user || null;
    localStorage.setItem(TOKEN_KEY, state.token);
    localStorage.setItem(USER_KEY, JSON.stringify(state.user || null));
    updateUserUI();
  }

  function clearSession() {
    state.token = '';
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function formToObject(form) {
    const data = {};
    Array.from(new FormData(form).entries()).forEach(function (entry) {
      if (entry[1] === '') return;
      data[entry[0]] = entry[1];
    });
    return data;
  }

  function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
    return [];
  }

  function productSummary(products) {
    const categories = new Set(products.map(function (item) { return firstText(item.category_name, item.category, 'Other'); }));
    return {
      total: products.length,
      lowStock: products.filter(isLowStock).length,
      outOfStock: products.filter(function (item) { return firstNumber(item.current_stock, 0) <= 0; }).length,
      avgPrice: products.length ? sumBy(products, function (item) { return firstNumber(item.selling_price, 0); }) / products.length : 0,
      categories: categories.size
    };
  }

  function isLowStock(item) {
    const stock = firstNumber(item.current_stock, item.stock, 0);
    const min = firstNumber(item.min_stock, 0);
    return stock > 0 && stock <= min;
  }

  function applySearch(items, query, keys) {
    const term = String(query || '').trim().toLowerCase();
    if (!term) return items.slice();
    return items.filter(function (item) {
      return keys.some(function (key) {
        return contains(String(item[key] || '').toLowerCase(), term);
      });
    });
  }

  function documentType(type) {
    return type === 'sale' ? 'receipt' : type;
  }

  function closeSidebar() {
    els.sidebar.classList.remove('is-open');
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function defaultDateRange() {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10)
    };
  }

  function reportQuery(range) {
    return [
      'start=' + encodeURIComponent(range.from),
      'end=' + encodeURIComponent(range.to),
      'from=' + encodeURIComponent(range.from),
      'to=' + encodeURIComponent(range.to)
    ].join('&');
  }

  function money(value) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(firstNumber(value, 0));
  }

  function numberText(value) {
    return firstNumber(value, 0).toLocaleString();
  }

  function sumBy(items, getter) {
    return (items || []).reduce(function (sum, item) {
      return sum + firstNumber(getter(item), 0);
    }, 0);
  }

  function firstNumber() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = Number(arguments[index]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function firstText() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
  }

  function titleize(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString();
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
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

  function contains(text, term) {
    return text.indexOf(term) !== -1;
  }

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + Number(days || 0));
    return date;
  }

  function sanitizeUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('/')) return text;
    if (/^https?:\/\//i.test(text)) return text;
    return '';
  }

  function clampMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
})();
