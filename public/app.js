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
    ["bulk-import", "Bulk Import", "fa-solid fa-file-import"],
    ["import-history", "Import History", "fa-solid fa-clock-rotate-left"],
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
    "bulk-import": ["Bulk Import", "Upload CSV, Excel, or PDF supplier files and import products in bulk."],
    "import-history": ["Import History", "View all past import jobs, download error reports and track results."],
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
    currentBranchId: "",
    productWorkspace: {
      search: "",
      categoryId: "all",
      status: "all",
      branchId: "all",
      page: 1,
      pageSize: 10,
      selectedIds: [],
      editor: {
        productId: null,
        photos: [],
        uploading: false,
        categorySuggestion: null,
        suggestTimer: null
      }
    },
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
      pollTimer: null,
      recategorize: false
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
    brandMark: document.getElementById("brandMark"),
    brandPillLabel: document.getElementById("brandPillLabel"),
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
    sidebarLogo: document.getElementById("sidebarLogo"),
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
      if (form.id === "productEditorForm") return handleProductEditorSubmit(event);
      if (form.id === "categoryCreateForm") return handleCategoryCreateSubmit(event);
      if (form.id === "productAdjustForm") return handleProductAdjustmentSubmit(event);
      if (form.id === "settingsBusinessForm") return handleSettingsBusinessSubmit(event);
      if (form.id === "settingsBrandingForm") return handleSettingsBrandingSubmit(event);
      if (form.id === "settingsPaymentForm") return handleSettingsPaymentSubmit(event);
      if (form.id === "settingsCategorizationForm") return handleSettingsCategorizationSubmit(event);
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
        state.currentBranchId = target.value || "";
        routeTo(state.activeRoute, { force: true });
        showToast("Branch updated.", "success");
      }
      if (target.id === "userSelect") {
        showToast("User profile switched visually only.", "success");
      }
      if (target.id === "productFilterCategory") {
        state.productWorkspace.categoryId = target.value || "all";
        state.productWorkspace.page = 1;
        renderCurrentRoute();
      }
      if (target.id === "productFilterStatus") {
        state.productWorkspace.status = target.value || "all";
        state.productWorkspace.page = 1;
        renderCurrentRoute();
      }
      if (target.id === "productFilterBranch") {
        state.productWorkspace.branchId = target.value || "all";
        state.productWorkspace.page = 1;
        renderCurrentRoute();
      }
      if (target.id === "productSelectAll") {
        toggleSelectAllVisibleProducts(!!target.checked);
        renderCurrentRoute();
      }
      if (target.id === "productPhotoInput" && target.files && target.files.length) {
        handleProductPhotoFiles(Array.from(target.files)).catch(function (error) {
          showToast(error.message || "Unable to upload product photos.", "error");
        });
      }
      if (target.id === "productCategorySelect") {
        const categoryNameInput = document.getElementById("productCategoryNameInput");
        if (categoryNameInput && target.value) categoryNameInput.value = "";
      }
    });

    document.addEventListener("input", function (event) {
      const target = event.target;
      if (target.id === "globalSearchInput") {
        state.search = target.value.trim();
        renderCurrentRoute();
      }
      if (target.id === "productPageSearch") {
        state.productWorkspace.search = target.value.trim();
        state.productWorkspace.page = 1;
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
      if (target.id === "productNameInput") {
        scheduleProductCategorizationSuggestion(target.value);
      }
    });

    els.sidebarToggle.addEventListener("click", function () {
      els.sidebar.classList.toggle("is-open");
    });

    els.modalOverlay.addEventListener("click", function (event) {
      if (event.target === els.modalOverlay) closeModal();
    });

    document.addEventListener("keydown", function (event) {
      if (state.activeRoute !== "sales") return;
      if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.tagName === "SELECT")) {
        if (event.key === "Escape") event.target.blur();
        return;
      }
      switch (event.key) {
        case "F2":
          event.preventDefault();
          var searchEl = document.getElementById("posProductSearch");
          if (searchEl) searchEl.focus();
          break;
        case "F4":
          event.preventDefault();
          document.body.classList.toggle("pos-basket-open");
          break;
        case "F6":
          event.preventDefault();
          previewSaleDraft("receipt");
          break;
        case "F7":
          event.preventDefault();
          previewSaleDraft("invoice");
          break;
        case "F8":
          event.preventDefault();
          completeSaleAndThen("print-receipt");
          break;
        case "F9":
          event.preventDefault();
          completeSale();
          break;
        case "Escape":
          if (!els.modalOverlay.classList.contains("hidden")) return;
          event.preventDefault();
          if (window.confirm("Cancel and clear the current basket?")) clearBasket(true);
          break;
      }
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
      case "manage-categories":
        openCategoryManagementModal();
        return;
      case "product-create-category":
        await quickCreateCategoryFromEditor();
        return;
      case "product-accept-category-suggestion":
        applyDetectedProductCategory();
        return;
      case "product-edit":
        await openProductModal(button.dataset.productId);
        return;
      case "product-duplicate":
        await handleDuplicateProduct(button.dataset.productId);
        return;
      case "product-history":
        await openProductHistoryModal(button.dataset.productId);
        return;
      case "product-stock-adjust":
        await openStockAdjustmentModal(button.dataset.productId);
        return;
      case "product-page-prev":
        changeProductPage(-1);
        return;
      case "product-page-next":
        changeProductPage(1);
        return;
      case "product-row-select":
        toggleProductSelection(button.dataset.productId);
        renderCurrentRoute();
        return;
      case "product-bulk-apply":
        await handleProductBulkAction();
        return;
      case "product-photo-pick":
        openProductPhotoPicker();
        return;
      case "product-photo-remove":
        removeProductPhoto(button.dataset.photoPath);
        return;
      case "category-rename":
        await handleRenameCategory(button.dataset.categoryId, button.dataset.categoryName);
        return;
      case "category-merge":
        await handleMergeCategory(button.dataset.categoryId, button.dataset.categoryName);
        return;
      case "category-delete":
        await handleDeleteCategory(button.dataset.categoryId, button.dataset.categoryName);
        return;
      case "categorization-rule-edit":
        populateCategorizationRuleForm(button.dataset.ruleId);
        return;
      case "categorization-rule-delete":
        await deleteCategorizationRule(button.dataset.ruleId);
        return;
      case "categorization-rule-toggle":
        await toggleCategorizationRule(button.dataset.ruleId, button.dataset.enabled === "true");
        return;
      case "categorization-rule-up":
      case "categorization-rule-down":
        await moveCategorizationRule(button.dataset.ruleId, action === "categorization-rule-up" ? -1 : 1);
        return;
      case "categorization-rule-clear-form":
        clearCategorizationRuleForm();
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
      if (!els.modalOverlay.classList.contains("hidden")) renderBulkImportModal();
      if (state.activeRoute === "products" || state.activeRoute === "bulk-import" || state.activeRoute === "import-history") renderCurrentRoute();
      return;
      case "bulk-import-open-job":
      await openBulkImportJob(button.dataset.jobId);
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
      case "basket-clear":
        if (window.confirm("Clear all items from the basket?")) clearBasket(true);
        return;
      case "toggle-basket":
        document.body.classList.toggle("pos-basket-open");
        return;
      case "preview-quotation-before-sale":
        previewSaleDraft("quotation", button.dataset.paper || "a4");
        return;
      case "preview-receipt-before-sale":
        previewSaleDraft("receipt", button.dataset.paper || "80mm");
        return;
      case "preview-invoice-before-sale":
        previewSaleDraft("invoice", button.dataset.paper || "a4");
        return;
      case "print-receipt-now":
        completeSaleAndThen("print-receipt");
        return;
      case "print-invoice-now":
        completeSaleAndThen("print-invoice");
        return;
      case "email-receipt-now":
        completeSaleAndThen("email-receipt");
        return;
      case "email-invoice-now":
        completeSaleAndThen("email-invoice");
        return;
      case "download-receipt-now":
        completeSaleAndThen("download-receipt");
        return;
      case "share-receipt-now":
        completeSaleAndThen("share-receipt");
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
      case "toggle-archived-products":
        if (state.cache.products) state.cache.products.includeArchived = !(state.cache.products.includeArchived);
        await loadProductsData(true);
        renderCurrentRoute();
        return;
      case "archive-product":
        await handleArchiveProduct(button.dataset.productId, button.dataset.productName);
        return;
      case "restore-product":
        await handleRestoreProduct(button.dataset.productId, button.dataset.productName);
        return;
      case "delete-product":
        await handleDeleteProduct(button.dataset.productId, button.dataset.productName);
        return;
      case "void-sale":
        await handleVoidSale(button.dataset.saleId, button.dataset.receipt);
        return;
      case "delete-sale-draft":
        await handleDeleteDraftSale(button.dataset.saleId, button.dataset.receipt);
        return;
      case "return-sale":
        await handleReturnSale(button.dataset.saleId, button.dataset.receipt);
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
    els.brandPillLabel.textContent = state.branding.business_name || DEFAULT_BRANDING.business_name;
    els.brandHeadline.textContent = state.branding.business_name || DEFAULT_BRANDING.business_name;
    els.brandSummary.textContent = firstText(
      state.branding.tagline,
      state.branding.description,
      DEFAULT_BRANDING.tagline
    );
    els.sidebarBrandName.textContent = state.branding.business_name || DEFAULT_BRANDING.business_name;
    applyBrandTheme(state.branding);
    applyBrandLogo(els.brandMark, state.branding);
    applyBrandLogo(els.sidebarLogo, state.branding);
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
    els.sidebarNav.innerHTML = NAV_ITEMS.filter(function (item) {
      const route = item[0];
      if ((route === "bulk-import" || route === "import-history") && !canBulkImportProducts()) return false;
      return true;
    }).map(function (item) {
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
    if (!state.currentBranchId) {
      state.currentBranchId = firstText(
        state.user && state.user.branch_id,
        state.user && state.user.branchId,
        state.branches[0] && state.branches[0].id,
        ""
      );
    }
    if (state.currentBranchId) els.branchSelect.value = state.currentBranchId;
    els.userSelect.innerHTML = '<option value="' + escapeAttr(String(user.id || "me")) + '">' + escapeHtml(firstText(user.name, user.email, "Admin")) + '</option>';
  }

  function readRoute() {
    const value = String(location.hash || "").replace(/^#/, "").trim();
    return ROUTE_META[value] ? value : DEFAULT_ROUTE;
  }

  async function routeTo(route, options) {
    const nextRoute = ROUTE_META[route] ? route : DEFAULT_ROUTE;
    if (!state.user) return;
    if (state.activeRoute !== nextRoute) {
      document.body.classList.remove("pos-basket-open");
    }
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
      case "bulk-import":
        return loadBulkImportData();
      case "import-history":
        return loadImportHistoryData();
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
      apiJson("/api/products?limit=200&in_stock_only=true&fallback_product_stock=true").catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; }),
      apiJson("/api/customers?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/pos/sales?limit=12").catch(function () { return { data: [] }; })
    ]);
    state.pos.products = normalizeList(products);
    state.pos.categories = normalizeList(categories);
    state.pos.customers = normalizeList(customers);
    state.cache.sales = { recentSales: normalizeList(sales) };
  }

  async function loadProductsData(keepArchivedFlag) {
    const includeArchived = keepArchivedFlag && isSuperAdmin() && (state.cache.products || {}).includeArchived;
    const productUrl = "/api/products?limit=500" + (includeArchived ? "&include_archived=true" : "");
    const requests = [
      apiJson(productUrl).catch(function () { return { data: [] }; }),
      apiJson("/api/categories").catch(function () { return []; }),
      apiJson("/api/brands").catch(function () { return []; }),
      apiJson("/api/suppliers?limit=200").catch(function () { return { data: [] }; }),
      apiJson("/api/branches/options").catch(function () { return []; })
    ];
    if (canBulkImportProducts()) {
      requests.push(apiJson("/api/products/imports").catch(function () { return { data: [] }; }));
    }
    const responses = await Promise.all(requests);
    const products = responses[0];
    const categories = responses[1];
    const brands = responses[2];
    const suppliers = responses[3];
    const branches = responses[4];
    state.cache.products = {
      products: normalizeList(products),
      categories: normalizeList(categories),
      brands: normalizeList(brands),
      suppliers: normalizeList(suppliers),
      branches: normalizeList(branches),
      includeArchived: !!includeArchived
    };
    state.importer.history = canBulkImportProducts() ? normalizeList(responses[5]) : [];
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

  async function loadBulkImportData() {
    await loadBulkImportHistory().catch(function () { return []; });
  }

  async function loadImportHistoryData() {
    await loadBulkImportHistory().catch(function () { return []; });
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
    const [settings, branding, categorizationRules] = await Promise.all([
      apiJson("/api/settings").catch(function () { return {}; }),
      apiJson("/api/settings/branding").catch(function () { return {}; }),
      apiJson("/api/settings/product-categorization-rules").catch(function () { return { data: [] }; })
    ]);
    state.cache.settings = { settings: settings || {}, branding: branding || {}, categorizationRules: normalizeList(categorizationRules) };
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
      case "bulk-import":
        renderBulkImportPage();
        break;
      case "import-history":
        renderImportHistoryPage();
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
    const itemCount = state.pos.basket.reduce(function (sum, line) { return sum + firstNumber(line.quantity, 0); }, 0);

    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-action="quick-add-customer"><i class="fa-solid fa-user-plus"></i>Add Customer</button><button class="btn btn-outline" data-action="open-quotation-modal"><i class="fa-solid fa-file-signature"></i>New Quotation</button></div><div class="stats-inline"><span class="document-chip">Held Sales: ' + escapeHtml(String(state.pos.held.length)) + '</span><span class="document-chip">Basket Items: ' + escapeHtml(String(state.pos.basket.length)) + '</span></div></div>',
      '<div class="pos-basket-overlay" id="posBasketOverlay" data-action="toggle-basket"></div>',
      '<button class="pos-fab" id="posFloatingBasket" data-action="toggle-basket"><i class="fa-solid fa-basket-shopping"></i><span class="pos-fab__badge">' + escapeHtml(String(itemCount)) + ' · ' + money(totals.total) + '</span></button>',
      '<div class="pos-layout">',
      '<section class="card section-card pos-column pos-column--catalog"><div class="section-head"><div><h3>New Sale</h3><p>Search, scan barcode or browse by category</p></div><span class="badge warning">Counter Mode</span></div><label class="search-field search-field--compact"><i class="fa-solid fa-magnifying-glass"></i><input id="posProductSearch" type="search" placeholder="Scan barcode or search product… (F2)" value="' + escapeAttr(state.pos.search) + '" /></label><div class="pos-catalog-shell"><div class="pos-categories-panel">' + renderPosCategoryChips() + '</div><div class="pos-products-panel">' + renderProductGrid(products) + '</div></div></section>',
      '<div class="pos-column pos-column--basket" id="posBasketColumn">',
      '<section class="card section-card" style="margin-bottom:16px">',
      '<div class="basket-section-head"><h4><i class="fa-solid fa-basket-shopping" style="color:var(--orange);margin-right:8px"></i>Basket <span class="document-chip" style="font-size:0.8rem;padding:4px 10px">' + escapeHtml(String(state.pos.basket.length)) + ' items</span></h4>' +
        (state.pos.basket.length ? '<button class="btn btn-danger" style="padding:8px 12px;font-size:0.84rem" data-action="basket-clear"><i class="fa-solid fa-trash"></i>Clear</button>' : '') +
      '</div>',
      renderBasketTable(),
      '<div class="pos-summary">' +
        '<div class="pos-summary-row"><span>Subtotal</span><strong>' + money(totals.subtotal) + '</strong></div>' +
        '<div class="pos-summary-row"><span>Discount</span><strong><input id="posDiscountInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.discount_amount)) + '" /></strong></div>' +
        '<div class="pos-summary-row"><span>VAT (16%)</span><strong>' + money(totals.vat) + '</strong></div>' +
        '<div class="pos-summary-row"><span>Shipping</span><strong><input id="posShippingInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.shipping_amount)) + '" /></strong></div>' +
        '<div class="pos-summary-row total"><span>Grand Total</span><strong>' + money(totals.total) + '</strong></div>' +
      '</div>',
      '</section>',
      '<section class="card section-card">',
      '<div class="section-head"><div><h3>Customer &amp; Payment</h3></div></div>',
      '<div class="inline-group"><select id="posCustomerSelect">' + customerOptions + '</select><button class="btn btn-outline" data-action="quick-add-customer"><i class="fa-solid fa-plus"></i></button></div>',
      '<div class="payment-options">' + PAYMENT_METHODS.map(function (method) {
        return '<button class="payment-chip' + (state.pos.payment_method === method ? ' active' : '') + '" data-action="pos-payment" data-value="' + escapeAttr(method) + '">' + escapeHtml(titleize(method.replace("bank_transfer", "bank"))) + '</button>';
      }).join("") + '</div>',
      '<div class="form-grid" style="margin-top:14px">' +
        '<label><span>Cash Received</span><input id="posAmountPaidInput" type="number" step="0.01" min="0" value="' + escapeAttr(String(state.pos.amount_paid)) + '" /></label>' +
        '<div class="document-chip document-chip--balance"><strong>Balance / Change</strong><div>' + money(state.pos.amount_paid - totals.total) + '</div></div>' +
        '<label class="form-span-2"><span>Notes</span><textarea id="posNotesInput" placeholder="Sale notes, delivery note, installation details...">' + escapeHtml(state.pos.notes || "") + '</textarea></label>' +
      '</div>',
      '<div class="pos-checkout-grid">' +
        '<button class="btn btn-primary" data-action="complete-sale"><i class="fa-solid fa-check-circle"></i>Save Sale <kbd style="opacity:0.7;font-size:0.75rem;padding:2px 5px;border-radius:5px;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15)">F9</kbd></button>' +
        '<button class="btn btn-outline" data-action="preview-quotation-before-sale"><i class="fa-solid fa-file-signature"></i>Preview Quote</button>' +
        '<button class="btn btn-outline" data-action="preview-invoice-before-sale"><i class="fa-solid fa-file-lines"></i>Preview Invoice</button>' +
        '<button class="btn btn-outline" data-action="preview-receipt-before-sale" data-paper="80mm"><i class="fa-solid fa-eye"></i>Preview Receipt</button>' +
        '<button class="btn btn-secondary" data-action="print-receipt-now"><i class="fa-solid fa-print"></i>Print</button>' +
        '<button class="btn btn-outline" data-action="download-receipt-now"><i class="fa-solid fa-file-pdf"></i>Download PDF</button>' +
        '<button class="btn btn-outline" data-action="email-receipt-now"><i class="fa-solid fa-envelope"></i>Email PDF</button>' +
        '<button class="btn btn-outline" data-action="share-receipt-now"><i class="fa-solid fa-share-nodes"></i>Share PDF</button>' +
      '</div>',
      '<div class="pos-action-grid" style="margin-top:10px;grid-template-columns:repeat(3,minmax(0,1fr))">' +
        '<button class="btn btn-outline" data-action="hold-sale"><i class="fa-solid fa-pause"></i>Hold</button>' +
        '<button class="btn btn-outline" data-action="suspend-sale"><i class="fa-solid fa-file-signature"></i>Quotation</button>' +
        '<button class="btn btn-danger" data-action="cancel-sale"><i class="fa-solid fa-xmark"></i>Cancel</button>' +
      '</div>',
      renderHeldSales(),
      '<div class="pos-shortcuts-hint">' +
        '<span class="pos-shortcut"><kbd>F2</kbd> Search</span>' +
        '<span class="pos-shortcut"><kbd>F4</kbd> Basket</span>' +
        '<span class="pos-shortcut"><kbd>F6</kbd> Preview Receipt</span>' +
        '<span class="pos-shortcut"><kbd>F7</kbd> Preview Invoice</span>' +
        '<span class="pos-shortcut"><kbd>F8</kbd> Print Receipt</span>' +
        '<span class="pos-shortcut"><kbd>F9</kbd> Save Sale</span>' +
        '<span class="pos-shortcut"><kbd>Esc</kbd> Cancel</span>' +
      '</div>',
      '</section>',
      '</div>',
      '</div>',
      '<section class="card section-card" style="margin-top:20px"><div class="section-head"><div><h3>Recent POS Sales</h3><p>Latest completed transactions</p></div><button class="btn btn-outline" data-route="dashboard">Back to dashboard</button></div>' + renderTable(["Receipt", "Customer", "Amount", "Method", "Status", "Actions"], recentSales.slice(0, 8).map(function (sale) {
        return [
          escapeHtml(firstText(sale.receipt_number, sale.invoice_number, "—")),
          escapeHtml(firstText(sale.customer_name, "Walk-in Customer")),
          money(firstNumber(sale.total, sale.amount, 0)),
          escapeHtml(titleize(firstText(sale.payment_method, "cash"))),
          renderBadge(firstText(sale.status, "paid")),
          renderDocumentButtons("receipt", sale.id, "80mm", "Receipt") + renderSaleActionButtons(sale)
        ];
      }), "No recent sales available.") + '</section>'
    ].join("");
  }

  function canEditProducts() {
    const role = firstText(state.user && state.user.role);
    return ["super_admin", "business_owner", "branch_manager", "storekeeper"].includes(role);
  }

  function getProductCollections() {
    const cache = state.cache.products || {};
    return {
      allProducts: cache.products || [],
      categories: cache.categories || [],
      brands: cache.brands || [],
      suppliers: cache.suppliers || [],
      branches: cache.branches || state.branches || [],
      includeArchived: !!cache.includeArchived
    };
  }

  function getFilteredProductRows() {
    const collections = getProductCollections();
    const searchValue = firstText(state.productWorkspace.search).toLowerCase();
    const categoryId = firstText(state.productWorkspace.categoryId, "all");
    const status = firstText(state.productWorkspace.status, "all");
    const branchId = firstText(state.productWorkspace.branchId, "all");
    return collections.allProducts.filter(function (item) {
      const matchesSearch = !searchValue || [
        firstText(item.product_name),
        firstText(item.sku, item.product_code),
        firstText(item.barcode),
        firstText(item.category_name),
        firstText(item.brand_name),
        firstText(item.supplier_name),
        firstText(item.branch_name)
      ].join(" ").toLowerCase().indexOf(searchValue) >= 0;
      const matchesCategory = categoryId === "all" || String(item.category_id || "") === String(categoryId);
      const matchesStatus = status === "all" || firstText(item.status, "active") === status;
      const matchesBranch = branchId === "all" || String(item.branch_id || item.primary_branch_id || "") === String(branchId);
      return matchesSearch && matchesCategory && matchesStatus && matchesBranch;
    });
  }

  function getVisibleProductPageRows(rows) {
    const pageSize = firstNumber(state.productWorkspace.pageSize, 10);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (state.productWorkspace.page > totalPages) state.productWorkspace.page = totalPages;
    const currentPage = Math.max(1, state.productWorkspace.page);
    const start = (currentPage - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      start: rows.length ? start + 1 : 0,
      end: Math.min(start + pageSize, rows.length),
      currentPage: currentPage,
      totalPages: totalPages
    };
  }

  function changeProductPage(direction) {
    const rows = getFilteredProductRows().filter(function (item) { return !item.is_archived; });
    const totalPages = Math.max(1, Math.ceil(rows.length / firstNumber(state.productWorkspace.pageSize, 10)));
    state.productWorkspace.page = Math.min(totalPages, Math.max(1, state.productWorkspace.page + direction));
    renderCurrentRoute();
  }

  function toggleProductSelection(productId) {
    const id = String(productId || "");
    const selected = new Set((state.productWorkspace.selectedIds || []).map(String));
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    state.productWorkspace.selectedIds = Array.from(selected);
  }

  function toggleSelectAllVisibleProducts(checked) {
    const visible = getVisibleProductPageRows(getFilteredProductRows().filter(function (item) { return !item.is_archived; })).rows.map(function (item) { return String(item.id); });
    const selected = new Set((state.productWorkspace.selectedIds || []).map(String));
    visible.forEach(function (id) {
      if (checked) selected.add(id);
      else selected.delete(id);
    });
    state.productWorkspace.selectedIds = Array.from(selected);
  }

  function renderProductPhoto(value, alt, compact) {
    const url = resolveInventoryAssetUrl(value);
    const klass = compact ? 'inventory-photo inventory-photo--small' : 'inventory-photo';
    return url ? '<div class="' + klass + '"><img src="' + escapeAttr(url) + '" alt="' + escapeAttr(alt || 'Product photo') + '" /></div>' : '<div class="' + klass + ' inventory-photo--placeholder"><i class="fa-solid fa-box-open"></i></div>';
  }

  function renderInventoryStatus(product) {
    return '<div class="inventory-status-stack">' + renderBadge(firstText(product.status, 'active')) + renderStockPill(product) + '</div>';
  }

  function renderProductSelectionSummary(pageRows, totalRows) {
    if (!canEditProducts()) return '';
    const selected = new Set((state.productWorkspace.selectedIds || []).map(String));
    const allVisibleSelected = pageRows.length && pageRows.every(function (item) { return selected.has(String(item.id)); });
    return '<div class="inventory-bulkbar">' +
      '<label class="inventory-check"><input id="productSelectAll" type="checkbox"' + (allVisibleSelected ? ' checked' : '') + ' /><span>Select page</span></label>' +
      '<div class="inventory-bulkbar__meta"><strong>' + escapeHtml(String(selected.size)) + '</strong><span>selected of ' + escapeHtml(String(totalRows)) + '</span></div>' +
      '<div class="inventory-bulkbar__actions"><select id="productBulkAction"><option value="">Bulk actions</option><option value="generate-barcodes">Generate barcodes</option>' + (isSuperAdmin() ? '<option value="archive">Archive selected</option><option value="restore">Restore selected</option><option value="delete">Delete selected</option>' : '') + '</select><button class="btn btn-outline" type="button" data-action="product-bulk-apply">Apply</button></div>' +
      '</div>';
  }

  function renderProductPagination(pageInfo, totalRows) {
    return '<div class="inventory-pagination"><div class="inventory-pagination__meta">Showing ' + escapeHtml(String(pageInfo.start)) + '–' + escapeHtml(String(pageInfo.end)) + ' of ' + escapeHtml(String(totalRows)) + ' products</div><div class="inventory-pagination__actions"><button class="btn btn-outline" type="button" data-action="product-page-prev"' + (pageInfo.currentPage <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i>Prev</button><span class="document-chip">Page ' + escapeHtml(String(pageInfo.currentPage)) + ' / ' + escapeHtml(String(pageInfo.totalPages)) + '</span><button class="btn btn-outline" type="button" data-action="product-page-next"' + (pageInfo.currentPage >= pageInfo.totalPages ? ' disabled' : '') + '>Next<i class="fa-solid fa-chevron-right"></i></button></div></div>';
  }

  function renderProductDesktopTable(rows) {
    if (!rows.length) return renderEmptyInline("No products match the current filters.");
    const selected = new Set((state.productWorkspace.selectedIds || []).map(String));
    const editable = canEditProducts();
    return '<div class="data-table-wrap inventory-table-wrap"><table class="data-table inventory-table"><thead><tr><th style="width:44px"></th><th>Photo</th><th>SKU</th><th>Barcode</th><th>Product Name</th><th>Category</th><th>Buying Price</th><th>Selling Price</th><th>Current Stock</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function (item) {
      return '<tr>' +
        '<td><button class="icon-btn inventory-row-check' + (selected.has(String(item.id)) ? ' is-selected' : '') + '" type="button"' + (editable ? ' data-action="product-row-select" data-product-id="' + escapeAttr(String(item.id)) + '"' : ' disabled') + ' aria-label="Select product"><i class="fa-solid ' + (editable ? (selected.has(String(item.id)) ? 'fa-check' : 'fa-plus') : 'fa-lock') + '"></i></button></td>' +
        '<td>' + renderProductPhoto(firstText(item.image_url, (item.product_photos || [])[0], ""), firstText(item.product_name, 'Product'), true) + '</td>' +
        '<td><strong>' + escapeHtml(firstText(item.sku, item.product_code, '—')) + '</strong></td>' +
        '<td>' + escapeHtml(firstText(item.barcode, '—')) + '</td>' +
        '<td><div class="inventory-name-cell"><strong>' + escapeHtml(firstText(item.product_name, '—')) + '</strong><div class="table-caption">' + escapeHtml(firstText(item.brand_name, item.supplier_name, 'No brand')) + '</div></div></td>' +
        '<td>' + escapeHtml(firstText(item.category_name, 'Uncategorised')) + '</td>' +
        '<td>' + money(firstNumber(item.buying_price, item.cost_price, 0)) + '</td>' +
        '<td>' + money(firstNumber(item.selling_price, 0)) + '</td>' +
        '<td><div class="inventory-stock-cell"><strong>' + escapeHtml(numberText(firstNumber(item.current_stock, 0))) + '</strong><div class="table-caption">Min ' + escapeHtml(numberText(firstNumber(item.min_stock, 0))) + ' ' + escapeHtml(firstText(item.unit_of_measure, item.unit, 'units')) + '</div></div></td>' +
        '<td>' + escapeHtml(firstText(item.branch_name, 'Not assigned')) + '</td>' +
        '<td>' + renderInventoryStatus(item) + '</td>' +
        '<td>' + renderProductActionButtons(item) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
  }

  function renderProducts() {
    const collections = getProductCollections();
    const rows = getFilteredProductRows();
    const activeProducts = rows.filter(function (item) { return !item.is_archived; });
    const archivedProducts = rows.filter(function (item) { return item.is_archived; });
    const summary = productSummary(activeProducts);
    const pageInfo = getVisibleProductPageRows(activeProducts);
    const canImport = canBulkImportProducts();
    const showArchived = isSuperAdmin() && collections.includeArchived;
    const editable = canEditProducts();
    els.viewRoot.innerHTML = [
      '<section class="card section-card inventory-shell">' +
        '<div class="inventory-header">' +
          '<div><span class="workspace-hero__eyebrow">Inventory Management</span><h2>Products</h2><p>Manage catalog data, pricing, stock and photo-rich inventory records across branches.</p></div>' +
          '<div class="inventory-header__actions">' + (editable ? '<button class="btn btn-primary" data-action="quick-add-product"><i class="fa-solid fa-plus"></i>Add Product</button><button class="btn btn-outline" data-action="manage-categories"><i class="fa-solid fa-tags"></i>Manage Categories</button>' : '') + '<button class="btn btn-outline" data-route="inventory"><i class="fa-solid fa-warehouse"></i>Inventory</button>' + (canImport ? '<button class="btn btn-secondary" data-action="bulk-import-products"><i class="fa-solid fa-file-import"></i>Bulk Import</button>' : '') + (isSuperAdmin() ? '<button class="btn btn-outline" data-action="toggle-archived-products"><i class="fa-solid fa-box-archive"></i>' + (showArchived ? 'Hide Archived' : 'Show Archived') + '</button>' : '') + '</div>' +
        '</div>' +
        renderOverviewTiles([
          ['Products', numberText(summary.total)],
          ['Low Stock', numberText(summary.lowStock)],
          ['Out of Stock', numberText(summary.outOfStock)],
          ['Categories', numberText(summary.categories)]
        ]) +
        '<div class="inventory-filterbar">' +
          '<label class="search-field search-field--compact inventory-search"><i class="fa-solid fa-magnifying-glass"></i><input id="productPageSearch" type="search" placeholder="Search SKU, barcode, product or supplier" value="' + escapeAttr(firstText(state.productWorkspace.search, '')) + '" /></label>' +
          '<label><span>Category</span><select id="productFilterCategory"><option value="all">All categories</option>' + collections.categories.map(function (item) {
            return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(state.productWorkspace.categoryId) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.name, 'Category')) + '</option>';
          }).join('') + '</select></label>' +
          '<label><span>Status</span><select id="productFilterStatus"><option value="all">All statuses</option><option value="active"' + (state.productWorkspace.status === 'active' ? ' selected' : '') + '>Active</option><option value="inactive"' + (state.productWorkspace.status === 'inactive' ? ' selected' : '') + '>Inactive</option></select></label>' +
          '<label><span>Branch</span><select id="productFilterBranch"><option value="all">All branches</option>' + collections.branches.map(function (item) {
            return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(state.productWorkspace.branchId) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.name, item.branch_name, 'Branch')) + '</option>';
          }).join('') + '</select></label>' +
        '</div>' +
        renderProductSelectionSummary(pageInfo.rows, activeProducts.length) +
        renderProductDesktopTable(pageInfo.rows) +
        renderProductPagination(pageInfo, activeProducts.length) +
      '</section>',
      (showArchived && archivedProducts.length ? '<section class="card section-card inventory-archived"><div class="section-head"><div><h3>Archived Products</h3><p>Products hidden from active catalog views but kept for history.</p></div></div>' + renderProductDesktopTable(archivedProducts.slice(0, 20)) + '</section>' : ''),
      canImport ? renderBulkImportSummaryCard((state.importer.history || []).slice(0, 5)) : ''
    ].join('');
  }

  function canBulkImportProducts() {
    const role = firstText(state.user && state.user.role);
    return ["super_admin", "business_owner", "branch_manager", "inventory_manager"].includes(role);
  }

  function isSuperAdmin() {
    const role = firstText(state.user && state.user.role);
    return role === "super_admin" || role === "business_owner";
  }

  function renderSaleActionButtons(sale) {
    if (!isSuperAdmin()) return '';
    var buttons = [];
    if (sale.status === "draft") {
      buttons.push('<button class="btn btn-danger" style="padding:5px 10px;font-size:0.8rem" data-action="delete-sale-draft" data-sale-id="' + escapeAttr(String(sale.id)) + '" data-receipt="' + escapeAttr(firstText(sale.receipt_number, sale.id)) + '" title="Permanently delete this draft sale"><i class="fa-solid fa-trash"></i> Delete Draft</button>');
    }
    if (sale.status === "completed") {
      buttons.push('<button class="btn btn-outline" style="padding:5px 10px;font-size:0.8rem" data-action="void-sale" data-sale-id="' + escapeAttr(String(sale.id)) + '" data-receipt="' + escapeAttr(firstText(sale.receipt_number, sale.id)) + '" title="Void this sale (reverses stock, preserves record)"><i class="fa-solid fa-ban"></i> Void</button>');
      buttons.push('<button class="btn btn-secondary" style="padding:5px 10px;font-size:0.8rem" data-action="return-sale" data-sale-id="' + escapeAttr(String(sale.id)) + '" data-receipt="' + escapeAttr(firstText(sale.receipt_number, sale.id)) + '" title="Process return/refund linked to this sale"><i class="fa-solid fa-rotate-left"></i> Return</button>');
    }
    return buttons.length ? '<div class="table-actions">' + buttons.join("") + '</div>' : '';
  }

  function renderProductActionButtons(product) {
    if (!canEditProducts()) return '<span class="muted">View only</span>';
    var buttons = [
      '<button class="btn btn-outline" type="button" data-action="product-edit" data-product-id="' + escapeAttr(String(product.id)) + '"><i class="fa-solid fa-pen"></i>Edit</button>',
      '<button class="btn btn-outline" type="button" data-action="product-duplicate" data-product-id="' + escapeAttr(String(product.id)) + '"><i class="fa-regular fa-clone"></i>Duplicate</button>',
      '<button class="btn btn-outline" type="button" data-action="product-history" data-product-id="' + escapeAttr(String(product.id)) + '"><i class="fa-solid fa-clock-rotate-left"></i>View History</button>',
      '<button class="btn btn-outline" type="button" data-action="product-stock-adjust" data-product-id="' + escapeAttr(String(product.id)) + '"><i class="fa-solid fa-sliders"></i>Stock Adjustment</button>'
    ];
    if (product.is_archived && isSuperAdmin()) {
      buttons.unshift('<button class="btn btn-outline" type="button" data-action="restore-product" data-product-id="' + escapeAttr(String(product.id)) + '" data-product-name="' + escapeAttr(firstText(product.product_name)) + '"><i class="fa-solid fa-rotate-right"></i>Restore</button>');
    } else if (!product.is_archived && isSuperAdmin()) {
      buttons.push('<button class="btn btn-outline" type="button" data-action="archive-product" data-product-id="' + escapeAttr(String(product.id)) + '" data-product-name="' + escapeAttr(firstText(product.product_name)) + '"><i class="fa-solid fa-box-archive"></i>Archive</button>');
    }
    if (isSuperAdmin()) {
      buttons.push('<button class="btn btn-danger" type="button" data-action="delete-product" data-product-id="' + escapeAttr(String(product.id)) + '" data-product-name="' + escapeAttr(firstText(product.product_name)) + '"><i class="fa-solid fa-trash"></i>Delete</button>');
    }
    return '<div class="table-actions inventory-actions">' + buttons.join("") + '</div>';
  }

  function renderBulkImportSummaryCard(history) {
    const latest = history[0] || null;
    const completed = history.filter(function (item) { return firstText(item.status) === "completed"; });
    const failed = history.filter(function (item) { return firstText(item.status) === "failed"; });
    return '<section class="card section-card bulk-import-hero">' +
      '<div class="section-head"><div><h3>Bulk Import Workspace</h3><p>Upload CSV, Excel, or PDF supplier files, review detected records, and import valid products in the background.</p></div>' +
      '<div class="inline-group"><button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/csv" data-name="product-import-template.csv"><i class="fa-solid fa-file-csv"></i>CSV Template</button>' +
      '<button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/xlsx" data-name="product-import-template.xlsx"><i class="fa-solid fa-file-excel"></i>Excel Template</button>' +
      '<button class="btn btn-primary" data-action="bulk-import-products"><i class="fa-solid fa-cloud-arrow-up"></i>Open Importer</button></div></div>' +
      '<div class="overview-grid bulk-import-overview">' +
      '<article class="card overview-tile"><span>Imports Logged</span><strong>' + escapeHtml(String(history.length)) + '</strong></article>' +
      '<article class="card overview-tile"><span>Completed</span><strong>' + escapeHtml(String(completed.length)) + '</strong></article>' +
      '<article class="card overview-tile"><span>Failed</span><strong>' + escapeHtml(String(failed.length)) + '</strong></article>' +
      '<article class="card overview-tile"><span>Latest Status</span><strong>' + escapeHtml(titleize(firstText(latest && latest.status, "No Imports"))) + '</strong></article>' +
      '</div>' +
      (history.length ? '<div class="data-table-wrap" style="margin-top:18px"><table class="data-table"><thead><tr><th>Date</th><th>File</th><th>Status</th><th>Imported</th><th>Updated</th><th>Failed</th><th>Actions</th></tr></thead><tbody>' + history.map(function (item) {
        const downloadable = Number(item.error_count || 0) > 0;
        return '<tr><td>' + escapeHtml(formatDateTime(item.created_at)) + '</td><td>' + escapeHtml(firstText(item.file_name, item.source_name, "Upload")) + '</td><td>' + renderBadge(firstText(item.status, "draft")) + '</td><td>' + escapeHtml(String(firstNumber(item.created_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.updated_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.error_count, 0))) + '</td><td><div class="table-actions"><button class="btn btn-outline" data-action="bulk-import-open-job" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-eye"></i>View</button>' + (downloadable ? '<button class="btn btn-outline" data-action="bulk-import-download-errors" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-file-circle-xmark"></i>Error Report</button>' : '') + '</div></td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-solid fa-file-import"></i>No import history yet. Start with the downloadable template or drag in a supplier file.</div>') +
      '</section>';
  }

  async function loadBulkImportHistory() {
    if (!canBulkImportProducts()) return [];
    const history = await apiJson("/api/products/imports").catch(function () { return { data: [] }; });
    state.importer.history = normalizeList(history);
    return state.importer.history;
  }

  function stopBulkImportPolling() {
    if (state.importer.pollTimer) {
      window.clearTimeout(state.importer.pollTimer);
      state.importer.pollTimer = null;
    }
  }

  function bulkImportJobIsActive(job) {
    const status = firstText(job && job.status);
    return status === "queued" || status === "processing";
  }

  function resetBulkImportDraft(keepHistory) {
    stopBulkImportPolling();
    state.importer.loading = false;
    state.importer.job = null;
    state.importer.headers = [];
    state.importer.mapping = {};
    state.importer.preview = [];
    state.importer.sourceName = "";
    state.importer.duplicateMode = "update";
    state.importer.selectedRow = null;
    state.importer.savingRow = false;
    state.importer.lastFileName = "";
    state.importer.recategorize = false;
    if (!keepHistory) state.importer.history = [];
  }

  function openBulkImportModal() {
    if (!canBulkImportProducts()) {
      showToast("Only Super Admin and authorized Inventory Managers can bulk import products.", "error");
      return;
    }
    if (!state.importer.history.length) {
      loadBulkImportHistory().then(function () {
        renderBulkImportModal();
      }).catch(function () { return []; });
    }
    openModal({
      title: "Bulk Import Products",
      subtitle: "Upload a spreadsheet or PDF, review auto-detected fields, and run the import in the background.",
      wide: true,
      actions: '<button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/xlsx" data-name="product-import-template.xlsx"><i class="fa-solid fa-file-excel"></i>Download Excel Template</button>' +
        '<button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/csv" data-name="product-import-template.csv"><i class="fa-solid fa-file-csv"></i>Download CSV Template</button>' +
        '<button class="btn btn-danger" data-action="close-modal"><i class="fa-solid fa-xmark"></i>Close</button>'
    });
    renderBulkImportModal();
  }

  function renderBulkImportModal() {
    if (els.modalOverlay.classList.contains("hidden")) return;
    const job = state.importer.job;
    const preview = state.importer.preview || [];
    const selected = state.importer.selectedRow;
    const progress = job ? Math.min(100, Math.round((firstNumber(job.processed_rows, 0) / Math.max(1, firstNumber(job.total_rows, preview.length, 1))) * 100)) : 0;
    const summary = job && job.summary ? job.summary : {};
    const headers = state.importer.headers || [];
    const history = state.importer.history || [];
    els.modalBody.innerHTML = [
      '<div class="bulk-import-layout">',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>1. Upload source file</h3><p>Drag and drop Excel, CSV, or PDF documents. OCR-style PDF extraction depends on readable text already present in the file.</p></div></div>' +
        '<div class="bulk-import-dropzone" id="bulkImportDropzone">' +
          '<i class="fa-solid fa-file-arrow-up"></i>' +
          '<strong>' + escapeHtml(state.importer.loading ? "Uploading and parsing…" : "Drop a file here or browse") + '</strong>' +
          '<p>' + escapeHtml(firstText(state.importer.sourceName, state.importer.lastFileName, "Supported: .xlsx, .csv, .pdf")) + '</p>' +
          '<div class="inline-group"><button class="btn btn-primary" type="button" data-action="bulk-import-pick-file"><i class="fa-solid fa-folder-open"></i>Select File</button></div>' +
        '</div>' +
        (job ? '<div class="bulk-import-progress"><div class="bulk-import-progress__meta"><span>' + escapeHtml(firstText(job.file_name, job.source_name, "Import draft")) + '</span>' + renderBadge(firstText(job.status, "draft")) + '</div><div class="bulk-import-progress__bar"><span style="width:' + escapeAttr(String(progress)) + '%"></span></div><div class="bulk-import-progress__stats"><span>Processed ' + escapeHtml(String(firstNumber(job.processed_rows, 0))) + ' / ' + escapeHtml(String(firstNumber(job.total_rows, preview.length))) + '</span><span>Valid ' + escapeHtml(String(firstNumber(job.valid_rows, summary.valid_rows, 0))) + '</span><span>Errors ' + escapeHtml(String(firstNumber(job.error_count, summary.error_count, 0))) + '</span></div></div>' : '') +
      '</section>',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>2. Mapping and duplicate handling</h3><p>Review detected headers, adjust mappings where needed, and choose how duplicates are treated.</p></div></div>' +
        (headers.length ? '<div class="form-grid three">' + IMPORT_FIELDS.map(function (fieldInfo) {
          const field = fieldInfo[0];
          const label = fieldInfo[1];
          return '<label><span>' + escapeHtml(label) + '</span><select data-import-mapping="' + escapeAttr(field) + '"><option value="">Ignore this field</option>' + headers.map(function (header) {
            const selectedAttr = state.importer.mapping[field] === header ? ' selected' : '';
            return '<option value="' + escapeAttr(header) + '"' + selectedAttr + '>' + escapeHtml(header) + '</option>';
          }).join("") + '</select></label>';
        }).join("") + '</div>' : '<div class="empty-state"><i class="fa-solid fa-table"></i>Upload a file to review detected headers and preview rows.</div>') +
        '<div class="form-grid two" style="margin-top:16px"><label><span>When duplicates are found</span><select id="bulkImportDuplicateMode"><option value="update"' + (state.importer.duplicateMode === "update" ? ' selected' : '') + '>Update existing product</option><option value="skip"' + (state.importer.duplicateMode === "skip" ? ' selected' : '') + '>Skip duplicate row</option><option value="duplicate"' + (state.importer.duplicateMode === "duplicate" ? ' selected' : '') + '>Create new duplicate product</option></select></label><label><span>Import controls</span><div class="inline-group"><button class="btn btn-outline" type="button" data-action="bulk-import-apply-mapping"' + (!job ? ' disabled' : '') + '><i class="fa-solid fa-shuffle"></i>Apply Mapping</button><button class="btn btn-secondary" type="button" data-action="bulk-import-start"' + (!job || bulkImportJobIsActive(job) ? ' disabled' : '') + '><i class="fa-solid fa-play"></i>Start Import</button></div></label><div class="inventory-checkbox"><span>Categorization</span><label class="inventory-check inventory-check--box"><input type="checkbox" id="bulkImportRecategorize"' + (state.importer.recategorize ? ' checked' : '') + ' /><span>Re-categorize even when category column is filled</span></label></div></div>' +
        (job ? '<div class="stats-inline" style="margin-top:16px">' +
          renderDocumentChip("Imported", firstNumber(job.created_count, 0)) +
          renderDocumentChip("Updated", firstNumber(job.updated_count, 0)) +
          renderDocumentChip("Skipped", firstNumber(job.skipped_rows, 0)) +
          renderDocumentChip("Auto Categorized", firstNumber(summary.auto_categorized_count, 0)) +
          renderDocumentChip("Needs Review", firstNumber(summary.uncategorized_count, 0)) +
          renderDocumentChip("Failed", firstNumber(job.error_count, summary.error_count, 0)) +
          '</div>' : '') +
      '</section>',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>3. Preview and edit records</h3><p>Invalid rows stay highlighted so valid records can still import. Click any row to fix extracted values before starting.</p></div>' +
        '<div class="inline-group">' + (job && firstNumber(job.error_count, summary.error_count, 0) > 0 ? '<button class="btn btn-outline" type="button" data-action="bulk-import-download-errors" data-job-id="' + escapeAttr(String(job.id)) + '"><i class="fa-solid fa-file-circle-xmark"></i>Error Report</button>' : '') + '</div></div>' +
        (preview.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Row</th><th>Status</th><th>Product</th><th>SKU / Barcode</th><th>Category</th><th>Prices</th><th>Errors</th><th>Actions</th></tr></thead><tbody>' + preview.map(function (row) {
          const normalized = row.normalized_data || {};
          const errors = row.validation_errors || [];
          return '<tr class="' + (errors.length ? 'bulk-import-row--error' : '') + '"><td>' + escapeHtml(String(row.row_number)) + '</td><td>' + renderBadge(firstText(row.status, errors.length ? "invalid" : row.action || "draft")) + '</td><td><strong>' + escapeHtml(firstText(normalized.product_name, "—")) + '</strong><div class="table-caption">' + escapeHtml(firstText(normalized.description, "")) + '</div></td><td>' + escapeHtml(firstText(normalized.product_code, normalized.barcode, "—")) + '</td><td>' + escapeHtml(firstText(normalized.category, "—")) + (normalized.category_detection && normalized.category_detection.rule_name ? '<div class="table-caption">Rule: ' + escapeHtml(firstText(normalized.category_detection.rule_name, "Auto")) + '</div>' : (!firstText(normalized.category, "") ? '<div class="table-caption">Needs manual review</div>' : '')) + '</td><td><div>' + money(firstNumber(normalized.selling_price, 0)) + '</div><div class="table-caption">Cost: ' + money(firstNumber(normalized.cost_price, 0)) + '</div></td><td>' + (errors.length ? '<ul class="bulk-import-errors">' + errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul>' : '<span class="muted">Ready</span>') + '</td><td><button class="btn btn-outline" type="button" data-action="bulk-import-edit-row" data-row-id="' + escapeAttr(String(row.id)) + '"><i class="fa-solid fa-pen"></i>Edit</button></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-solid fa-list-check"></i>No preview rows yet.</div>') +
        (selected ? renderBulkImportEditForm(selected) : '') +
      '</section>',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>Import history</h3><p>Recent background imports with quick access to error reports.</p></div><button class="btn btn-outline" type="button" data-action="bulk-import-refresh-history"><i class="fa-solid fa-rotate"></i>Refresh</button></div>' +
        (history.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>File</th><th>Status</th><th>Imported</th><th>Updated</th><th>Skipped</th><th>Failed</th><th>Actions</th></tr></thead><tbody>' + history.map(function (item) {
          const downloadable = firstNumber(item.error_count, 0) > 0;
          return '<tr><td>' + escapeHtml(formatDateTime(item.created_at)) + '</td><td>' + escapeHtml(firstText(item.file_name, item.source_name, "Upload")) + '</td><td>' + renderBadge(firstText(item.status, "draft")) + '</td><td>' + escapeHtml(String(firstNumber(item.created_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.updated_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.skipped_rows, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.error_count, 0))) + '</td><td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="bulk-import-open-job" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-eye"></i>Open</button>' + (downloadable ? '<button class="btn btn-outline" type="button" data-action="bulk-import-download-errors" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-file-circle-xmark"></i>Errors</button>' : '') + '</div></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-regular fa-clock"></i>No imports recorded yet.</div>') +
      '</section>',
      '</div>'
    ].join("");
    bindBulkImportDropzone();
    if (job && bulkImportJobIsActive(job)) startBulkImportPolling(job.id);
  }

  function renderBulkImportEditForm(row) {
    const normalized = row.normalized_data || {};
    const errors = row.validation_errors || [];
    return '<section class="bulk-import-editor"><div class="section-head"><div><h4>Edit row ' + escapeHtml(String(row.row_number)) + '</h4><p>Correct extracted values before importing this product.</p></div><button class="btn btn-secondary" type="button" data-action="bulk-import-save-row" data-row-id="' + escapeAttr(String(row.id)) + '"' + (state.importer.savingRow ? ' disabled' : '') + '><i class="fa-solid fa-floppy-disk"></i>' + escapeHtml(state.importer.savingRow ? 'Saving…' : 'Save Row') + '</button></div>' +
      (errors.length ? '<div class="inline-message error">' + escapeHtml(errors.join(" ")) + '</div>' : '') +
      '<div class="form-grid three">' + IMPORT_FIELDS.map(function (fieldInfo) {
        const field = fieldInfo[0];
        const label = fieldInfo[1];
        const value = normalized[field];
        const inputType = IMPORT_NUMERIC_FIELDS[field] ? 'number" step="0.01' : 'text';
        return '<label><span>' + escapeHtml(label) + '</span><input name="import-edit-' + escapeAttr(field) + '" type="' + inputType + '" value="' + escapeAttr(value == null ? "" : String(value)) + '" /></label>';
      }).join("") + '</div></section>';
  }

  function bindBulkImportDropzone() {
    const zone = document.getElementById("bulkImportDropzone");
    if (!zone) return;
    ["dragenter", "dragover"].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) {
        event.preventDefault();
        zone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) {
        event.preventDefault();
        zone.classList.remove("is-dragover");
      });
    });
    zone.addEventListener("drop", function (event) {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) uploadBulkImportFile(file);
    });
  }

  function pickBulkImportFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv,.pdf";
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (file) uploadBulkImportFile(file);
    });
    input.click();
  }

  async function uploadBulkImportFile(file) {
    if (!file) return;
    state.importer.loading = true;
    state.importer.sourceName = file.name || "Selected file";
    state.importer.lastFileName = file.name || "";
    refreshBulkImportView();
    try {
      const form = new FormData();
      form.append("file", file, file.name || "import-file");
      form.append("source_name", file.name || "Uploaded file");
      const data = await apiJson("/api/products/imports/upload-and-parse", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form
      });
      state.importer.job = data.job || null;
      state.importer.headers = data.headers || [];
      state.importer.mapping = data.mapping || {};
      state.importer.preview = normalizeList(data.preview);
      state.importer.selectedRow = null;
      state.importer.duplicateMode = "update";
      state.importer.recategorize = false;
      await loadBulkImportHistory();
      refreshBulkImportView();
      showToast("Import file parsed successfully. Review the preview before importing.", "success");
    } catch (error) {
      showToast(error.message || "Unable to upload import file.", "error");
    } finally {
      state.importer.loading = false;
      refreshBulkImportView();
    }
  }

  async function applyBulkImportMapping() {
    if (!state.importer.job) return;
    const nextMapping = {};
    const container = getBulkImportContainer();
    IMPORT_FIELDS.forEach(function (fieldInfo) {
      const field = fieldInfo[0];
      const select = container.querySelector('[data-import-mapping="' + field + '"]');
      if (select && select.value) nextMapping[field] = select.value;
    });
    state.importer.mapping = nextMapping;
    try {
      const data = await apiJson("/api/products/imports/" + encodeURIComponent(state.importer.job.id) + "/remap", {
        method: "POST",
        body: JSON.stringify({ mapping: nextMapping })
      });
      state.importer.job = data.job || state.importer.job;
      state.importer.preview = normalizeList(data.preview);
      state.importer.selectedRow = null;
      refreshBulkImportView();
      showToast("Column mapping updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to remap columns.", "error");
    }
  }

  function selectBulkImportRow(rowId) {
    const row = (state.importer.preview || []).find(function (item) { return String(item.id) === String(rowId); });
    if (!row) return;
    state.importer.selectedRow = row;
    refreshBulkImportView();
  }

  async function saveBulkImportRow(rowId) {
    if (!state.importer.job) return;
    const row = state.importer.selectedRow;
    if (!row || String(row.id) !== String(rowId)) return;
    const payload = {};
    const container = getBulkImportContainer();
    IMPORT_FIELDS.forEach(function (fieldInfo) {
      const field = fieldInfo[0];
      const input = container.querySelector('[name="import-edit-' + field + '"]');
      if (!input) return;
      payload[field] = IMPORT_NUMERIC_FIELDS[field] ? input.value : input.value.trim();
    });
    state.importer.savingRow = true;
    refreshBulkImportView();
    try {
      const data = await apiJson("/api/products/imports/" + encodeURIComponent(state.importer.job.id) + "/rows/" + encodeURIComponent(rowId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      state.importer.preview = (state.importer.preview || []).map(function (item) {
        return String(item.id) === String(rowId) ? (data.row || item) : item;
      });
      state.importer.selectedRow = data.row || null;
      if (state.importer.job) {
        state.importer.job.valid_rows = firstNumber(data.job_valid_rows, state.importer.job.valid_rows, 0);
        state.importer.job.invalid_rows = firstNumber(data.job_error_count, state.importer.job.invalid_rows, 0);
        state.importer.job.error_count = firstNumber(data.job_error_count, state.importer.job.error_count, 0);
      }
      refreshBulkImportView();
      showToast("Import row updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to save import row.", "error");
    } finally {
      state.importer.savingRow = false;
      refreshBulkImportView();
    }
  }

  async function startBulkImport() {
    if (!state.importer.job) return;
    const container = getBulkImportContainer();
    const duplicateMode = container.querySelector("#bulkImportDuplicateMode");
    const recategorize = container.querySelector("#bulkImportRecategorize");
    state.importer.duplicateMode = duplicateMode ? duplicateMode.value : "update";
    state.importer.recategorize = !!(recategorize && recategorize.checked);
    try {
      const data = await apiJson("/api/products/imports/" + encodeURIComponent(state.importer.job.id) + "/start", {
        method: "POST",
        body: JSON.stringify({ on_duplicate: state.importer.duplicateMode, recategorize: state.importer.recategorize })
      });
      state.importer.job = data.job || state.importer.job;
      refreshBulkImportView();
      startBulkImportPolling(state.importer.job.id);
      showToast("Bulk import started in the background.", "success");
    } catch (error) {
      showToast(error.message || "Unable to start bulk import.", "error");
    }
  }

  async function openBulkImportJob(jobId) {
    if (!jobId) {
      openBulkImportModal();
      return;
    }
    // If already on the bulk-import page, just load the job into the page view.
    if (state.activeRoute === "bulk-import" || state.activeRoute === "import-history") {
      try {
        const data = await apiJson("/api/products/imports/" + encodeURIComponent(jobId) + "?limit=100");
        state.importer.job = data.job || null;
        state.importer.preview = normalizeList(data.rows);
        state.importer.headers = state.importer.preview[0] && state.importer.preview[0].raw_data ? Object.keys(state.importer.preview[0].raw_data) : state.importer.headers;
        state.importer.selectedRow = null;
        state.importer.sourceName = firstText(data.job && data.job.file_name, data.job && data.job.source_name, state.importer.sourceName);
        if (data.job && data.job.column_mapping) state.importer.mapping = data.job.column_mapping;
        state.importer.recategorize = !!(data.job && data.job.options && data.job.options.recategorize);
        if (state.activeRoute === "bulk-import") {
          renderBulkImportPage();
        } else {
          location.hash = "bulk-import";
        }
      } catch (error) {
        showToast(error.message || "Unable to load import job.", "error");
      }
      return;
    }
    if (els.modalOverlay.classList.contains("hidden")) openBulkImportModal();
    try {
      const data = await apiJson("/api/products/imports/" + encodeURIComponent(jobId) + "?limit=100");
      state.importer.job = data.job || null;
      state.importer.preview = normalizeList(data.rows);
      state.importer.headers = state.importer.preview[0] && state.importer.preview[0].raw_data ? Object.keys(state.importer.preview[0].raw_data) : state.importer.headers;
      state.importer.selectedRow = null;
      state.importer.sourceName = firstText(data.job && data.job.file_name, data.job && data.job.source_name, state.importer.sourceName);
      if (data.job && data.job.column_mapping) state.importer.mapping = data.job.column_mapping;
      state.importer.recategorize = !!(data.job && data.job.options && data.job.options.recategorize);
      renderBulkImportModal();
    } catch (error) {
      showToast(error.message || "Unable to load import job.", "error");
    }
  }

  function startBulkImportPolling(jobId) {
    stopBulkImportPolling();
    state.importer.pollTimer = window.setTimeout(function () {
      refreshBulkImportJob(jobId);
    }, 2000);
  }

  async function refreshBulkImportJob(jobId) {
    try {
      const previousStatus = firstText(state.importer.job && state.importer.job.status);
      const data = await apiJson("/api/products/imports/" + encodeURIComponent(jobId) + "?limit=100");
      state.importer.job = data.job || state.importer.job;
      state.importer.recategorize = !!(state.importer.job && state.importer.job.options && state.importer.job.options.recategorize);
      state.importer.preview = normalizeList(data.rows);
      if (state.importer.selectedRow) {
        state.importer.selectedRow = state.importer.preview.find(function (item) {
          return String(item.id) === String(state.importer.selectedRow.id);
        }) || null;
      }
      await loadBulkImportHistory();
      refreshBulkImportView();
      if (bulkImportJobIsActive(state.importer.job)) {
        startBulkImportPolling(jobId);
      } else if (firstText(state.activeRoute) === "products") {
        await loadProductsData();
        renderCurrentRoute();
      }
      if (previousStatus !== firstText(state.importer.job && state.importer.job.status)) {
        if (firstText(state.importer.job && state.importer.job.status) === "completed") {
          showToast("Bulk import completed successfully.", "success");
        } else if (firstText(state.importer.job && state.importer.job.status) === "failed") {
          showToast(firstText(state.importer.job && state.importer.job.last_error, "Bulk import failed."), "error");
        }
      }
    } catch (_error) {
      startBulkImportPolling(jobId);
    }
  }

  async function downloadAuthorizedFile(url, fileName) {
    try {
      const res = await authorizedFetch(url, { headers: { Accept: "*/*" } });
      if (!res.ok) {
        const errorBody = await res.json().catch(function () { return {}; });
        throw new Error(firstText(errorBody.error, errorBody.message, "Download failed."));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerBlobDownload(objectUrl, fileName || parseDocumentFileName(res, "download.bin"));
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    } catch (error) {
      showToast(error.message || "Unable to download file.", "error");
    }
  }

  async function downloadBulkImportErrors(jobId) {
    if (!jobId) return;
    await downloadAuthorizedFile("/api/products/imports/" + encodeURIComponent(jobId) + "/errors.csv", "product-import-" + jobId + "-errors.csv");
  }

  // Returns the DOM container where bulk import UI should be queried (modal body or page root).
  function getBulkImportContainer() {
    if (!els.modalOverlay.classList.contains("hidden")) return els.modalBody;
    if (state.activeRoute === "bulk-import" || state.activeRoute === "import-history") return els.viewRoot;
    return els.modalBody;
  }

  // Re-render whichever bulk import surface is currently visible.
  function refreshBulkImportView() {
    if (!els.modalOverlay.classList.contains("hidden")) renderBulkImportModal();
    if (state.activeRoute === "bulk-import") renderBulkImportPage();
    else if (state.activeRoute === "import-history") renderImportHistoryPage();
  }

  // Full-page Bulk Import view (mirrors renderBulkImportModal but renders to els.viewRoot).
  function renderBulkImportPage() {
    if (!canBulkImportProducts()) {
      els.viewRoot.innerHTML = '<section class="card section-card page-empty"><i class="fa-solid fa-lock"></i><h3>Access Restricted</h3><p>Only Super Admin and authorized Inventory Managers can use Bulk Import.</p></section>';
      return;
    }
    const job = state.importer.job;
    const preview = state.importer.preview || [];
    const selected = state.importer.selectedRow;
    const progress = job ? Math.min(100, Math.round((firstNumber(job.processed_rows, 0) / Math.max(1, firstNumber(job.total_rows, preview.length, 1))) * 100)) : 0;
    const summary = job && job.summary ? job.summary : {};
    const headers = state.importer.headers || [];
    const history = state.importer.history || [];
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group">' +
        '<button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/xlsx" data-name="product-import-template.xlsx"><i class="fa-solid fa-file-excel"></i>Excel Template</button>' +
        '<button class="btn btn-outline" data-action="bulk-import-download-template" data-url="/api/products/imports/templates/csv" data-name="product-import-template.csv"><i class="fa-solid fa-file-csv"></i>CSV Template</button>' +
        '<button class="btn btn-outline" data-route="import-history"><i class="fa-solid fa-clock-rotate-left"></i>Import History</button>' +
        '<button class="btn btn-outline" data-route="inventory"><i class="fa-solid fa-warehouse"></i>Inventory</button>' +
      '</div></div>',
      '<div class="bulk-import-layout">',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>1. Upload source file</h3><p>Drag and drop Excel, CSV, or PDF documents. OCR-style PDF extraction depends on readable text already present in the file.</p></div></div>' +
        '<div class="bulk-import-dropzone" id="bulkImportDropzone">' +
          '<i class="fa-solid fa-file-arrow-up"></i>' +
          '<strong>' + escapeHtml(state.importer.loading ? "Uploading and parsing…" : "Drop a file here or browse") + '</strong>' +
          '<p>' + escapeHtml(firstText(state.importer.sourceName, state.importer.lastFileName, "Supported: .xlsx, .csv, .pdf")) + '</p>' +
          '<div class="inline-group"><button class="btn btn-primary" type="button" data-action="bulk-import-pick-file"><i class="fa-solid fa-folder-open"></i>Select File</button></div>' +
        '</div>' +
        (job ? '<div class="bulk-import-progress"><div class="bulk-import-progress__meta"><span>' + escapeHtml(firstText(job.file_name, job.source_name, "Import draft")) + '</span>' + renderBadge(firstText(job.status, "draft")) + '</div><div class="bulk-import-progress__bar"><span style="width:' + escapeAttr(String(progress)) + '%"></span></div><div class="bulk-import-progress__stats"><span>Processed ' + escapeHtml(String(firstNumber(job.processed_rows, 0))) + ' / ' + escapeHtml(String(firstNumber(job.total_rows, preview.length))) + '</span><span>Valid ' + escapeHtml(String(firstNumber(job.valid_rows, summary.valid_rows, 0))) + '</span><span>Errors ' + escapeHtml(String(firstNumber(job.error_count, summary.error_count, 0))) + '</span></div></div>' : '') +
      '</section>',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>2. Mapping and duplicate handling</h3><p>Review detected headers, adjust mappings where needed, and choose how duplicates are treated.</p></div></div>' +
        (headers.length ? '<div class="form-grid three">' + IMPORT_FIELDS.map(function (fieldInfo) {
          const field = fieldInfo[0];
          const label = fieldInfo[1];
          return '<label><span>' + escapeHtml(label) + '</span><select data-import-mapping="' + escapeAttr(field) + '"><option value="">Ignore this field</option>' + headers.map(function (header) {
            const selectedAttr = state.importer.mapping[field] === header ? ' selected' : '';
            return '<option value="' + escapeAttr(header) + '"' + selectedAttr + '>' + escapeHtml(header) + '</option>';
          }).join("") + '</select></label>';
        }).join("") + '</div>' : '<div class="empty-state"><i class="fa-solid fa-table"></i>Upload a file to review detected headers and preview rows.</div>') +
        '<div class="form-grid two" style="margin-top:16px"><label><span>When duplicates are found</span><select id="bulkImportDuplicateMode"><option value="update"' + (state.importer.duplicateMode === "update" ? ' selected' : '') + '>Update existing product</option><option value="skip"' + (state.importer.duplicateMode === "skip" ? ' selected' : '') + '>Skip duplicate row</option><option value="duplicate"' + (state.importer.duplicateMode === "duplicate" ? ' selected' : '') + '>Create new duplicate product</option></select></label><label><span>Import controls</span><div class="inline-group"><button class="btn btn-outline" type="button" data-action="bulk-import-apply-mapping"' + (!job ? ' disabled' : '') + '><i class="fa-solid fa-shuffle"></i>Apply Mapping</button><button class="btn btn-secondary" type="button" data-action="bulk-import-start"' + (!job || bulkImportJobIsActive(job) ? ' disabled' : '') + '><i class="fa-solid fa-play"></i>Start Import</button></div></label><div class="inventory-checkbox"><span>Categorization</span><label class="inventory-check inventory-check--box"><input type="checkbox" id="bulkImportRecategorize"' + (state.importer.recategorize ? ' checked' : '') + ' /><span>Re-categorize even when category column is filled</span></label></div></div>' +
        (job ? '<div class="stats-inline" style="margin-top:16px">' +
          renderDocumentChip("Imported", firstNumber(job.created_count, 0)) +
          renderDocumentChip("Updated", firstNumber(job.updated_count, 0)) +
          renderDocumentChip("Skipped", firstNumber(job.skipped_rows, 0)) +
          renderDocumentChip("Auto Categorized", firstNumber(summary.auto_categorized_count, 0)) +
          renderDocumentChip("Needs Review", firstNumber(summary.uncategorized_count, 0)) +
          renderDocumentChip("Failed", firstNumber(job.error_count, summary.error_count, 0)) +
          '</div>' : '') +
      '</section>',
      '<section class="card section-card bulk-import-panel">' +
        '<div class="section-head"><div><h3>3. Preview and edit records</h3><p>Invalid rows stay highlighted so valid records can still import. Click any row to fix extracted values before starting.</p></div>' +
        '<div class="inline-group">' + (job && firstNumber(job.error_count, summary.error_count, 0) > 0 ? '<button class="btn btn-outline" type="button" data-action="bulk-import-download-errors" data-job-id="' + escapeAttr(String(job.id)) + '"><i class="fa-solid fa-file-circle-xmark"></i>Error Report</button>' : '') + '</div></div>' +
        (preview.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Row</th><th>Status</th><th>Product</th><th>SKU / Barcode</th><th>Category</th><th>Prices</th><th>Errors</th><th>Actions</th></tr></thead><tbody>' + preview.map(function (row) {
          const normalized = row.normalized_data || {};
          const errors = row.validation_errors || [];
          return '<tr class="' + (errors.length ? 'bulk-import-row--error' : '') + '"><td>' + escapeHtml(String(row.row_number)) + '</td><td>' + renderBadge(firstText(row.status, errors.length ? "invalid" : row.action || "draft")) + '</td><td><strong>' + escapeHtml(firstText(normalized.product_name, "—")) + '</strong><div class="table-caption">' + escapeHtml(firstText(normalized.description, "")) + '</div></td><td>' + escapeHtml(firstText(normalized.product_code, normalized.barcode, "—")) + '</td><td>' + escapeHtml(firstText(normalized.category, "—")) + (normalized.category_detection && normalized.category_detection.rule_name ? '<div class="table-caption">Rule: ' + escapeHtml(firstText(normalized.category_detection.rule_name, "Auto")) + '</div>' : (!firstText(normalized.category, "") ? '<div class="table-caption">Needs manual review</div>' : '')) + '</td><td><div>' + money(firstNumber(normalized.selling_price, 0)) + '</div><div class="table-caption">Cost: ' + money(firstNumber(normalized.cost_price, 0)) + '</div></td><td>' + (errors.length ? '<ul class="bulk-import-errors">' + errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul>' : '<span class="muted">Ready</span>') + '</td><td><button class="btn btn-outline" type="button" data-action="bulk-import-edit-row" data-row-id="' + escapeAttr(String(row.id)) + '"><i class="fa-solid fa-pen"></i>Edit</button></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-solid fa-list-check"></i>No preview rows yet.</div>') +
        (selected ? renderBulkImportEditForm(selected) : '') +
      '</section>',
      '</div>'
    ].join("");
    bindBulkImportDropzone();
    if (job && bulkImportJobIsActive(job)) startBulkImportPolling(job.id);
  }

  // Full-page Import History view.
  function renderImportHistoryPage() {
    if (!canBulkImportProducts()) {
      els.viewRoot.innerHTML = '<section class="card section-card page-empty"><i class="fa-solid fa-lock"></i><h3>Access Restricted</h3><p>Only Super Admin and authorized Inventory Managers can view Import History.</p></section>';
      return;
    }
    const history = state.importer.history || [];
    els.viewRoot.innerHTML = [
      '<div class="module-toolbar"><div class="inline-group">' +
        '<button class="btn btn-primary" data-route="bulk-import"><i class="fa-solid fa-file-import"></i>New Import</button>' +
        '<button class="btn btn-outline" data-action="bulk-import-refresh-history"><i class="fa-solid fa-rotate"></i>Refresh</button>' +
        '<button class="btn btn-outline" data-route="inventory"><i class="fa-solid fa-warehouse"></i>Inventory</button>' +
      '</div></div>',
      renderOverviewTiles([
        ["Total Imports", numberText(history.length)],
        ["Completed", numberText(history.filter(function (item) { return firstText(item.status) === "completed"; }).length)],
        ["Total Imported", numberText(sumBy(history, function (item) { return firstNumber(item.created_count, 0); }))],
        ["Total Errors", numberText(sumBy(history, function (item) { return firstNumber(item.error_count, 0); }))]
      ]),
      '<section class="card section-card">' +
        '<div class="section-head"><div><h3>Import History</h3><p>All bulk import jobs — click View to re-open a job on the Bulk Import page.</p></div></div>' +
        (history.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>File</th><th>Status</th><th>Imported</th><th>Updated</th><th>Skipped</th><th>Failed</th><th>Actions</th></tr></thead><tbody>' + history.map(function (item) {
          const downloadable = firstNumber(item.error_count, 0) > 0;
          return '<tr><td>' + escapeHtml(formatDateTime(item.created_at)) + '</td><td>' + escapeHtml(firstText(item.file_name, item.source_name, "Upload")) + '</td><td>' + renderBadge(firstText(item.status, "draft")) + '</td><td>' + escapeHtml(String(firstNumber(item.created_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.updated_count, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.skipped_rows, 0))) + '</td><td>' + escapeHtml(String(firstNumber(item.error_count, 0))) + '</td><td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="bulk-import-open-job" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-eye"></i>View</button>' + (downloadable ? '<button class="btn btn-outline" type="button" data-action="bulk-import-download-errors" data-job-id="' + escapeAttr(String(item.id)) + '"><i class="fa-solid fa-file-circle-xmark"></i>Errors</button>' : '') + '</div></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-regular fa-clock"></i>No imports recorded yet.</div>') +
      '</section>'
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
      '<section class="card section-card"><div class="section-head"><div><h3>Business Settings</h3><p>Primary business identity used across transactions.</p></div></div><form id="settingsBusinessForm" class="form-grid two"><label><span>Business Name</span><input name="business_name" value="' + escapeAttr(firstText(settings.business_name, branding.business_name, DEFAULT_BRANDING.business_name)) + '" /></label><label><span>Currency</span><input name="currency" value="' + escapeAttr(firstText(settings.currency, "KES")) + '" /></label><label><span>Currency Symbol</span><input name="currency_symbol" value="' + escapeAttr(firstText(settings.currency_symbol, "")) + '" /></label><label><span>Primary Phone</span><input name="business_phone" value="' + escapeAttr(firstText(settings.business_phone, branding.business_phone, DEFAULT_BRANDING.business_phone)) + '" /></label><label><span>Alternative Phone</span><input name="business_phone2" value="' + escapeAttr(firstText(settings.business_phone2, branding.business_phone2, "")) + '" /></label><label><span>Business Email</span><input name="business_email" type="email" value="' + escapeAttr(firstText(settings.business_email, branding.business_email, DEFAULT_BRANDING.business_email)) + '" /></label><label><span>KRA PIN / Tax PIN</span><input name="tax_number" value="' + escapeAttr(firstText(settings.tax_number, branding.tax_number, "")) + '" /></label><label><span>Country</span><input name="country" value="' + escapeAttr(firstText(settings.country, "")) + '" /></label><label><span>Timezone</span><input name="timezone" value="' + escapeAttr(firstText(settings.timezone, "")) + '" /></label><label><span>SMTP Host</span><input name="smtp_host" value="' + escapeAttr(firstText(settings.smtp_host, "")) + '" /></label><label><span>SMTP Port</span><input name="smtp_port" type="number" min="1" step="1" value="' + escapeAttr(firstText(settings.smtp_port, "587")) + '" /></label><label><span>SMTP User</span><input name="smtp_user" value="' + escapeAttr(firstText(settings.smtp_user, "")) + '" /></label><label><span>SMTP From</span><input name="smtp_from" type="email" value="' + escapeAttr(firstText(settings.smtp_from, "")) + '" /></label><label class="form-span-2"><span>Address</span><textarea name="business_address">' + escapeHtml(firstText(settings.business_address, branding.business_address, DEFAULT_BRANDING.business_address)) + '</textarea></label><label class="form-span-2"><span>Receipt Footer</span><textarea name="receipt_footer">' + escapeHtml(firstText(settings.receipt_footer, "")) + '</textarea></label><div class="form-span-2"><button class="btn btn-primary" type="submit">Save Business Settings</button></div></form></section>',
      '<section class="card section-card"><div class="section-head"><div><h3>Branding &amp; Documents</h3><p>Logo, colours, document headers and terms used on quotations, invoices and receipts.</p></div></div><form id="settingsBrandingForm" class="form-grid two"><label><span>Display Name</span><input name="business_name" value="' + escapeAttr(firstText(branding.business_name, DEFAULT_BRANDING.business_name)) + '" /></label><label><span>Tagline</span><input name="tagline" value="' + escapeAttr(firstText(branding.tagline, branding.description, DEFAULT_BRANDING.tagline)) + '" /></label><label><span>Website</span><input name="website" value="' + escapeAttr(firstText(branding.website, "")) + '" /></label><label><span>VAT Number</span><input name="vat_number" value="' + escapeAttr(firstText(branding.vat_number, "")) + '" /></label><label><span>Primary Colour</span><input name="primary_color" value="' + escapeAttr(firstText(branding.primary_color, "#083d6d")) + '" /></label><label><span>Secondary Colour</span><input name="secondary_color" value="' + escapeAttr(firstText(branding.secondary_color, "#f7931e")) + '" /></label><label><span>Document Phone</span><input name="business_phone" value="' + escapeAttr(firstText(branding.business_phone, settings.business_phone, DEFAULT_BRANDING.business_phone)) + '" /></label><label><span>Document Email</span><input name="business_email" type="email" value="' + escapeAttr(firstText(branding.business_email, settings.business_email, DEFAULT_BRANDING.business_email)) + '" /></label><label class="form-span-2"><span>Document Address</span><textarea name="business_address">' + escapeHtml(firstText(branding.business_address, settings.business_address, DEFAULT_BRANDING.business_address)) + '</textarea></label><label class="form-span-2"><span>Company Logo</span><input type="hidden" name="logo_url" value="' + escapeAttr(firstText(branding.logo_url, branding.logoUrl, "")) + '" /><div class="branding-upload"><img id="brandingLogoPreview" class="branding-upload__preview" alt="Logo preview" /><div class="branding-upload__meta"><input id="brandingLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /><p class="branding-upload__hint">Upload PNG, JPG, WebP, or SVG up to 2 MB. Stored logos are reused in the UI, previews, PDFs, and emails.</p><div class="branding-upload__actions"><button class="btn btn-outline" id="brandingLogoUploadBtn" type="button">Upload selected logo</button><button class="btn btn-outline" id="brandingLogoClearBtn" type="button">Use placeholder</button></div><div class="branding-upload__status" id="brandingLogoStatus">Current logo stays active until you save branding.</div></div></div></label><label><span>Quotation Validity Days</span><input name="quotation_validity_days" type="number" min="1" step="1" value="' + escapeAttr(firstText(settings.quotation_validity_days, branding.quotation_validity_days, "30")) + '" /></label><label><span>Document Footer Text</span><input name="document_footer" value="' + escapeAttr(firstText(branding.document_footer, "")) + '" /></label><label class="form-span-2"><span>Terms &amp; Conditions (one line per term — shown on quotations and invoices)</span><textarea name="invoice_payment_terms" rows="6">' + escapeHtml(firstText(settings.invoice_payment_terms, branding.invoice_payment_terms, "Quotation valid for 30 days.\nGoods remain the property of the seller until paid in full.\nWarranty applies where specified.\nReturns are subject to our return policy.\nErrors and Omissions Excepted (E&OE).")) + '</textarea></label><label class="form-span-2"><span>Warranty Text</span><textarea name="warranty_text">' + escapeHtml(firstText(branding.warranty_text, "")) + '</textarea></label><label class="form-span-2"><span>Return Policy</span><textarea name="return_policy">' + escapeHtml(firstText(branding.return_policy, "")) + '</textarea></label><div class="form-span-2"><button class="btn btn-primary" type="submit">Save Branding &amp; Documents</button></div></form></section>',
      '<section class="card section-card"><div class="section-head"><div><h3>Payment &amp; Banking</h3><p>M-PESA and bank details printed on invoices and quotations. Editable by administrators only.</p></div></div><form id="settingsPaymentForm" class="form-grid two"><label><span>M-PESA Paybill No.</span><input name="mpesa_paybill" value="' + escapeAttr(firstText(settings.mpesa_paybill, "")) + '" placeholder="e.g. 400200" /></label><label><span>M-PESA Paybill Account</span><input name="mpesa_paybill_account" value="' + escapeAttr(firstText(settings.mpesa_paybill_account, "")) + '" placeholder="e.g. Use invoice number as account" /></label><label><span>M-PESA Till No. (Buy Goods)</span><input name="mpesa_till" value="' + escapeAttr(firstText(settings.mpesa_till, "")) + '" placeholder="e.g. 123456" /></label><label><span>Other Payment Methods</span><input name="other_payment_methods" value="' + escapeAttr(firstText(settings.other_payment_methods, "")) + '" placeholder="e.g. Cheque, Credit" /></label><label><span>Bank Name</span><input name="bank_name" value="' + escapeAttr(firstText(settings.bank_name, "")) + '" placeholder="e.g. Equity Bank" /></label><label><span>Bank Branch</span><input name="bank_branch" value="' + escapeAttr(firstText(settings.bank_branch, "")) + '" placeholder="e.g. Westlands" /></label><label><span>Bank Account Name</span><input name="bank_account_name" value="' + escapeAttr(firstText(settings.bank_account_name, "")) + '" placeholder="e.g. Unique Solar Kenya Ltd" /></label><label><span>Bank Account Number</span><input name="bank_account_number" value="' + escapeAttr(firstText(settings.bank_account_number, "")) + '" placeholder="e.g. 0123456789" /></label><label><span>Swift Code (optional)</span><input name="bank_swift_code" value="' + escapeAttr(firstText(settings.bank_swift_code, "")) + '" placeholder="e.g. EQBLKENA" /></label><label class="form-span-2"><span>Additional Payment Instructions (free text shown in notes)</span><textarea name="payment_instructions">' + escapeHtml(firstText(settings.payment_instructions, "")) + '</textarea></label><div class="form-span-2"><button class="btn btn-primary" type="submit">Save Payment Details</button></div></form></section>',
      renderCategorizationRulesSection(data),
      '</div>'
    ].join("");
    bindBrandingUploadControls();
  }

  function renderCategorizationRulesSection(data) {
    const rules = normalizeList(data && data.categorizationRules);
    return '<section class="card section-card"><div class="section-head"><div><h3>Product Categorization Rules</h3><p>Manage keyword-based category detection priority and status.</p></div></div>' +
      '<form id="settingsCategorizationForm" class="form-grid two"><input type="hidden" name="rule_id" value="" />' +
      '<label><span>Rule Name</span><input name="rule_name" required placeholder="e.g. Solar Inverters" /></label>' +
      '<label><span>Target Category</span><input name="category_name" required placeholder="e.g. Solar > Inverters" /></label>' +
      '<label class="form-span-2"><span>Keywords (comma separated)</span><input name="keywords" required placeholder="inverter, hybrid inverter, pure sine" /></label>' +
      '<label><span>Priority (lower runs first)</span><input name="priority" type="number" min="1" step="1" value="100" /></label>' +
      '<div class="inventory-checkbox"><span>Status</span><label class="inventory-check inventory-check--box"><input name="is_enabled" type="checkbox" checked /><span>Enabled</span></label></div>' +
      '<div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Save Rule</button><button class="btn btn-outline" type="button" data-action="categorization-rule-clear-form">Clear</button></div></form>' +
      (rules.length ? '<div class="data-table-wrap" style="margin-top:16px"><table class="data-table"><thead><tr><th>Priority</th><th>Rule</th><th>Category</th><th>Keywords</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rules.map(function (rule) {
        const keywords = Array.isArray(rule.keywords) ? rule.keywords.join(", ") : "";
        return '<tr><td>' + escapeHtml(String(firstNumber(rule.priority, 100))) + '</td><td><strong>' + escapeHtml(firstText(rule.rule_name, "Rule")) + '</strong></td><td>' + escapeHtml(firstText(rule.category_name, "—")) + '</td><td>' + escapeHtml(keywords) + '</td><td>' + renderBadge(rule.is_enabled === false ? "disabled" : "enabled") + '</td><td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="categorization-rule-edit" data-rule-id="' + escapeAttr(String(rule.id)) + '"><i class="fa-solid fa-pen"></i>Edit</button><button class="btn btn-outline" type="button" data-action="categorization-rule-toggle" data-rule-id="' + escapeAttr(String(rule.id)) + '" data-enabled="' + escapeAttr(String(rule.is_enabled !== false)) + '"><i class="fa-solid fa-power-off"></i>' + (rule.is_enabled === false ? "Enable" : "Disable") + '</button><button class="btn btn-outline" type="button" data-action="categorization-rule-up" data-rule-id="' + escapeAttr(String(rule.id)) + '"><i class="fa-solid fa-arrow-up"></i></button><button class="btn btn-outline" type="button" data-action="categorization-rule-down" data-rule-id="' + escapeAttr(String(rule.id)) + '"><i class="fa-solid fa-arrow-down"></i></button><button class="btn btn-danger" type="button" data-action="categorization-rule-delete" data-rule-id="' + escapeAttr(String(rule.id)) + '"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
      }).join("") + '</tbody></table></div>' : renderEmptyInline("No categorization rules yet.")) +
      '</section>';
  }

  function populateCategorizationRuleForm(ruleId) {
    const form = document.getElementById("settingsCategorizationForm");
    if (!form) return;
    const rules = normalizeList((state.cache.settings || {}).categorizationRules);
    const rule = rules.find(function (item) { return String(item.id) === String(ruleId); });
    if (!rule) return;
    form.elements.rule_id.value = String(rule.id);
    form.elements.rule_name.value = firstText(rule.rule_name, "");
    form.elements.category_name.value = firstText(rule.category_name, "");
    form.elements.keywords.value = Array.isArray(rule.keywords) ? rule.keywords.join(", ") : "";
    form.elements.priority.value = String(firstNumber(rule.priority, 100));
    form.elements.is_enabled.checked = rule.is_enabled !== false;
    showToast("Rule loaded into form.", "success");
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

  function getPosCategoryNames() {
    return normalizeList(state.pos.categories).map(function (item) {
      return firstText(item.name, item.category_name, "");
    }).filter(function (name) { return !!name; });
  }

  function renderPosCategoryChips() {
    const seen = {};
    const names = ["All Products"].concat(getPosCategoryNames()).concat(["Others"]).filter(function (name) {
      const key = name.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return '<div class="filter-chips">' + names.map(function (name) {
      return '<button class="chip' + (state.pos.categoryFilter === name ? ' active' : '') + '" data-action="pos-category" data-value="' + escapeAttr(name) + '">' + escapeHtml(name) + '</button>';
    }).join("") + '</div>';
  }

  function renderProductGrid(products) {
    if (!products.length) return renderEmptyInline("No products match the current search or category.");
    return '<div class="product-grid">' + products.map(function (product) {
      const image = resolveInventoryAssetUrl(product.image_url);
      return '<article class="product-card" data-action="add-to-basket" data-id="' + escapeAttr(String(product.id)) + '"><div class="product-card__image">' + (image ? '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(firstText(product.product_name, 'Product')) + '" />' : '<i class="fa-solid fa-solar-panel"></i>') + '</div><div class="product-card__body"><div class="product-card__title">' + escapeHtml(firstText(product.product_name, 'Product')) + '</div><div class="product-card__meta"><span>' + money(firstNumber(product.selling_price, 0)) + '</span>' + renderStockPill(product) + '</div><button type="button" class="btn btn-primary"><i class="fa-solid fa-plus"></i>Add</button></div></article>';
    }).join("") + '</div>';
  }

  function renderBasketTable() {
    if (!state.pos.basket.length) return '<div class="empty-state"><i class="fa-solid fa-basket-shopping"></i>Basket is empty. Add products to begin.</div>';
    return '<div class="data-table-wrap"><table class="basket-table"><thead><tr><th colspan="2">Item</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody>' + state.pos.basket.map(function (line) {
      const image = resolveInventoryAssetUrl(line.image_url);
      const imgHtml = image
        ? '<div class="basket-table-img"><img src="' + escapeAttr(image) + '" alt="" /></div>'
        : '<div class="basket-table-img"><i class="fa-solid fa-solar-panel"></i></div>';
      return '<tr>' +
        '<td style="width:46px;padding-right:0">' + imgHtml + '</td>' +
        '<td><strong style="display:block;font-size:0.9rem">' + escapeHtml(line.product_name) + '</strong>' +
        '<div class="table-caption" style="font-size:0.78rem">' + escapeHtml(firstText(line.product_code, '')) + ' · ' + money(line.unit_price) + '</div></td>' +
        '<td><div class="qty-control"><button data-action="basket-dec" data-id="' + escapeAttr(String(line.product_id)) + '">-</button><strong>' + escapeHtml(String(line.quantity)) + '</strong><button data-action="basket-inc" data-id="' + escapeAttr(String(line.product_id)) + '">+</button></div></td>' +
        '<td><strong>' + money(lineTotal(line)) + '</strong></td>' +
        '<td><button class="btn btn-danger" style="padding:8px" data-action="basket-remove" data-id="' + escapeAttr(String(line.product_id)) + '"><i class="fa-solid fa-trash"></i></button></td>' +
        '</tr>';
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
    const query = firstText(state.pos.search, "").toLowerCase();
    if (query) {
      products = products.filter(function (item) {
        return [item.product_name, item.product_code, item.barcode, item.category_name].some(function (value) {
          return contains(String(value || "").toLowerCase(), query);
        });
      });
    }
    products = products.filter(function (item) {
      return firstNumber(item.current_stock, item.stock, 0) > 0;
    });
    const filter = state.pos.categoryFilter;
    if (filter && filter !== "All Products") {
      const liveCategoryNames = getPosCategoryNames().map(function (name) { return name.toLowerCase(); });
      products = products.filter(function (item) {
        const category = firstText(item.category_name, item.category, "Others");
        if (filter === "Others") return liveCategoryNames.indexOf(category.toLowerCase()) === -1;
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
        image_url: firstText(product.image_url, ""),
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

  async function completeSaleAndThen(action) {
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
      renderCurrentRoute();
      const receiptId = sale.id;
      const invoiceId = sale.invoice_id;
      if (action === "print-receipt") {
        printDocument("receipt", receiptId, "80mm");
      } else if (action === "print-invoice") {
        if (invoiceId) {
          printDocument("invoice", invoiceId, "a4");
        } else {
          showToast("No invoice was generated for this sale.", "warning");
        }
      } else if (action === "email-receipt") {
        emailDocument("receipt", receiptId);
      } else if (action === "email-invoice") {
        if (invoiceId) {
          emailDocument("invoice", invoiceId);
        } else {
          showToast("No invoice was generated for this sale.", "warning");
        }
      } else if (action === "download-receipt") {
        downloadDocumentPdf("receipt", receiptId, "80mm");
      } else if (action === "share-receipt") {
        shareDocumentWhatsapp("receipt", receiptId, "80mm");
      }
    } catch (error) {
      showToast(error.message || "Sale failed.", "error");
    }
  }

  function previewSaleDraft(type, paper) {
    if (!state.pos.basket.length) {
      showToast("Add products to preview a " + type + ".", "error");
      return;
    }
    const normalizedType = documentType(type);
    const previewPaper = paper || defaultDocumentPaper(normalizedType);
    const preview = buildDraftDocumentPreview(normalizedType, previewPaper);
    openModal({
      title: preview.title,
      subtitle: "Draft preview using the final print layout.",
      wide: true,
      actions: renderDraftPreviewActions(normalizedType, previewPaper),
      body: renderDocumentPreviewFrame()
    });
    setDocumentPreviewFrame(preview.html);
  }

  function buildDraftDocumentPreview(type, paper) {
    const totals = calculatePosTotals();
    const customer = state.pos.customers.find(function (item) { return String(item.id) === String(state.pos.customer_id); }) || null;
    const branding = state.branding || {};
    const settings = (state.cache.settings || {}).settings || {};
    const now = new Date();
    const currency = firstText(settings.currency, branding.currency, 'KES');
    const companyName = firstText(branding.business_name, settings.business_name, DEFAULT_BRANDING.business_name);
    const companyAddress = firstText(branding.business_address, settings.business_address, DEFAULT_BRANDING.business_address);
    const companyPhone = [firstText(branding.business_phone, settings.business_phone, DEFAULT_BRANDING.business_phone), firstText(settings.business_phone2, branding.business_phone2, '')].filter(Boolean).join(' / ');
    const companyEmail = firstText(branding.business_email, settings.business_email, DEFAULT_BRANDING.business_email);
    const companyWebsite = firstText(branding.website, settings.website, '');
    const taxNumber = firstText(settings.tax_number, branding.tax_number, branding.pin_number, '');
    const vatNumber = firstText(branding.vat_number, settings.vat_number, '');
    const logoUrl = sanitizeUrl(firstText(branding.logo_url, branding.logoUrl, '')) || '/assets/unique-solar-kenya-logo.svg';
    const branchName = firstText(state.pos.branchName, '');
    const primaryColor = firstText(branding.primary_color, '#083d6d');
    const secondaryColor = firstText(branding.secondary_color, '#f7931e');
    const numberSeed = String(Date.now()).slice(-6);
    const documentNumber = type === 'quotation'
      ? 'QT-PREVIEW-' + numberSeed
      : type === 'invoice'
        ? 'INV-PREVIEW-' + numberSeed
        : 'RCPT-PREVIEW-' + numberSeed;
    const documentTitle = type === 'quotation' ? 'Quotation' : type === 'invoice' ? 'Tax Invoice' : 'Receipt';
    const paymentTerms = firstText(settings.invoice_payment_terms, branding.invoice_payment_terms, 'Due on receipt');
    const warrantyText = firstText(branding.warranty_text, settings.warranty_text, '');
    const returnPolicy = firstText(branding.return_policy, settings.return_policy, '');
    const paymentInstructions = firstText(settings.payment_instructions, branding.payment_instructions, '');
    const invoiceTerms = firstText(settings.invoice_payment_terms, branding.invoice_payment_terms, '');
    const validityDays = firstNumber(settings.quotation_validity_days, branding.quotation_validity_days, 30);
    const notesSections = [
      ['Warranty', warrantyText],
      ['Delivery Terms', firstText(state.pos.notes, '')],
      ['Return Policy', returnPolicy],
      ['Additional Notes', firstText(branding.document_footer, settings.receipt_footer, '')]
    ].filter(function (section) { return section[1]; });
    const termsLines = invoiceTerms
      ? invoiceTerms.split(/\n/).filter(Boolean)
      : [
          'Quotation valid for ' + validityDays + ' days.',
          'Goods remain the property of the seller until paid in full.',
          'Warranty applies where specified.',
          'Returns are subject to our return policy.',
          'Errors and Omissions Excepted (E&OE).'
        ];
    const payment = {
      mpesaPaybill: firstText(settings.mpesa_paybill, ''),
      mpesaTill: firstText(settings.mpesa_till, ''),
      mpesaAccount: firstText(settings.mpesa_paybill_account, documentNumber),
      bankName: firstText(settings.bank_name, ''),
      bankBranch: firstText(settings.bank_branch, ''),
      bankAccountName: firstText(settings.bank_account_name, ''),
      bankAccountNumber: firstText(settings.bank_account_number, ''),
      bankSwiftCode: firstText(settings.bank_swift_code, ''),
      paymentInstructions: paymentInstructions
    };
    const rows = state.pos.basket.map(function (line) {
      return {
        itemCode: firstText(line.product_code, '—'),
        description: firstText(line.product_name, 'Item'),
        quantity: firstNumber(line.quantity, 0),
        unit: firstText(line.unit, 'pcs'),
        unitPrice: firstNumber(line.unit_price, 0),
        discount: firstNumber(line.discount, 0),
        vatRate: firstNumber(line.vat_rate, 16),
        total: lineTotal(line)
      };
    });
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent([documentTitle, documentNumber, companyName, totals.total].join('|'));
    const documentData = {
      type: type,
      paper: paper,
      documentTitle: documentTitle,
      documentNumber: documentNumber,
      date: now,
      dueDate: type === 'invoice' ? addDays(now, 14) : type === 'quotation' ? addDays(now, validityDays) : null,
      salesperson: firstText(state.user && state.user.name, state.user && state.user.email, 'Sales Team'),
      reference: 'Draft preview',
      paymentTerms: paymentTerms,
      currency: currency,
      company: {
        name: companyName,
        address: companyAddress,
        phone: companyPhone,
        email: companyEmail,
        website: companyWebsite,
        taxNumber: taxNumber,
        vatNumber: vatNumber,
        logoUrl: logoUrl,
        slogan: firstText(branding.tagline, ''),
        supportEmail: companyEmail,
        branchName: branchName,
        primaryColor: primaryColor,
        secondaryColor: secondaryColor
      },
      customer: {
        name: firstText(customer && customer.name, customer && customer.company, 'Walk-in Customer'),
        company: firstText(customer && customer.company, ''),
        address: firstText(customer && customer.address, ''),
        phone: firstText(customer && customer.phone, ''),
        email: firstText(customer && customer.email, ''),
        taxNumber: firstText(customer && customer.tax_number, ''),
        cashier: firstText(state.user && state.user.name, 'Cashier')
      },
      rows: rows,
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.vat,
        shipping: totals.shipping,
        total: totals.total,
        paid: firstNumber(state.pos.amount_paid, 0),
        balance: firstNumber(state.pos.amount_paid, 0) - totals.total
      },
      paymentMethod: firstText(state.pos.payment_method, 'cash'),
      notesSections: notesSections,
      termsLines: termsLines,
      payment: payment,
      qrUrl: qrUrl
    };
    return {
      title: documentTitle + ' Preview',
      html: buildDocumentPreviewHtml(documentData)
    };
  }

  function renderDraftPreviewActions(type, paper) {
    const actions = [];
    if (type === 'receipt') {
      actions.push('<button class="btn btn-outline" data-action="preview-receipt-before-sale" data-paper="80mm"><i class="fa-solid fa-receipt"></i>Preview 80mm</button>');
      actions.push('<button class="btn btn-outline" data-action="preview-receipt-before-sale" data-paper="58mm"><i class="fa-solid fa-receipt"></i>Preview 58mm</button>');
    }
    actions.push('<button class="btn btn-danger" data-action="close-modal"><i class="fa-solid fa-xmark"></i>Close</button>');
    return actions.join('');
  }

  function renderDocumentPreviewFrame() {
    return '<iframe id="documentPreviewFrame" class="modal-frame modal-frame--document" title="Document Preview"></iframe>';
  }

  function setDocumentPreviewFrame(html) {
    const frame = document.getElementById('documentPreviewFrame');
    if (frame) frame.srcdoc = html;
  }

  function buildDocumentPreviewHtml(doc) {
    const company = doc.company || {};
    const customer = doc.customer || {};
    const totals = doc.totals || {};
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    const notesSections = Array.isArray(doc.notesSections) ? doc.notesSections : [];
    const termsLines = Array.isArray(doc.termsLines) ? doc.termsLines : [];
    const payment = doc.payment || {};
    const title = escapeHtml(doc.documentTitle || 'Document');
    const primary = firstText(company.primaryColor, '#083d6d');
    const accent = firstText(company.secondaryColor, '#f7931e');
    const logo = escapeAttr(firstText(company.logoUrl, '/assets/unique-solar-kenya-logo.svg'));
    const isReceipt = doc.type === 'receipt' || doc.paper === '80mm' || doc.paper === '58mm';
    const thermalWidth = doc.paper === '58mm' ? '58mm' : '80mm';

    // Notes markup
    const notesMarkup = notesSections.length
      ? notesSections.map(function (s) {
          return '<div class="nc"><h4>' + escapeHtml(s[0]) + '</h4><p>' + escapeHtml(s[1]).replace(/\n/g, '<br/>') + '</p></div>';
        }).join('')
      : '<div class="nc nc-full"><h4>Notes</h4><p>No additional notes.</p></div>';

    // A4 item rows
    const a4Rows = rows.map(function (row) {
      return '<tr><td>' + escapeHtml(firstText(row.itemCode, '—')) + '</td><td><strong>' + escapeHtml(firstText(row.description, 'Item')) + '</strong></td>' +
        '<td class="num">' + escapeHtml(numberText(firstNumber(row.quantity, 0))) + '</td><td>' + escapeHtml(firstText(row.unit, 'pcs')) + '</td>' +
        '<td class="num">' + money(firstNumber(row.unitPrice, 0), doc.currency) + '</td>' +
        '<td class="num">' + money(firstNumber(row.discount, 0), doc.currency) + '</td>' +
        '<td class="num">' + escapeHtml(numberText(firstNumber(row.vatRate, 0))) + '%</td>' +
        '<td class="num"><strong>' + money(firstNumber(row.total, 0), doc.currency) + '</strong></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No line items</td></tr>';

    // Thermal item rows
    const thermalRows = rows.map(function (row) {
      return '<tr><td><strong>' + escapeHtml(firstText(row.description, 'Item')) + '</strong>' +
        '<div class="tsub">' + escapeHtml(firstText(row.itemCode, '—')) + '</div></td>' +
        '<td class="num">' + escapeHtml(numberText(firstNumber(row.quantity, 0))) + '</td>' +
        '<td class="num">' + money(firstNumber(row.unitPrice, 0), doc.currency) + '</td>' +
        '<td class="num">' + money(firstNumber(row.total, 0), doc.currency) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">No items</td></tr>';

    // Payment details cards
    const hasMpesa = payment.mpesaPaybill || payment.mpesaTill;
    const hasBank = payment.bankName || payment.bankAccountNumber;
    const mpesaCard = hasMpesa
      ? '<div class="pc"><div class="pc-head"><span class="pc-icon">📱</span><h4>M-PESA Payment</h4></div>' +
        (payment.mpesaPaybill ? '<div class="pr"><span>Paybill No.</span><strong>' + escapeHtml(payment.mpesaPaybill) + '</strong></div>' : '') +
        (payment.mpesaAccount ? '<div class="pr"><span>Account No.</span><strong>' + escapeHtml(payment.mpesaAccount) + '</strong></div>' : '') +
        (payment.mpesaTill ? '<div class="pr"><span>Till No. (Buy Goods)</span><strong>' + escapeHtml(payment.mpesaTill) + '</strong></div>' : '') +
        '<div class="pr pr-total"><span>Amount</span><strong>' + money(firstNumber(totals.total, 0), doc.currency) + '</strong></div>' +
        '</div>'
      : '';
    const bankCard = hasBank
      ? '<div class="pc"><div class="pc-head"><span class="pc-icon">🏦</span><h4>Bank Transfer</h4></div>' +
        (payment.bankName ? '<div class="pr"><span>Bank</span><strong>' + escapeHtml(payment.bankName) + '</strong></div>' : '') +
        (payment.bankBranch ? '<div class="pr"><span>Branch</span><strong>' + escapeHtml(payment.bankBranch) + '</strong></div>' : '') +
        (payment.bankAccountName ? '<div class="pr"><span>Account Name</span><strong>' + escapeHtml(payment.bankAccountName) + '</strong></div>' : '') +
        (payment.bankAccountNumber ? '<div class="pr"><span>Account No.</span><strong>' + escapeHtml(payment.bankAccountNumber) + '</strong></div>' : '') +
        (payment.bankSwiftCode ? '<div class="pr"><span>Swift Code</span><strong>' + escapeHtml(payment.bankSwiftCode) + '</strong></div>' : '') +
        '</div>'
      : '';
    const extraInstructions = payment.paymentInstructions
      ? '<div class="pc pc-full"><div class="pc-head"><span class="pc-icon">💳</span><h4>Additional Payment Instructions</h4></div><p class="pc-note">' + escapeHtml(payment.paymentInstructions).replace(/\n/g, '<br/>') + '</p></div>'
      : '';
    const paymentSection = (hasMpesa || hasBank || extraInstructions)
      ? '<div class="psec"><h3 class="slabel">How to Pay</h3><div class="pcards">' + mpesaCard + bankCard + extraInstructions + '</div></div>'
      : '';

    // Terms section
    const termsSection = !isReceipt && termsLines.length
      ? '<div class="tsec"><h3 class="slabel">Terms &amp; Conditions</h3><ol class="tlist">' +
        termsLines.map(function (l) { return '<li>' + escapeHtml(l) + '</li>'; }).join('') +
        '</ol></div>'
      : '';

    const footerLine = [company.website, company.email].filter(Boolean).map(escapeHtml).join(' · ');

    const css = '<style>' +
      ':root{color-scheme:light only;}' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{background:#f0f4f8;color:#0f172a;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;}' +
      '.page{padding:18px;}' +
      '.sheet{margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(15,23,42,.12);overflow:hidden;}' +
      '.sheet--a4{width:210mm;min-height:297mm;border-radius:14px;}' +
      '.sheet--th{width:' + escapeHtml(thermalWidth) + ';border-radius:10px;}' +
      '.accent{height:7px;background:linear-gradient(90deg,' + primary + ' 0%,#1565c0 55%,' + accent + ' 100%);}' +
      '.body{padding:22px 26px;}' +
      /* ---- Header ---- */
      '.hdr{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px;}' +
      '.brand{display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;}' +
      '.brand img{width:68px;height:68px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:7px;background:#fff;flex-shrink:0;}' +
      '.brand h1{font-size:18px;font-weight:800;color:' + primary + ';margin-bottom:4px;line-height:1.2;}' +
      '.brand-meta{color:#475569;font-size:11px;line-height:1.7;}' +
      /* ---- Title card ---- */
      '.tc{min-width:210px;max-width:260px;background:' + primary + ';border-radius:12px;padding:16px 18px;flex-shrink:0;}' +
      '.tc h2{font-size:20px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#fff;margin-bottom:5px;}' +
      '.tc .dn{font-size:12px;color:rgba(255,255,255,.75);padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.2);margin-bottom:12px;}' +
      '.tc .ig{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 10px;}' +
      '.tc .ig span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:1px;}' +
      '.tc .ig strong{font-size:11.5px;font-weight:600;color:#fff;}' +
      /* ---- Meta grid ---- */
      '.mg{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-bottom:18px;}' +
      '.panel{border:1px solid #e2e8f0;border-radius:10px;padding:14px;}' +
      '.panel h3{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + primary + ';margin-bottom:8px;}' +
      '.panel .pn{font-size:14px;font-weight:600;color:#0f172a;margin-bottom:3px;}' +
      '.panel p{color:#475569;font-size:11.5px;line-height:1.5;margin-top:2px;}' +
      '.ig2{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 12px;}' +
      '.ig2 span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:2px;}' +
      '.ig2 strong{font-size:12px;font-weight:600;color:#0f172a;word-break:break-word;}' +
      /* ---- Items table ---- */
      '.items{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:18px;}' +
      'table{width:100%;border-collapse:collapse;}' +
      'thead th{background:' + primary + ';color:#fff;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:10px 9px;text-align:left;}' +
      'tbody td{padding:10px 9px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:top;}' +
      'tbody tr:nth-child(even){background:#f8faff;}' +
      'tbody tr:last-child td{border-bottom:none;}' +
      '.num{text-align:right;white-space:nowrap;}' +
      /* ---- Summary grid ---- */
      '.sg{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-bottom:18px;align-items:start;}' +
      '.ng{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;}' +
      '.nc{border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8faff;min-height:80px;}' +
      '.nc h4{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:' + primary + ';margin-bottom:5px;}' +
      '.nc p{color:#475569;font-size:11px;line-height:1.5;}' +
      '.nc-full{grid-column:1/-1;}' +
      /* ---- Totals panel ---- */
      '.tp{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;}' +
      '.tr2{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;}' +
      '.tr2 span{color:#64748b;}' +
      '.tr2 strong{font-weight:600;}' +
      '.gtb{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:' + primary + ';color:#fff;}' +
      '.gtb .gl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.8);}' +
      '.gtb .ga{font-size:20px;font-weight:800;}' +
      /* ---- Payment section ---- */
      '.slabel{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:' + primary + ';margin-bottom:10px;}' +
      '.psec{margin-bottom:16px;}' +
      '.pcards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}' +
      '.pc{border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8faff;}' +
      '.pc-full{grid-column:1/-1;}' +
      '.pc-head{display:flex;align-items:center;gap:7px;margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid #e2e8f0;}' +
      '.pc-icon{font-size:17px;line-height:1;}' +
      '.pc h4{font-size:12px;font-weight:700;color:' + primary + ';}' +
      '.pr{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:11px;}' +
      '.pr span{color:#64748b;}' +
      '.pr strong{font-weight:600;color:#0f172a;text-align:right;max-width:55%;}' +
      '.pr-total{margin-top:7px;padding-top:7px;border-top:1px solid #e2e8f0;}' +
      '.pr-total strong{color:' + primary + ';font-size:12px;font-weight:700;}' +
      '.pc-note{font-size:11px;color:#475569;line-height:1.55;}' +
      /* ---- Terms section ---- */
      '.tsec{margin-bottom:16px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;}' +
      '.tlist{padding-left:16px;color:#475569;}' +
      '.tlist li{font-size:11px;line-height:1.6;padding:2px 0;}' +
      /* ---- Signatures ---- */
      '.sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}' +
      '.sig{padding:26px 12px 9px;border:1px solid #e2e8f0;border-radius:10px;}' +
      '.sig-line{height:1px;background:#94a3b8;margin-bottom:7px;}' +
      '.sig-label{font-size:10.5px;color:#64748b;text-align:center;}' +
      /* ---- Footer ---- */
      '.ftr{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;background:#f8faff;border:1px solid #e2e8f0;}' +
      '.ftr img.qr{width:76px;height:76px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;background:#fff;padding:4px;flex-shrink:0;}' +
      '.ftr h4{font-size:13px;font-weight:700;color:' + primary + ';margin-bottom:4px;}' +
      '.ftr p{color:#64748b;font-size:11px;margin-top:2px;}' +
      /* ---- Thermal ---- */
      '.th-wrap{padding:12px 10px 14px;}' +
      '.th-head{text-align:center;border-bottom:1px dashed #cbd5e1;padding-bottom:9px;margin-bottom:9px;}' +
      '.th-head img{display:block;margin:0 auto 7px;width:' + escapeHtml(doc.paper === '58mm' ? '42px' : '52px') + ';height:' + escapeHtml(doc.paper === '58mm' ? '42px' : '52px') + ';border-radius:8px;object-fit:contain;border:1px solid #e2e8f0;}' +
      '.th-head h1{font-size:' + escapeHtml(doc.paper === '58mm' ? '13px' : '16px') + ';font-weight:800;color:#0f172a;margin-bottom:3px;}' +
      '.th-sub{color:#475569;font-size:' + escapeHtml(doc.paper === '58mm' ? '9px' : '10px') + ';line-height:1.5;}' +
      '.th-meta{font-size:' + escapeHtml(doc.paper === '58mm' ? '9.5px' : '10.5px') + ';margin-bottom:9px;}' +
      '.th-mrow{display:flex;justify-content:space-between;gap:4px;padding:2px 0;}' +
      '.th-items thead th{padding:6px 4px;font-size:9px;}' +
      '.th-items tbody td{padding:6px 4px;font-size:' + escapeHtml(doc.paper === '58mm' ? '9.5px' : '10.5px') + ';}' +
      '.tsub{color:#64748b;font-size:8.5px;margin-top:1px;}' +
      '.th-totals{font-size:' + escapeHtml(doc.paper === '58mm' ? '9.5px' : '10.5px') + ';margin-top:7px;}' +
      '.th-trow{display:flex;justify-content:space-between;padding:2px 0;}' +
      '.th-grand{font-size:' + escapeHtml(doc.paper === '58mm' ? '12px' : '14px') + ';font-weight:800;border-top:1px solid #0f172a;padding-top:6px;margin-top:5px;}' +
      '.th-ftr{text-align:center;border-top:1px dashed #cbd5e1;margin-top:9px;padding-top:9px;}' +
      '.th-qr{width:' + escapeHtml(doc.paper === '58mm' ? '68px' : '80px') + ';height:' + escapeHtml(doc.paper === '58mm' ? '68px' : '80px') + ';margin:7px auto;display:block;border:1px solid #e2e8f0;border-radius:8px;padding:4px;background:#fff;}' +
      '.empty{text-align:center;color:#94a3b8;padding:18px;}' +
      '@media print{body{background:#fff;}.page{padding:0;}.sheet{box-shadow:none;border-radius:0;}@page{margin:0;size:' + escapeHtml(doc.paper === '58mm' ? '58mm auto' : doc.paper === '80mm' ? '80mm auto' : 'A4') + ';}}' +
      '@media(max-width:780px){.page{padding:0;}.sheet--a4{width:100%;border-radius:0;min-height:auto;}.hdr{flex-direction:column;}.tc{max-width:100%;min-width:0;}.mg,.sg,.pcards,.sigs{grid-template-columns:1fr;}.ng{grid-template-columns:1fr;}}' +
    '</style>';

    const a4Body = '<div class="page"><div class="sheet sheet--a4">' +
      '<div class="accent"></div><div class="body">' +
      // Header
      '<div class="hdr">' +
        '<div class="brand">' +
          '<img src="' + logo + '" alt="Logo" />' +
          '<div>' +
            '<h1>' + escapeHtml(firstText(company.name, 'Company')) + '</h1>' +
            '<p class="brand-meta">' + escapeHtml(firstText(company.address, '')).replace(/\n/g, '<br/>') +
            '<br/>Tel: ' + escapeHtml(firstText(company.phone, '—')) +
            '<br/>Email: ' + escapeHtml(firstText(company.email, '—')) +
            (company.website ? '<br/>Web: ' + escapeHtml(company.website) : '') +
            (company.taxNumber ? '<br/>KRA PIN: ' + escapeHtml(company.taxNumber) : '') +
            (company.vatNumber ? ' | VAT: ' + escapeHtml(company.vatNumber) : '') +
            (company.branchName ? '<br/>' + escapeHtml(company.branchName) : '') +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="tc">' +
          '<h2>' + title + '</h2>' +
          '<div class="dn">' + escapeHtml(firstText(doc.documentNumber, '—')) + '</div>' +
          '<div class="ig">' +
            '<div><span>Date</span><strong>' + escapeHtml(formatPreviewDate(doc.date)) + '</strong></div>' +
            '<div><span>' + escapeHtml(doc.type === 'quotation' ? 'Valid Until' : 'Due Date') + '</span><strong>' + escapeHtml(doc.dueDate ? formatPreviewDate(doc.dueDate) : '—') + '</strong></div>' +
            '<div><span>Salesperson</span><strong>' + escapeHtml(firstText(doc.salesperson, 'Sales Team')) + '</strong></div>' +
            '<div><span>Currency</span><strong>' + escapeHtml(firstText(doc.currency, 'KES')) + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Meta grid
      '<div class="mg">' +
        '<section class="panel">' +
          '<h3>Bill To</h3>' +
          '<div class="pn">' + escapeHtml(firstText(customer.name, 'Walk-in Customer')) + '</div>' +
          (customer.company ? '<p>' + escapeHtml(customer.company) + '</p>' : '') +
          (customer.address ? '<p>' + escapeHtml(customer.address) + '</p>' : '') +
          (customer.phone ? '<p>Tel: ' + escapeHtml(customer.phone) + '</p>' : '') +
          (customer.email ? '<p>' + escapeHtml(customer.email) + '</p>' : '') +
          (customer.taxNumber ? '<p>KRA PIN: ' + escapeHtml(customer.taxNumber) + '</p>' : '') +
        '</section>' +
        '<section class="panel">' +
          '<h3>Document Details</h3>' +
          '<div class="ig2">' +
            '<div><span>' + escapeHtml(doc.type === 'quotation' ? 'Quote No.' : 'Invoice No.') + '</span><strong>' + escapeHtml(firstText(doc.documentNumber, '—')) + '</strong></div>' +
            '<div><span>Reference</span><strong>' + escapeHtml(firstText(doc.reference, '—')) + '</strong></div>' +
            '<div><span>Payment Terms</span><strong>' + escapeHtml(firstText(doc.paymentTerms, '—')) + '</strong></div>' +
            '<div><span>Status</span><strong>Draft</strong></div>' +
          '</div>' +
        '</section>' +
      '</div>' +
      // Items
      '<section class="items">' +
        '<table><thead><tr>' +
          '<th>Code</th><th>Description</th><th class="num">Qty</th><th>Unit</th>' +
          '<th class="num">Unit Price</th><th class="num">Disc.</th><th class="num">VAT</th><th class="num">Amount</th>' +
        '</tr></thead><tbody>' + a4Rows + '</tbody></table>' +
      '</section>' +
      // Summary
      '<div class="sg">' +
        '<div class="ng">' + notesMarkup + '</div>' +
        '<div class="tp">' +
          '<div class="tr2"><span>Subtotal</span><strong>' + money(firstNumber(totals.subtotal, 0), doc.currency) + '</strong></div>' +
          (firstNumber(totals.discount, 0) > 0 ? '<div class="tr2"><span>Discount</span><strong>&minus; ' + money(firstNumber(totals.discount, 0), doc.currency) + '</strong></div>' : '') +
          '<div class="tr2"><span>VAT</span><strong>' + money(firstNumber(totals.tax, 0), doc.currency) + '</strong></div>' +
          (firstNumber(totals.shipping, 0) > 0 ? '<div class="tr2"><span>Shipping</span><strong>' + money(firstNumber(totals.shipping, 0), doc.currency) + '</strong></div>' : '') +
          '<div class="gtb"><span class="gl">Grand Total</span><span class="ga">' + money(firstNumber(totals.total, 0), doc.currency) + '</span></div>' +
        '</div>' +
      '</div>' +
      // Payment details
      paymentSection +
      // Terms & conditions
      termsSection +
      // Signatures
      '<div class="sigs">' +
        '<div class="sig"><div class="sig-line"></div><div class="sig-label">Prepared By</div></div>' +
        '<div class="sig"><div class="sig-line"></div><div class="sig-label">Customer Acceptance</div></div>' +
        '<div class="sig"><div class="sig-line"></div><div class="sig-label">Approved By</div></div>' +
      '</div>' +
      // Footer
      '<div class="ftr">' +
        '<img class="qr" src="' + escapeAttr(firstText(doc.qrUrl, '')) + '" alt="QR" />' +
        '<div>' +
          '<h4>Thank you for your business!</h4>' +
          (footerLine ? '<p>' + footerLine + '</p>' : '') +
          (company.phone ? '<p>Tel: ' + escapeHtml(company.phone) + '</p>' : '') +
        '</div>' +
      '</div>' +
      '</div></div></div>';

    const thermalBody = '<div class="page"><div class="sheet sheet--th">' +
      '<div class="accent"></div><div class="th-wrap">' +
        '<div class="th-head">' +
          '<img src="' + logo + '" alt="Logo" />' +
          '<h1>' + escapeHtml(firstText(company.name, 'Company')) + '</h1>' +
          '<p class="th-sub">' + escapeHtml(firstText(company.address, '')).replace(/\n/g, ' ') + '</p>' +
          '<p class="th-sub">' + escapeHtml(firstText(company.phone, '')) + '</p>' +
        '</div>' +
        '<div class="th-meta">' +
          '<div class="th-mrow"><span>Receipt No.</span><strong>' + escapeHtml(firstText(doc.documentNumber, '—')) + '</strong></div>' +
          '<div class="th-mrow"><span>Date</span><strong>' + escapeHtml(formatPreviewDateTime(doc.date)) + '</strong></div>' +
          '<div class="th-mrow"><span>Cashier</span><strong>' + escapeHtml(firstText(customer.cashier, 'Cashier')) + '</strong></div>' +
          '<div class="th-mrow"><span>Customer</span><strong>' + escapeHtml(firstText(customer.name, 'Walk-in')) + '</strong></div>' +
          '<div class="th-mrow"><span>Payment</span><strong>' + escapeHtml(titleize(firstText(doc.paymentMethod, 'Cash'))) + '</strong></div>' +
        '</div>' +
        '<table class="th-items"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>' +
        '<tbody>' + thermalRows + '</tbody></table>' +
        '<div class="th-totals">' +
          '<div class="th-trow"><span>Subtotal</span><strong>' + money(firstNumber(totals.subtotal, 0), doc.currency) + '</strong></div>' +
          (firstNumber(totals.discount, 0) > 0 ? '<div class="th-trow"><span>Discount</span><strong>&minus; ' + money(firstNumber(totals.discount, 0), doc.currency) + '</strong></div>' : '') +
          '<div class="th-trow"><span>VAT</span><strong>' + money(firstNumber(totals.tax, 0), doc.currency) + '</strong></div>' +
          '<div class="th-trow"><span>Cash Tendered</span><strong>' + money(firstNumber(totals.paid, 0), doc.currency) + '</strong></div>' +
          '<div class="th-trow"><span>Change</span><strong>' + money(Math.max(0, firstNumber(totals.balance, 0)), doc.currency) + '</strong></div>' +
          '<div class="th-trow th-grand"><span>TOTAL</span><strong>' + money(firstNumber(totals.total, 0), doc.currency) + '</strong></div>' +
        '</div>' +
        '<div class="th-ftr">' +
          '<img class="th-qr" src="' + escapeAttr(firstText(doc.qrUrl, '')) + '" alt="QR" />' +
          '<p class="th-sub">Thank you for your business!</p>' +
          (footerLine ? '<p class="th-sub">' + footerLine + '</p>' : '') +
        '</div>' +
      '</div></div></div>';

    const htmlBody = isReceipt ? thermalBody : a4Body;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />' +
      '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />' +
      css + '</head><body>' + htmlBody + '</body></html>';
  }

  function formatPreviewDate(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPreviewDateTime(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
      title: title + ' Preview',
      subtitle: 'Loading clean preview with print, download, email and share actions.',
      wide: true,
      actions: renderDocumentActionBar(docType, id, normalizedPaper, relatedDocuments),
      body: '<div class="loader-card"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><div>Loading document preview…</div></div>'
    });
    try {
      const html = await fetchDocumentPreviewHtml(docType, id, normalizedPaper);
      state.modalDocument = {
        type: docType,
        id: String(id),
        paper: normalizedPaper,
        title: title || titleize(docType),
        relatedDocuments: relatedDocuments
      };
      els.modalBody.innerHTML = '<div class="document-view"><div class="document-meta"><span class="document-chip">Type: ' + escapeHtml(title || titleize(docType)) + '</span><span class="document-chip">Paper: ' + escapeHtml(normalizedPaper.toUpperCase()) + '</span></div>' + renderDocumentPreviewFrame() + '</div>';
      setDocumentPreviewFrame(html);
    } catch (error) {
      els.modalBody.innerHTML = '<div class="page-empty"><i class="fa-solid fa-circle-exclamation"></i><p>' + escapeHtml(error.message || 'Unable to load document preview.') + '</p></div>';
      showToast(error.message || 'Unable to load document preview.', 'error');
    }
  }

  function renderDocumentActionBar(type, id, paper, relatedDocuments) {
    const related = Array.isArray(relatedDocuments) ? relatedDocuments : [];
    const previewButtons = related.map(function (document) {
      return '<button class="btn btn-outline" data-action="open-document" data-type="' + escapeAttr(document.type) + '" data-id="' + escapeAttr(String(document.id)) + '" data-paper="' + escapeAttr(document.paper || defaultDocumentPaper(document.type)) + '" data-title="' + escapeAttr(document.title || titleize(document.type)) + '"><i class="fa-solid fa-file-lines"></i>Preview ' + escapeHtml(document.title || titleize(document.type)) + '</button>';
    });
    if (type === 'receipt') {
      previewButtons.unshift('<button class="btn btn-outline" data-action="open-document" data-type="receipt" data-id="' + escapeAttr(String(id)) + '" data-paper="58mm" data-title="Receipt"><i class="fa-solid fa-receipt"></i>Preview 58mm</button>');
      previewButtons.unshift('<button class="btn btn-outline" data-action="open-document" data-type="receipt" data-id="' + escapeAttr(String(id)) + '" data-paper="80mm" data-title="Receipt"><i class="fa-solid fa-receipt"></i>Preview 80mm</button>');
    }
    return previewButtons.concat([
      '<button class="btn btn-primary" data-action="print-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-print"></i>Print</button>',
      '<button class="btn btn-outline" data-action="download-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-file-pdf"></i>Download PDF</button>',
      '<button class="btn btn-outline" data-action="email-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '"><i class="fa-solid fa-envelope"></i>Email PDF</button>',
      '<button class="btn btn-outline" data-action="share-document" data-type="' + escapeAttr(type) + '" data-id="' + escapeAttr(String(id)) + '" data-paper="' + escapeAttr(paper) + '"><i class="fa-solid fa-share-nodes"></i>Share PDF</button>',
      '<button class="btn btn-danger" data-action="close-modal"><i class="fa-solid fa-xmark"></i>Close</button>'
    ]).join('');
  }

  async function printDocument(type, id, paper) {
    const docType = documentType(type);
    const paperClass = paper === "58mm" ? "print-58mm" : paper === "80mm" ? "print-80mm" : paper === "a4" ? "print-a4" : "";
    try {
      const pdfDocument = await ensureDocumentPdf(docType, id, paper);
      const frame = document.createElement("iframe");
      let printStarted = false;
      frame.className = "hidden";
      frame.src = pdfDocument.objectUrl;
      if (paperClass) document.body.classList.add(paperClass);
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
          if (paperClass) {
            window.setTimeout(function () { document.body.classList.remove(paperClass); }, 2000);
          }
        }, 400);
      };
      frame.onerror = function () {
        if (paperClass) document.body.classList.remove(paperClass);
        showToast("Unable to load the PDF for printing.", "error");
      };
      document.body.appendChild(frame);
      window.setTimeout(function () {
        if (!printStarted) {
          if (paperClass) document.body.classList.remove(paperClass);
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
      if (paperClass) document.body.classList.remove(paperClass);
      showToast(error.message || "Unable to print document.", "error");
    }
  }

  async function downloadDocumentPdf(type, id, paper) {
    const docType = documentType(type);
    try {
      const normalizedPaper = paper || defaultDocumentPaper(docType);
      const pdfDocument = await fetchDocumentPdf(docType, id, normalizedPaper);
      triggerBlobDownload(pdfDocument.objectUrl, pdfDocument.fileName);
      if (!state.modalDocument || String(state.modalDocument.id) !== String(id) || state.modalDocument.type !== docType || state.modalDocument.paper !== normalizedPaper) {
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
    stopBulkImportPolling();
    if (state.productWorkspace.editor.suggestTimer) {
      window.clearTimeout(state.productWorkspace.editor.suggestTimer);
    }
    state.productWorkspace.editor = { productId: null, photos: [], uploading: false, categorySuggestion: null, suggestTimer: null };
    resetModalDocument();
  }

  function openCustomerModal() {
    openModal({
      title: "Add Customer",
      subtitle: "Create a customer account for sales, quotations and invoices.",
      body: '<form id="modalForm" data-kind="customer" class="form-grid two"><label><span>Customer Name</span><input name="name" required /></label><label><span>Phone</span><input name="phone" /></label><label><span>Email</span><input name="email" type="email" /></label><label><span>Company</span><input name="company" /></label><label class="form-span-2"><span>Address</span><textarea name="address"></textarea></label><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Save Customer</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
    });
  }

  async function openProductModal(productId) {
    try {
      const refs = state.cache.products || {};
      const product = productId ? await apiJson('/api/products/' + encodeURIComponent(productId)) : null;
      state.productWorkspace.editor.productId = product ? product.id : null;
      state.productWorkspace.editor.photos = (product && product.product_photos ? product.product_photos.slice() : []);
      state.productWorkspace.editor.uploading = false;
      state.productWorkspace.editor.categorySuggestion = null;
      if (state.productWorkspace.editor.suggestTimer) window.clearTimeout(state.productWorkspace.editor.suggestTimer);
      openModal({
        title: product ? 'Edit Product' : 'Add Product',
        subtitle: product ? 'Update catalog details, pricing, branch assignment and stock controls.' : 'Create a stock-tracked product with pricing, photos and branch assignment.',
        wide: true,
        body: renderProductEditorForm(product, refs)
      });
      bindProductPhotoDropzone();
      renderProductCategorySuggestion();
      const initialName = firstText(product && product.product_name, "");
      if (initialName) scheduleProductCategorizationSuggestion(initialName);
    } catch (error) {
      showToast(error.message || 'Unable to load the product editor.', 'error');
    }
  }

  function renderProductEditorForm(product, refs) {
    const categories = normalizeList(refs && refs.categories);
    const brands = normalizeList(refs && refs.brands);
    const suppliers = normalizeList(refs && refs.suppliers);
    const branches = normalizeList(refs && refs.branches);
    const photos = state.productWorkspace.editor.photos || [];
    return '<form id="productEditorForm" class="form-grid two inventory-editor-form">' +
      (product ? '<input type="hidden" name="product_id" value="' + escapeAttr(String(product.id)) + '" />' : '') +
      '<div class="form-span-2 inventory-photo-panel"><div class="section-head"><div><h4>Product Photos</h4><p>Drag and drop multiple product images, reorder later by removing and re-uploading.</p></div><button class="btn btn-outline" type="button" data-action="product-photo-pick"><i class="fa-solid fa-image"></i>Upload Photos</button></div>' +
      '<input id="productPhotoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple class="hidden" />' +
      '<div id="productPhotoDropzone" class="inventory-upload-dropzone"><i class="fa-solid fa-cloud-arrow-up"></i><strong>' + escapeHtml(state.productWorkspace.editor.uploading ? 'Uploading product photos…' : 'Drop product images here') + '</strong><p>PNG, JPG, WebP or SVG. Uploaded files are stored securely for the catalog.</p></div>' +
      '<div id="productPhotoPreviewGrid" class="inventory-photo-grid">' + renderProductEditorPhotoGrid(photos) + '</div></div>' +
      '<label><span>Product Name</span><input id="productNameInput" name="product_name" required value="' + escapeAttr(firstText(product && product.product_name, '')) + '" /></label>' +
      '<label><span>SKU</span><input name="product_code" value="' + escapeAttr(firstText(product && (product.sku || product.product_code), '')) + '" /></label>' +
      '<label><span>Barcode</span><input name="barcode" value="' + escapeAttr(firstText(product && product.barcode, '')) + '" /></label>' +
      '<label><span>Brand</span><select name="brand_id"><option value="">Select brand</option>' + brands.map(function (item) { return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(firstText(product && product.brand_id, '')) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.name, 'Brand')) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Category</span><select id="productCategorySelect" name="category_id"><option value="">Select category</option>' + categories.map(function (item) { return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(firstText(product && product.category_id, '')) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.name, 'Category')) + '</option>'; }).join('') + '</select></label>' +
      '<input type="hidden" id="productCategoryNameInput" name="category_name" value="" />' +
      '<div id="productCategorySuggestion" class="form-span-2"></div>' +
      '<div class="inventory-inline-label"><span>Category Management</span><button class="btn btn-outline" type="button" data-action="product-create-category"><i class="fa-solid fa-plus"></i>Create New Category</button></div>' +
      '<div class="inventory-checkbox"><span>Auto Categorization</span><label class="inventory-check inventory-check--box"><input type="checkbox" name="recategorize" value="1" /><span>Re-categorize this product automatically when saving</span></label></div>' +
      '<label><span>Buying Price</span><input type="number" min="0" step="0.01" name="cost_price" required value="' + escapeAttr(String(firstNumber(product && product.buying_price, product && product.cost_price, 0))) + '" /></label>' +
      '<label><span>Selling Price</span><input type="number" min="0" step="0.01" name="selling_price" required value="' + escapeAttr(String(firstNumber(product && product.selling_price, 0))) + '" /></label>' +
      '<label><span>Tax Rate (%)</span><input type="number" min="0" step="0.01" name="vat_rate" value="' + escapeAttr(String(firstNumber(product && product.vat_rate, 16))) + '" /></label>' +
      '<div class="inventory-checkbox"><span>Tax Settings</span><label class="inventory-check inventory-check--box"><input type="checkbox" name="tax_inclusive"' + ((product && product.tax_inclusive) ? ' checked' : '') + ' /><span>Prices are tax inclusive</span></label></div>' +
      '<label><span>Unit of Measure</span><input name="unit_of_measure" placeholder="pcs, box, meter" value="' + escapeAttr(firstText(product && (product.unit_of_measure || product.unit), '')) + '" /></label>' +
      '<label><span>Minimum Stock Level</span><input type="number" min="0" step="1" name="min_stock" value="' + escapeAttr(String(firstNumber(product && product.min_stock, 0))) + '" /></label>' +
      '<label><span>Supplier</span><select name="supplier_id"><option value="">Select supplier</option>' + suppliers.map(function (item) { return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(firstText(product && product.supplier_id, '')) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.supplier_name, item.name, 'Supplier')) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Branch Assignment</span><select name="branch_id"><option value="">Select branch</option>' + branches.map(function (item) { return '<option value="' + escapeAttr(String(item.id)) + '"' + (String(firstText(product && (product.branch_id || product.primary_branch_id), state.currentBranchId, '')) === String(item.id) ? ' selected' : '') + '>' + escapeHtml(firstText(item.name, item.branch_name, 'Branch')) + '</option>'; }).join('') + '</select></label>' +
      (product
        ? '<label><span>Current Stock</span><input type="number" min="0" step="1" name="current_stock" value="' + escapeAttr(String(firstNumber(product.current_stock, 0))) + '" /></label><label><span>Current Stock Adjustment</span><input type="number" step="1" name="stock_adjustment" value="0" /><small class="muted">Use positive or negative numbers to adjust the current count.</small></label>'
        : '<label><span>Opening Stock</span><input type="number" min="0" step="1" name="current_stock" value="' + escapeAttr(String(firstNumber(product && product.current_stock, 0))) + '" /></label><label><span>Current Stock Adjustment</span><input type="number" step="1" name="stock_adjustment" value="0" /><small class="muted">Optional extra adjustment applied after the opening stock.</small></label>') +
      '<label><span>Product Status</span><select name="status"><option value="active"' + (firstText(product && product.status, 'active') === 'active' ? ' selected' : '') + '>Active</option><option value="inactive"' + (firstText(product && product.status, 'active') === 'inactive' ? ' selected' : '') + '>Inactive</option></select></label>' +
      '<label><span>Primary Photo URL</span><input name="image_url" placeholder="Optional custom hero image URL" value="' + escapeAttr(firstText(product && product.image_url, (photos[0] || ''), '')) + '" /></label>' +
      '<label class="form-span-2"><span>Description</span><textarea name="description" rows="5">' + escapeHtml(firstText(product && product.description, '')) + '</textarea></label>' +
      '<label class="form-span-2"><span>Adjustment Reason</span><input name="adjustment_reason" placeholder="Required when changing stock materially" /></label>' +
      '<div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">' + escapeHtml(product ? 'Save Changes' : 'Create Product') + '</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div>' +
    '</form>';
  }

  function renderProductEditorPhotoGrid(photos) {
    if (!photos.length) return '<div class="empty-state inventory-empty-inline"><i class="fa-regular fa-image"></i>No product photos uploaded yet.</div>';
    return photos.map(function (photo) {
      return '<div class="inventory-photo-card">' + renderProductPhoto(photo, 'Product photo') + '<button class="btn btn-danger inventory-photo-remove" type="button" data-action="product-photo-remove" data-photo-path="' + escapeAttr(photo) + '"><i class="fa-solid fa-trash"></i>Remove</button></div>';
    }).join('');
  }

  function bindProductPhotoDropzone() {
    const zone = document.getElementById('productPhotoDropzone');
    const input = document.getElementById('productPhotoInput');
    if (!zone || !input || zone.dataset.bound) return;
    zone.dataset.bound = 'true';
    ['dragenter', 'dragover'].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) {
        event.preventDefault();
        zone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) {
        event.preventDefault();
        zone.classList.remove('is-dragover');
      });
    });
    zone.addEventListener('drop', function (event) {
      const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
      if (files.length) {
        handleProductPhotoFiles(files).catch(function (error) {
          showToast(error.message || 'Unable to upload product photos.', 'error');
        });
      }
    });
  }

  function openProductPhotoPicker() {
    const input = document.getElementById('productPhotoInput');
    if (input) input.click();
  }

  function removeProductPhoto(photoPath) {
    state.productWorkspace.editor.photos = (state.productWorkspace.editor.photos || []).filter(function (item) { return item !== photoPath; });
    const grid = document.getElementById('productPhotoPreviewGrid');
    if (grid) grid.innerHTML = renderProductEditorPhotoGrid(state.productWorkspace.editor.photos || []);
  }

  async function handleProductPhotoFiles(files) {
    if (!files || !files.length) return;
    state.productWorkspace.editor.uploading = true;
    const zone = document.getElementById('productPhotoDropzone');
    if (zone) zone.querySelector('strong').textContent = 'Uploading product photos…';
    for (const file of files) {
      const objectPath = await uploadInventoryFile(file);
      state.productWorkspace.editor.photos.push(objectPath);
    }
    state.productWorkspace.editor.uploading = false;
    if (zone) zone.querySelector('strong').textContent = 'Drop product images here';
    const grid = document.getElementById('productPhotoPreviewGrid');
    if (grid) grid.innerHTML = renderProductEditorPhotoGrid(state.productWorkspace.editor.photos || []);
    const input = document.getElementById('productPhotoInput');
    if (input) input.value = '';
  }

  async function uploadInventoryFile(file) {
    const upload = await apiJson('/api/storage/uploads/request-url', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        content_type: file.type || 'application/octet-stream'
      })
    });
    const response = await fetch(upload.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!response.ok) {
      let message = 'Upload failed.';
      try {
        const body = await response.json();
        message = firstText(body.error, body.message, message);
      } catch (_error) {}
      throw new Error(message);
    }
    return upload.object_path;
  }

  async function handleProductEditorSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const productId = form.elements.product_id ? form.elements.product_id.value : '';
    const payload = formToObject(form);
    payload.product_photos = (state.productWorkspace.editor.photos || []).slice();
    payload.tax_inclusive = !!(form.elements.tax_inclusive && form.elements.tax_inclusive.checked);
    payload.cost_price = Number(payload.cost_price || 0);
    payload.selling_price = Number(payload.selling_price || 0);
    payload.vat_rate = Number(payload.vat_rate || 0);
    payload.min_stock = payload.min_stock === undefined ? undefined : Number(payload.min_stock || 0);
    payload.current_stock = payload.current_stock === undefined ? undefined : Number(payload.current_stock || 0);
    payload.stock_adjustment = payload.stock_adjustment === undefined ? 0 : Number(payload.stock_adjustment || 0);
    if (form.elements.category_id && form.elements.category_id.value) {
      delete payload.category_name;
    } else {
      payload.category_name = firstText(payload.category_name, "");
      if (!payload.category_name) delete payload.category_name;
    }
    try {
      await apiJson(productId ? '/api/products/' + encodeURIComponent(productId) : '/api/products', {
        method: productId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      await Promise.all([loadProductsData(true), loadInventoryData(), loadSalesData()]);
      closeModal();
      renderCurrentRoute();
      showToast(productId ? 'Product updated.' : 'Product created.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to save product.', 'error');
    }
  }

  function renderProductCategorySuggestion() {
    const container = document.getElementById("productCategorySuggestion");
    if (!container) return;
    const suggestion = state.productWorkspace.editor.categorySuggestion;
    if (!suggestion || !suggestion.detected) {
      container.innerHTML = '<small class="muted">Start typing a product name to auto-detect a category suggestion.</small>';
      return;
    }
    container.innerHTML = '<div class="inline-message info">Suggested category: <strong>' + escapeHtml(firstText(suggestion.category_name, "Uncategorized")) + '</strong>' + (suggestion.rule_name ? ' <span class="muted">(' + escapeHtml(suggestion.rule_name) + ')</span>' : '') + ' <button class="btn btn-outline" type="button" data-action="product-accept-category-suggestion"><i class="fa-solid fa-check"></i>Accept</button></div>';
  }

  function applyDetectedProductCategory() {
    const suggestion = state.productWorkspace.editor.categorySuggestion;
    if (!suggestion || !suggestion.detected) return;
    const select = document.getElementById("productCategorySelect");
    const categoryNameInput = document.getElementById("productCategoryNameInput");
    if (select && suggestion.category_id && Array.from(select.options).some(function (option) { return String(option.value) === String(suggestion.category_id); })) {
      select.value = String(suggestion.category_id);
      if (categoryNameInput) categoryNameInput.value = "";
      showToast("Suggested category applied.", "success");
      return;
    }
    if (categoryNameInput) {
      categoryNameInput.value = firstText(suggestion.category_name, "");
      if (select) select.value = "";
      showToast("Category suggestion saved. It will be created on save if needed.", "success");
    }
  }

  function scheduleProductCategorizationSuggestion(productName) {
    const name = firstText(productName, "");
    if (state.productWorkspace.editor.suggestTimer) window.clearTimeout(state.productWorkspace.editor.suggestTimer);
    if (!name) {
      state.productWorkspace.editor.categorySuggestion = null;
      renderProductCategorySuggestion();
      return;
    }
    state.productWorkspace.editor.suggestTimer = window.setTimeout(async function () {
      try {
        const suggestion = await apiJson("/api/products/categorization/suggest?product_name=" + encodeURIComponent(name));
        state.productWorkspace.editor.categorySuggestion = suggestion && suggestion.detected ? suggestion : null;
      } catch (_error) {
        state.productWorkspace.editor.categorySuggestion = null;
      }
      renderProductCategorySuggestion();
    }, 220);
  }

  async function quickCreateCategoryFromEditor() {
    const name = window.prompt('Enter the new category name:');
    if (name === null) return;
    if (!String(name).trim()) {
      showToast('Category name is required.', 'error');
      return;
    }
    try {
      const category = await apiJson('/api/categories', { method: 'POST', body: JSON.stringify({ name: String(name).trim() }) });
      const latestCategories = await apiJson('/api/categories').catch(function () { return []; });
      if (!state.cache.products) state.cache.products = {};
      state.cache.products.categories = normalizeList(latestCategories);
      const select = document.getElementById('productCategorySelect');
      if (select) select.value = String(category.id);
      const categoryNameInput = document.getElementById("productCategoryNameInput");
      if (categoryNameInput) categoryNameInput.value = "";
      showToast('Category created.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to create category.', 'error');
    }
  }

  function renderCategoryManagementBody() {
    const categories = normalizeList((state.cache.products || {}).categories);
    return '<div class="inventory-category-manager">' +
      '<form id="categoryCreateForm" class="inventory-category-create"><input name="name" placeholder="Create a new category" required /><button class="btn btn-primary" type="submit"><i class="fa-solid fa-plus"></i>Create</button></form>' +
      (categories.length ? '<div class="data-table-wrap"><table class="data-table inventory-table"><thead><tr><th>Category</th><th>Products</th><th>Actions</th></tr></thead><tbody>' + categories.map(function (item) {
        return '<tr><td><strong>' + escapeHtml(firstText(item.name, 'Category')) + '</strong><div class="table-caption">Created ' + escapeHtml(formatDate(item.created_at)) + '</div></td><td>' + escapeHtml(numberText(firstNumber(item.product_count, 0))) + '</td><td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="category-rename" data-category-id="' + escapeAttr(String(item.id)) + '" data-category-name="' + escapeAttr(firstText(item.name, '')) + '"><i class="fa-solid fa-pen"></i>Rename</button><button class="btn btn-outline" type="button" data-action="category-merge" data-category-id="' + escapeAttr(String(item.id)) + '" data-category-name="' + escapeAttr(firstText(item.name, '')) + '"><i class="fa-solid fa-code-merge"></i>Merge</button><button class="btn btn-danger" type="button" data-action="category-delete" data-category-id="' + escapeAttr(String(item.id)) + '" data-category-name="' + escapeAttr(firstText(item.name, '')) + '"><i class="fa-solid fa-trash"></i>Delete</button></div></td></tr>';
      }).join('') + '</tbody></table></div>' : renderEmptyInline('No categories yet.')) +
      '</div>';
  }

  function openCategoryManagementModal() {
    openModal({
      title: 'Category Management',
      subtitle: 'Create, rename, merge or delete catalog categories.',
      wide: true,
      body: renderCategoryManagementBody()
    });
  }

  async function handleCategoryCreateSubmit(event) {
    event.preventDefault();
    const payload = formToObject(event.target);
    try {
      await apiJson('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
      const categories = await apiJson('/api/categories').catch(function () { return []; });
      if (!state.cache.products) state.cache.products = {};
      state.cache.products.categories = normalizeList(categories);
      openCategoryManagementModal();
      showToast('Category created.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to create category.', 'error');
    }
  }

  async function handleRenameCategory(categoryId, categoryName) {
    const name = window.prompt('Rename category:', categoryName || '');
    if (name === null) return;
    try {
      await apiJson('/api/categories/' + encodeURIComponent(categoryId), { method: 'PATCH', body: JSON.stringify({ name: String(name).trim() }) });
      const categories = await apiJson('/api/categories').catch(function () { return []; });
      state.cache.products.categories = normalizeList(categories);
      openCategoryManagementModal();
      showToast('Category renamed.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to rename category.', 'error');
    }
  }

  async function handleMergeCategory(categoryId, categoryName) {
    const target = window.prompt('Merge "' + (categoryName || 'category') + '" into which category? Enter the target name or category ID:');
    if (target === null) return;
    const trimmed = String(target).trim();
    if (!trimmed) {
      showToast('Target category is required.', 'error');
      return;
    }
    const payload = /^\d+$/.test(trimmed) ? { target_category_id: Number(trimmed) } : { target_name: trimmed };
    try {
      await apiJson('/api/categories/' + encodeURIComponent(categoryId) + '/merge', { method: 'POST', body: JSON.stringify(payload) });
      const categories = await apiJson('/api/categories').catch(function () { return []; });
      state.cache.products.categories = normalizeList(categories);
      await loadProductsData(true);
      openCategoryManagementModal();
      renderCurrentRoute();
      showToast('Category merged.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to merge category.', 'error');
    }
  }

  async function handleDeleteCategory(categoryId, categoryName) {
    if (!window.confirm('Delete category "' + (categoryName || categoryId) + '"? Products in this category will become uncategorised.')) return;
    try {
      await apiJson('/api/categories/' + encodeURIComponent(categoryId), { method: 'DELETE' });
      const categories = await apiJson('/api/categories').catch(function () { return []; });
      state.cache.products.categories = normalizeList(categories);
      await loadProductsData(true);
      openCategoryManagementModal();
      renderCurrentRoute();
      showToast('Category deleted.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to delete category.', 'error');
    }
  }

  async function openProductHistoryModal(productId) {
    try {
      const history = await apiJson('/api/products/' + encodeURIComponent(productId) + '/history');
      const product = ((state.cache.products || {}).products || []).find(function (item) { return String(item.id) === String(productId); }) || { product_name: 'Product #' + productId };
      openModal({
        title: 'Product History',
        subtitle: 'Audit trail and inventory movements for ' + firstText(product.product_name, 'this product') + '.',
        wide: true,
        body: '<div class="inventory-history-layout"><section class="card section-card"><div class="section-head"><div><h4>Audit Log</h4><p>Who changed this product and when.</p></div></div>' +
          ((history.audit || []).length ? '<div class="inventory-history-list">' + history.audit.map(function (entry) {
            return '<article class="inventory-history-item"><div class="inventory-history-item__head"><strong>' + escapeHtml(firstText(entry.action, 'product.updated').replace(/[_\.]+/g, ' ')) + '</strong><span>' + escapeHtml(formatDateTime(entry.created_at)) + '</span></div><p>' + escapeHtml(firstText(entry.description, 'Updated product')) + '</p><div class="table-caption">' + escapeHtml(firstText(entry.actor_name, 'System')) + ' · ' + escapeHtml(titleize(firstText(entry.actor_role, 'system'))) + '</div></article>';
          }).join('') + '</div>' : renderEmptyInline('No audit entries recorded yet.')) + '</section>' +
          '<section class="card section-card"><div class="section-head"><div><h4>Stock Movements</h4><p>Recent receiving and adjustment activity.</p></div></div>' + ((history.movements || []).length ? '<div class="data-table-wrap"><table class="data-table inventory-table"><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Branch</th><th>Reference</th></tr></thead><tbody>' + history.movements.map(function (entry) {
            return '<tr><td>' + escapeHtml(formatDateTime(entry.created_at)) + '</td><td>' + renderBadge(firstText(entry.type, 'adjustment')) + '</td><td>' + escapeHtml(numberText(firstNumber(entry.quantity, 0))) + '</td><td>' + escapeHtml(numberText(firstNumber(entry.quantity_before, 0))) + '</td><td>' + escapeHtml(numberText(firstNumber(entry.quantity_after, 0))) + '</td><td>' + escapeHtml(firstText(entry.branch_name, '—')) + '</td><td>' + escapeHtml(firstText(entry.reference, '—')) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : renderEmptyInline('No stock movements recorded yet.')) + '</section></div>'
      });
    } catch (error) {
      showToast(error.message || 'Unable to load product history.', 'error');
    }
  }

  async function openStockAdjustmentModal(productId) {
    try {
      const product = await apiJson('/api/products/' + encodeURIComponent(productId));
      openModal({
        title: 'Stock Adjustment',
        subtitle: 'Adjust current stock for ' + firstText(product.product_name, 'this product') + '.',
        body: '<form id="productAdjustForm" class="form-grid two"><input type="hidden" name="product_id" value="' + escapeAttr(String(product.id)) + '" /><label><span>Product</span><input value="' + escapeAttr(firstText(product.product_name, 'Product')) + '" disabled /></label><label><span>Current Stock</span><input value="' + escapeAttr(String(firstNumber(product.current_stock, 0))) + '" disabled /></label><label><span>Adjustment Quantity</span><input type="number" step="1" name="quantity" required placeholder="Use positive or negative numbers" /></label><label><span>Reason</span><input name="reason" required placeholder="Cycle count, damage, transfer correction..." /></label><label class="form-span-2"><span>Notes</span><textarea name="notes" rows="4"></textarea></label><div class="form-span-2 inline-group"><button class="btn btn-primary" type="submit">Save Adjustment</button><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button></div></form>'
      });
    } catch (error) {
      showToast(error.message || 'Unable to load stock adjustment form.', 'error');
    }
  }

  async function handleProductAdjustmentSubmit(event) {
    event.preventDefault();
    const payload = formToObject(event.target);
    payload.product_id = Number(payload.product_id || 0);
    payload.quantity = Number(payload.quantity || 0);
    try {
      await apiJson('/api/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) });
      await Promise.all([loadProductsData(true), loadInventoryData()]);
      closeModal();
      renderCurrentRoute();
      showToast('Stock adjusted.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to adjust stock.', 'error');
    }
  }

  async function handleDuplicateProduct(productId) {
    try {
      await apiJson('/api/products/' + encodeURIComponent(productId) + '/duplicate', { method: 'POST', body: JSON.stringify({}) });
      await loadProductsData(true);
      renderCurrentRoute();
      showToast('Product duplicated.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to duplicate product.', 'error');
    }
  }

  async function handleProductBulkAction() {
    const select = document.getElementById('productBulkAction');
    const action = select ? select.value : '';
    const ids = (state.productWorkspace.selectedIds || []).map(function (item) { return Number(item); }).filter(Boolean);
    if (!action) {
      showToast('Choose a bulk action first.', 'error');
      return;
    }
    if (!ids.length) {
      showToast('Select at least one product.', 'error');
      return;
    }
    try {
      if (action === 'generate-barcodes') {
        await apiJson('/api/products/generate-barcodes', { method: 'PATCH', body: JSON.stringify({ product_ids: ids }) });
      }
      if (action === 'archive') {
        const reason = window.prompt('Reason for archiving the selected products:');
        if (reason === null) return;
        for (const id of ids) await apiJson('/api/products/' + encodeURIComponent(id) + '/archive', { method: 'PATCH', body: JSON.stringify({ reason: reason }) });
      }
      if (action === 'restore') {
        for (const id of ids) await apiJson('/api/products/' + encodeURIComponent(id) + '/restore', { method: 'PATCH' });
      }
      if (action === 'delete') {
        const reason = window.prompt('Reason for permanently deleting the selected products:');
        if (reason === null) return;
        for (const id of ids) await apiJson('/api/products/' + encodeURIComponent(id), { method: 'DELETE', body: JSON.stringify({ reason: reason }) });
      }
      state.productWorkspace.selectedIds = [];
      await loadProductsData(true);
      renderCurrentRoute();
      showToast('Bulk action completed.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to complete the bulk action.', 'error');
    }
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
        const quotation = await apiJson("/api/quotations", { method: "POST", body: JSON.stringify(payload) });
        await loadQuotationsData();
        showToast("Quotation created.", "success");
        closeModal();
        renderCurrentRoute();
        if (quotation && quotation.id) openDocumentModal("quotation", quotation.id, "a4", "Quotation");
        return;
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
    const logoField = event.target.elements.logo_url;
    payload.logo_url = logoField ? String(logoField.value || "") : "";
    try {
      await apiJson("/api/settings/branding", { method: "PATCH", body: JSON.stringify(payload) });
      await Promise.all([loadBranding(), loadSettingsData()]);
      showToast("Branding saved.", "success");
      renderCurrentRoute();
    } catch (error) {
      showToast(error.message || "Unable to save branding.", "error");
    }
  }

  async function handleSettingsPaymentSubmit(event) {
    event.preventDefault();
    const payload = formToObject(event.target);
    try {
      await apiJson("/api/settings/payment", { method: "PATCH", body: JSON.stringify(payload) });
      await loadSettingsData();
      showToast("Payment details saved.", "success");
    } catch (error) {
      showToast(error.message || "Unable to save payment details.", "error");
    }
  }

  function clearCategorizationRuleForm() {
    const form = document.getElementById("settingsCategorizationForm");
    if (!form) return;
    form.reset();
    if (form.elements.is_enabled) form.elements.is_enabled.checked = true;
    if (form.elements.priority) form.elements.priority.value = "100";
    if (form.elements.rule_id) form.elements.rule_id.value = "";
  }

  async function handleSettingsCategorizationSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const payload = formToObject(form);
    payload.is_enabled = !!(form.elements.is_enabled && form.elements.is_enabled.checked);
    payload.priority = Number(payload.priority || 100);
    payload.keywords = firstText(payload.keywords, "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
    const ruleId = firstText(payload.rule_id, "");
    delete payload.rule_id;
    try {
      await apiJson(ruleId ? "/api/settings/product-categorization-rules/" + encodeURIComponent(ruleId) : "/api/settings/product-categorization-rules", {
        method: ruleId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      await loadSettingsData();
      renderCurrentRoute();
      clearCategorizationRuleForm();
      showToast(ruleId ? "Categorization rule updated." : "Categorization rule created.", "success");
    } catch (error) {
      showToast(error.message || "Unable to save categorization rule.", "error");
    }
  }

  async function deleteCategorizationRule(ruleId) {
    if (!ruleId) return;
    if (!window.confirm("Delete this categorization rule?")) return;
    try {
      await apiJson("/api/settings/product-categorization-rules/" + encodeURIComponent(ruleId), { method: "DELETE" });
      await loadSettingsData();
      renderCurrentRoute();
      clearCategorizationRuleForm();
      showToast("Categorization rule deleted.", "success");
    } catch (error) {
      showToast(error.message || "Unable to delete categorization rule.", "error");
    }
  }

  async function toggleCategorizationRule(ruleId, currentlyEnabled) {
    if (!ruleId) return;
    try {
      await apiJson("/api/settings/product-categorization-rules/" + encodeURIComponent(ruleId), {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: !currentlyEnabled })
      });
      await loadSettingsData();
      renderCurrentRoute();
      showToast("Categorization rule updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to update categorization rule.", "error");
    }
  }

  async function moveCategorizationRule(ruleId, delta) {
    const rules = normalizeList((state.cache.settings || {}).categorizationRules);
    const index = rules.findIndex(function (item) { return String(item.id) === String(ruleId); });
    if (index === -1) return;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= rules.length) return;
    const reordered = rules.slice();
    const removed = reordered.splice(index, 1)[0];
    reordered.splice(targetIndex, 0, removed);
    try {
      await apiJson("/api/settings/product-categorization-rules/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: reordered.map(function (item) { return item.id; }) })
      });
      await loadSettingsData();
      renderCurrentRoute();
      showToast("Rule priority updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to reorder rules.", "error");
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
    const parseResponseBody = async function () {
      if (res.status === 204) return null;
      const text = await res.text();
      if (!text) return null;
      const contentType = firstText(res.headers.get("Content-Type"), "").toLowerCase();
      if (contentType.indexOf("application/json") >= 0 || contentType.indexOf("+json") >= 0) {
        try {
          return JSON.parse(text);
        } catch (_error) {
          throw new Error("Server returned invalid JSON.");
        }
      }
      return { message: text };
    };
    if (!res.ok) {
      const errorBody = await parseResponseBody().catch(function () { return {}; });
      if (res.status === 401 && !skipAuthRedirect) {
        clearSession();
        showLogin();
      }
      throw new Error(firstText(errorBody.error, errorBody.message, res.statusText, 'Request failed'));
    }
    return await parseResponseBody();
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

  function buildDocumentPreviewEndpoint(type, id, paper) {
    return "/api/documents/" + encodeURIComponent(documentType(type)) + "/" + encodeURIComponent(id) + "/preview?paper=" + encodeURIComponent(paper || defaultDocumentPaper(type));
  }

  async function fetchDocumentPreviewHtml(type, id, paper) {
    const url = buildDocumentPreviewEndpoint(type, id, paper);
    const res = await authorizedFetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      clearSession();
      showLogin();
      throw new Error('Your session expired. Please sign in again.');
    }
    const body = await res.json().catch(function () { return null; });
    if (!res.ok) {
      throw new Error(firstText(body && body.error, body && body.message, res.statusText, 'Unable to build document preview'));
    }
    if (!body || typeof body.html !== 'string' || !body.html.trim()) {
      throw new Error('The server returned an empty document preview.');
    }
    return body.html;
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
    appendBranchScopeHeader(headers);
    if (shouldUseJsonContentType(next.body) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(url, Object.assign({}, next, { headers: headers }));
  }

  function authorizedFetch(url, options) {
    const next = options || {};
    const headers = new Headers(next.headers || {});
    if (state.token) headers.set('Authorization', 'Bearer ' + state.token);
    appendBranchScopeHeader(headers);
    if (shouldUseJsonContentType(next.body) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(url, Object.assign({}, next, { headers: headers }));
  }

  function appendBranchScopeHeader(headers) {
    if (headers.has("x-branch-id")) return;
    const raw = firstText(state.currentBranchId, "");
    if (!raw || raw === "all") return;
    const branchId = parseInt(raw, 10);
    if (Number.isInteger(branchId) && branchId > 0) headers.set("x-branch-id", String(branchId));
  }

  function shouldUseJsonContentType(body) {
    if (body == null) return false;
    if (typeof FormData !== "undefined" && body instanceof FormData) return false;
    if (typeof Blob !== "undefined" && body instanceof Blob) return false;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
    if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) return false;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(body)) return false;
    return true;
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

  function normalizeHexColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(text)) return text.charAt(0) === "#" ? text : "#" + text;
    return fallback;
  }

  function resolveBrandAssetUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.indexOf("/objects/") === 0) return "/api/storage/objects/" + encodeURIComponent(raw.slice("/objects/".length)).replace(/%2F/g, "/");
    if (raw.indexOf("/api/storage/objects/") === 0) return raw;
    return "";
  }

  function resolveInventoryAssetUrl(value) {
    return resolveBrandAssetUrl(value) || sanitizeUrl(value);
  }

  function brandingInitials(name) {
    const text = String(firstText(name, "UniquePOS")).trim();
    const parts = text.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map(function (part) { return part.charAt(0).toUpperCase(); }).join("");
    return initials || "UP";
  }

  function buildBrandPlaceholder(branding) {
    const primary = normalizeHexColor(firstText(branding && (branding.primary_color || branding.primaryColor), "#083d6d"), "#083d6d");
    const secondary = normalizeHexColor(firstText(branding && (branding.secondary_color || branding.secondaryColor), "#f7931e"), "#f7931e");
    const label = escapeHtml(brandingInitials(branding && (branding.business_name || branding.businessName)));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="' + primary + '"/><stop offset="100%" stop-color="' + secondary + '"/></linearGradient></defs><rect width="160" height="160" rx="28" fill="url(#g)"/><text x="80" y="94" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff">' + label + '</text></svg>';
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function buildBrandLogoUrl(branding) {
    return resolveBrandAssetUrl(firstText(branding && branding.logo_url, branding && branding.logoUrl, ""));
  }

  function buildBrandLogoSrc(branding) {
    return buildBrandLogoUrl(branding) || buildBrandPlaceholder(branding || state.branding || {});
  }

  function applyBrandTheme(branding) {
    const root = document.documentElement;
    const primary = normalizeHexColor(firstText(branding && (branding.primary_color || branding.primaryColor), "#083d6d"), "#083d6d");
    const secondary = normalizeHexColor(firstText(branding && (branding.secondary_color || branding.secondaryColor), "#f7931e"), "#f7931e");
    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--blue", primary);
    root.style.setProperty("--blue-soft", primary);
    root.style.setProperty("--orange", secondary);
    root.style.setProperty("--orange-dark", secondary);
  }

  function applyBrandLogo(node, branding) {
    if (!node) return;
    const activeBranding = branding || state.branding || {};
    node.src = buildBrandLogoSrc(activeBranding);
    node.alt = firstText(activeBranding.business_name, activeBranding.businessName, "Company") + " logo";
    node.onerror = function () {
      node.onerror = null;
      node.src = buildBrandPlaceholder(activeBranding);
    };
  }

  function brandingLogoElements() {
    const form = document.getElementById("settingsBrandingForm");
    return {
      hidden: form ? form.elements.logo_url : null,
      preview: document.getElementById("brandingLogoPreview"),
      file: document.getElementById("brandingLogoFile"),
      status: document.getElementById("brandingLogoStatus")
    };
  }

  function setBrandingLogoStatus(message) {
    const elements = brandingLogoElements();
    if (elements.status) elements.status.textContent = message;
  }

  function syncBrandingLogoPreview() {
    const elements = brandingLogoElements();
    if (!elements.preview) return;
    const nextBranding = Object.assign({}, state.branding, {
      logo_url: elements.hidden ? elements.hidden.value : "",
      logoUrl: elements.hidden ? elements.hidden.value : ""
    });
    applyBrandLogo(elements.preview, nextBranding);
  }

  function bindBrandingUploadControls() {
    const uploadButton = document.getElementById("brandingLogoUploadBtn");
    const clearButton = document.getElementById("brandingLogoClearBtn");
    syncBrandingLogoPreview();
    if (uploadButton && !uploadButton.dataset.bound) {
      uploadButton.dataset.bound = "true";
      uploadButton.addEventListener("click", function () {
        uploadBrandingLogo().catch(function (error) {
          showToast(error && error.message ? error.message : "Unable to upload logo.", "error");
        });
      });
    }
    if (clearButton && !clearButton.dataset.bound) {
      clearButton.dataset.bound = "true";
      clearButton.addEventListener("click", function () {
        const elements = brandingLogoElements();
        if (elements.hidden) elements.hidden.value = "";
        if (elements.file) elements.file.value = "";
        syncBrandingLogoPreview();
        setBrandingLogoStatus("Placeholder selected. Save branding to remove the uploaded logo everywhere.");
      });
    }
  }

  async function uploadBrandingLogo() {
    const elements = brandingLogoElements();
    const file = elements.file && elements.file.files && elements.file.files[0];
    if (!file) throw new Error("Choose an image file first.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Logo image must be 2 MB or smaller.");
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/i.test(file.type || "")) throw new Error("Logo image must be PNG, JPG, WebP, or SVG.");
    setBrandingLogoStatus("Uploading logo…");
    const upload = await apiJson("/api/storage/uploads/request-url", {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        content_type: file.type || "application/octet-stream"
      })
    });
    const response = await fetch(upload.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!response.ok) {
      let message = "Upload failed.";
      try {
        const body = await response.json();
        message = firstText(body.error, body.message, message);
      } catch (_error) {}
      throw new Error(message);
    }
    if (elements.hidden) elements.hidden.value = upload.object_path;
    if (elements.file) elements.file.value = "";
    syncBrandingLogoPreview();
    setBrandingLogoStatus("Logo uploaded. Save branding to publish it across the POS.");
  }

  function clampMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // ─── Super Admin: Product actions ────────────────────────────────────────────

  async function handleArchiveProduct(productId, productName) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can archive products.", "error"); return; }
    const reason = window.prompt(
      'Archive "' + (productName || productId) + '"?\n\n' +
      'Archived products are hidden from product lists but remain available for historical records.\n\n' +
      'Enter a reason for archiving (required):'
    );
    if (reason === null) return; // cancelled
    if (!reason.trim()) { showToast("A reason is required to archive a product.", "error"); return; }
    try {
      await apiJson("/api/products/" + productId + "/archive", { method: "PATCH", body: JSON.stringify({ reason }) });
      showToast("Product archived successfully.", "success");
      await loadProductsData(true);
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to archive product.", "error");
    }
  }

  async function handleRestoreProduct(productId, productName) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can restore archived products.", "error"); return; }
    if (!window.confirm('Restore "' + (productName || productId) + '"?\n\nThis will make the product visible in product lists again.')) return;
    try {
      await apiJson("/api/products/" + productId + "/restore", { method: "PATCH" });
      showToast("Product restored successfully.", "success");
      await loadProductsData(true);
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to restore product.", "error");
    }
  }

  async function handleDeleteProduct(productId, productName) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can delete products.", "error"); return; }
    const reason = window.prompt(
      '⚠ PERMANENTLY DELETE "' + (productName || productId) + '"?\n\n' +
      'This action cannot be undone. Products with any sales history cannot be deleted — use Archive instead.\n\n' +
      'Type a reason to confirm permanent deletion:'
    );
    if (reason === null) return;
    if (!reason.trim()) { showToast("A reason is required to delete a product.", "error"); return; }
    if (!window.confirm('Final confirmation: permanently delete "' + (productName || productId) + '"? This cannot be undone.')) return;
    try {
      await apiJson("/api/products/" + productId, { method: "DELETE", body: JSON.stringify({ reason }) });
      showToast("Product permanently deleted.", "success");
      await loadProductsData(true);
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to delete product.", "error");
    }
  }

  // ─── Super Admin: Sale actions ────────────────────────────────────────────────

  async function handleVoidSale(saleId, receipt) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can void sales.", "error"); return; }
    const reason = window.prompt(
      '⚠ VOID Sale ' + (receipt || saleId) + '?\n\n' +
      'Voiding reverses stock movements and financial totals but preserves the original record.\n' +
      'This action cannot be undone.\n\n' +
      'Enter the reason for voiding:'
    );
    if (reason === null) return;
    if (!reason.trim()) { showToast("A reason is required to void a sale.", "error"); return; }
    if (!window.confirm('Final confirmation: void sale ' + (receipt || saleId) + '?\n\nStock will be reversed. This cannot be undone.')) return;
    try {
      await apiJson("/api/pos/sales/" + saleId + "/void", { method: "PATCH", body: JSON.stringify({ reason }) });
      showToast("Sale voided. Stock reversed.", "success");
      await loadSalesData();
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to void sale.", "error");
    }
  }

  async function handleDeleteDraftSale(saleId, receipt) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can delete draft sales.", "error"); return; }
    const reason = window.prompt(
      '⚠ DELETE Draft Sale ' + (receipt || saleId) + '?\n\n' +
      'Only draft/suspended transactions may be permanently deleted.\n\n' +
      'Enter a reason for deletion (required):'
    );
    if (reason === null) return;
    if (!reason.trim()) { showToast("A reason is required to delete a sale.", "error"); return; }
    if (!window.confirm('Final confirmation: permanently delete draft sale ' + (receipt || saleId) + '?')) return;
    try {
      await apiJson("/api/pos/sales/" + saleId, { method: "DELETE", body: JSON.stringify({ reason }) });
      showToast("Draft sale deleted.", "success");
      await loadSalesData();
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to delete sale.", "error");
    }
  }

  async function handleReturnSale(saleId, receipt) {
    if (!isSuperAdmin()) { showToast("Only Super Admin can process returns.", "error"); return; }
    // Fetch full sale details to show items
    let sale;
    try {
      sale = await apiJson("/api/pos/sales/" + saleId);
    } catch (err) {
      showToast("Unable to load sale details.", "error");
      return;
    }
    if (!sale || !sale.items || !sale.items.length) {
      showToast("Sale has no items to return.", "error");
      return;
    }
    const reason = window.prompt(
      'Process Return for Sale ' + (receipt || saleId) + '?\n\n' +
      'This creates a new return transaction linked to the original sale and reverses stock for returned items.\n\n' +
      'Enter the reason for this return:'
    );
    if (reason === null) return;
    if (!reason.trim()) { showToast("A reason is required to process a return.", "error"); return; }
    // Return all items from original sale (full return)
    const returnItems = sale.items.map(function (item) {
      return { product_id: item.product_id, quantity: item.quantity };
    });
    if (!window.confirm('Process full return for sale ' + (receipt || saleId) + '?\n\n' + returnItems.length + ' item(s) will be returned and stock reversed.')) return;
    try {
      const returnSale = await apiJson("/api/pos/sales/" + saleId + "/return", {
        method: "POST",
        body: JSON.stringify({ reason, items: returnItems })
      });
      showToast("Return processed. Receipt: " + (returnSale.receipt_number || "—"), "success");
      await loadSalesData();
      renderCurrentRoute();
    } catch (err) {
      showToast(err.message || "Unable to process return.", "error");
    }
  }

})();
