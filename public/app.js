(function () {
  const TOKEN_STORAGE_KEY = "uniquepos.token";
  const USER_STORAGE_KEY = "uniquepos.user";

  const MODULE_TITLES = {
    dashboard:  "Dashboard",
    products:   "Products",
    inventory:  "Inventory",
    sales:      "Sales",
    customers:  "Customers",
    suppliers:  "Suppliers",
    purchases:  "Purchases",
    reports:    "Reports",
    users:      "Users",
    settings:   "Settings",
    branches:   "Branches"
  };

  const state = {
    token: readStoredToken(),
    user: readStoredUser(),
    dashboardStats: null,
    activeModule: "dashboard"
  };

  // Login-screen elements
  const login = {
    shell:     document.getElementById("loginShell"),
    apiStatus: document.getElementById("apiStatus"),
    brandName: document.getElementById("brandName"),
    brandSummary: document.getElementById("brandSummary"),
    card:      document.getElementById("loginCard"),
    form:      document.getElementById("loginForm"),
    email:     document.getElementById("email"),
    password:  document.getElementById("password"),
    totpWrap:  document.getElementById("totpWrap"),
    totp:      document.getElementById("totp"),
    submitBtn: document.getElementById("submitBtn"),
    message:   document.getElementById("message")
  };

  // POS shell elements
  const pos = {
    shell:       document.getElementById("posShell"),
    navBrand:    document.getElementById("posNavBrand"),
    navUser:     document.getElementById("posNavUser"),
    moduleTitle: document.getElementById("posModuleTitle"),
    signOutBtn:  document.getElementById("posSignOutBtn"),
    menuToggle:  document.getElementById("posMenuToggle"),
    nav:         document.getElementById("posNav"),
    statTodaySales:    document.getElementById("statTodaySalesVal"),
    statMonthlySales:  document.getElementById("statMonthlySalesVal"),
    statGrossProfit:   document.getElementById("statGrossProfitVal"),
    statLowStock:      document.getElementById("statLowStockVal")
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

  /* ── Event binding ─────────────────────────────────────────────────── */

  function bindLoginEvents() {
    login.form.addEventListener("submit", onLogin);
  }

  function bindPosEvents() {
    pos.signOutBtn.addEventListener("click", signOut);
    pos.menuToggle.addEventListener("click", function () {
      pos.nav.classList.toggle("open");
    });

    // Close nav overlay when clicking outside on mobile
    document.addEventListener("click", function (e) {
      if (
        pos.nav.classList.contains("open") &&
        !pos.nav.contains(e.target) &&
        e.target !== pos.menuToggle
      ) {
        pos.nav.classList.remove("open");
      }
    });

    // Module navigation buttons
    document.querySelectorAll(".pos-nav__item[data-module]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchModule(btn.dataset.module);
        pos.nav.classList.remove("open");
      });
    });
  }

  /* ── Health & branding ─────────────────────────────────────────────── */

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
      const res = await fetch("/api/settings/branding");
      if (!res.ok) return;
      const branding = await res.json();
      const brandName = firstText(branding.business_name, branding.businessName, "UniquePOS");
      const summary = firstText(
        branding.tagline,
        branding.description,
        "Sign in to access your POS workspace, or confirm the service is online before finishing setup."
      );
      document.title = brandName;
      login.brandName.textContent = brandName;
      login.brandSummary.textContent = summary;
      pos.navBrand.textContent = brandName;
    } catch (_error) {}
  }

  /* ── Auth ──────────────────────────────────────────────────────────── */

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
      setMessage("error", "Email and password are required.");
      resetSubmit();
      return;
    }
    if (!login.totpWrap.classList.contains("hidden")) {
      payload.totp_code = login.totp.value.trim();
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.error || "Sign-in failed");
      }
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
    } catch (error) {
      console.warn("[auth] Logout request failed; clearing local session anyway.", error);
    }
    clearSession();
    state.dashboardStats = null;
    login.form.reset();
    login.totpWrap.classList.add("hidden");
    showLoginRoute();
    setMessage("success", "Signed out.");
  }

  /* ── Routing ───────────────────────────────────────────────────────── */

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
    await loadDashboard();
    showPosRoute();
  }

  function showLoginRoute() {
    pos.shell.classList.add("hidden");
    login.shell.classList.remove("hidden");
  }

  function showPosRoute() {
    login.shell.classList.add("hidden");
    pos.shell.classList.remove("hidden");
    renderPosUser();
    renderDashboardStats();
    switchModule("dashboard");
  }

  /* ── POS navigation ────────────────────────────────────────────────── */

  function switchModule(name) {
    if (!MODULE_TITLES[name]) return;
    state.activeModule = name;

    // Update header title
    pos.moduleTitle.textContent = MODULE_TITLES[name];

    // Toggle nav button active state
    document.querySelectorAll(".pos-nav__item[data-module]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.module === name);
    });

    // Show/hide module panels
    document.querySelectorAll(".pos-module").forEach(function (section) {
      section.classList.toggle("active", section.id === "mod-" + name);
    });
  }

  /* ── Dashboard data ────────────────────────────────────────────────── */

  async function loadDashboard() {
    try {
      const res = await authorizedFetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Unable to load dashboard data.");
      state.dashboardStats = await res.json();
    } catch (_error) {
      state.dashboardStats = null;
    }
  }

  function renderDashboardStats() {
    const stats = state.dashboardStats || {};
    pos.statTodaySales.textContent   = formatNumber(stats.today_sales);
    pos.statMonthlySales.textContent = formatNumber(stats.monthly_sales);
    pos.statGrossProfit.textContent  = formatNumber(stats.gross_profit);
    pos.statLowStock.textContent     = formatNumber(stats.low_stock_count);
  }

  function renderPosUser() {
    const user = state.user;
    if (!user || !pos.navUser) return;
    pos.navUser.textContent = firstText(user.name, user.email, "");
  }

  /* ── Session helpers ───────────────────────────────────────────────── */

  async function syncSessionFromToken() {
    if (!state.token) {
      state.user = null;
      clearStoredUser();
      return;
    }
    try {
      const res = await authorizedFetch("/api/auth/me");
      if (!res.ok) throw new Error("Unauthorized");
      state.user = await res.json();
      persistSession(state.token, state.user);
    } catch (_error) {
      clearSession();
    }
  }

  async function authorizedFetch(url, options) {
    const nextOptions = options || {};
    const headers = new Headers(nextOptions.headers || {});
    if (state.token) {
      headers.set("Authorization", "Bearer " + state.token);
    }
    if (nextOptions.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, Object.assign({}, nextOptions, { headers }));
  }

  function persistSession(token, user) {
    state.token = token || "";
    state.user  = user  || null;
    if (state.token) localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
    if (state.user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(state.user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  }

  function clearSession() {
    state.token = "";
    state.user  = null;
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

  /* ── UI helpers ────────────────────────────────────────────────────── */

  function setMessage(type, text) {
    login.message.className = "message";
    if (!text) {
      login.message.classList.add("hidden");
      login.message.textContent = "";
      return;
    }
    login.message.classList.add(type);
    login.message.textContent = text;
  }

  function resetSubmit(label) {
    login.submitBtn.disabled = false;
    login.submitBtn.textContent = label || "Sign in";
  }

  function firstText() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return "";
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  }
})();
