(function () {
  const TOKEN_STORAGE_KEY = "uniquepos.token";
  const USER_STORAGE_KEY = "uniquepos.user";
  const ROLE_DASHBOARD_PATHS = {
    super_admin: "/dashboard",
    administrator: "/dashboard",
    manager: "/dashboard",
    storekeeper: "/dashboard",
    sales_cashier: "/pos"
  };
  const state = {
    token: readStoredToken(),
    user: readStoredUser(),
    dashboardStats: null
  };

  const els = {
    apiStatus: document.getElementById("apiStatus"),
    brandName: document.getElementById("brandName"),
    brandSummary: document.getElementById("brandSummary"),
    loginCard: document.getElementById("loginCard"),
    loginForm: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    totpWrap: document.getElementById("totpWrap"),
    totp: document.getElementById("totp"),
    submitBtn: document.getElementById("submitBtn"),
    message: document.getElementById("message"),
    accountCard: document.getElementById("accountCard"),
    dashboardTitle: document.getElementById("dashboardTitle"),
    accountDetails: document.getElementById("accountDetails"),
    dashboardStats: document.getElementById("dashboardStats"),
    copyTokenBtn: document.getElementById("copyTokenBtn"),
    signOutBtn: document.getElementById("signOutBtn")
  };

  boot();

  async function boot() {
    bindEvents();
    const hadStoredToken = Boolean(state.token);
    await Promise.all([loadHealth(), loadBranding()]);
    await syncSessionFromToken();
    await routeAfterAuthChange({ showExpiredMessage: hadStoredToken });
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", onLogin);
    els.copyTokenBtn.addEventListener("click", copyToken);
    els.signOutBtn.addEventListener("click", signOut);
  }

  async function loadHealth() {
    try {
      const res = await fetch("/api/healthz");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        els.apiStatus.textContent = "Service is online.";
        els.apiStatus.style.borderColor = "rgba(34, 197, 94, 0.4)";
      } else {
        throw new Error("Unexpected health response");
      }
    } catch (_error) {
      els.apiStatus.textContent = "Service is not responding yet. Confirm Railway variables and database setup.";
      els.apiStatus.style.borderColor = "rgba(248, 113, 113, 0.35)";
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
      els.brandName.textContent = brandName;
      els.brandSummary.textContent = summary;
    } catch (_error) {
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    setMessage("", "");
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = "Signing in…";

    const payload = {
      email: els.email.value.trim(),
      password: els.password.value
    };
    if (!payload.email || !payload.password) {
      setMessage("error", "Email and password are required.");
      resetSubmit();
      return;
    }
    if (!els.totpWrap.classList.contains("hidden")) {
      payload.totp_code = els.totp.value.trim();
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
        els.totpWrap.classList.remove("hidden");
        setMessage("success", "Enter your authentication code to finish signing in.");
        resetSubmit("Verify code");
        return;
      }
      if (!data.token || !data.user) {
        throw new Error("Login succeeded but no session token was returned.");
      }

      persistSession(data.token, data.user);
      els.loginForm.reset();
      els.totpWrap.classList.add("hidden");
      setMessage("", "");
      await routeAfterAuthChange();
    } catch (error) {
      setMessage("error", error.message || "Unable to sign in.");
    } finally {
      resetSubmit();
    }
  }

  async function routeAfterAuthChange(options) {
    const showExpiredMessage = options && options.showExpiredMessage;
    const user = state.user;
    const isAuthenticated = Boolean(state.token && user);
    if (!isAuthenticated) {
      showLoginRoute();
      if (showExpiredMessage) {
        setMessage("error", "Your session has expired. Please sign in again.");
      }
      return;
    }
    const navigating = redirectToDashboardForRole(user.role);
    if (navigating) {
      return;
    }
    await loadDashboard();
    renderSession();
  }

  function renderSession() {
    const user = state.user;
    els.loginCard.classList.add("hidden");
    els.accountCard.classList.remove("hidden");
    if (els.dashboardTitle) {
      els.dashboardTitle.textContent = "Dashboard • " + roleLabel(user.role);
    }
    els.accountDetails.innerHTML = [
      detail("Name", user.name),
      detail("Email", user.email),
      detail("Role", formatValue(user.role)),
      detail("Branch", firstText(user.branch && user.branch.name, user.branch && user.branch.branch_name, user.branch_id, "Not assigned"))
    ].join("");
    renderDashboardStats();
  }

  function showLoginRoute() {
    if (!isLoginPath()) {
      window.history.replaceState({}, "", "/");
    }
    els.loginCard.classList.remove("hidden");
    els.accountCard.classList.add("hidden");
    if (els.dashboardStats) {
      els.dashboardStats.classList.add("hidden");
    }
  }

  function redirectToDashboardForRole(role) {
    const targetPath = getDashboardPathForRole(role);
    if (window.location.pathname !== targetPath) {
      window.location.assign(targetPath);
      return true;
    }
    return false;
  }

  function getDashboardPathForRole(role) {
    const normalized = String(role || "").toLowerCase();
    return ROLE_DASHBOARD_PATHS[normalized] || "/dashboard";
  }

  function isLoginPath() {
    return window.location.pathname === "/" || window.location.pathname === "/index.html";
  }

  async function loadDashboard() {
    try {
      const res = await authorizedFetch("/api/dashboard/stats");
      if (!res.ok) {
        throw new Error("Unable to load dashboard data.");
      }
      state.dashboardStats = await res.json();
    } catch (error) {
      state.dashboardStats = null;
      setMessage("error", error.message || "Unable to load dashboard.");
    }
  }

  function renderDashboardStats() {
    if (!els.dashboardStats) return;
    if (!state.dashboardStats) {
      els.dashboardStats.classList.add("hidden");
      els.dashboardStats.innerHTML = "";
      return;
    }
    const stats = state.dashboardStats;
    els.dashboardStats.innerHTML = [
      detail("Today Sales", formatNumber(stats.today_sales)),
      detail("Monthly Sales", formatNumber(stats.monthly_sales)),
      detail("Gross Profit", formatNumber(stats.gross_profit)),
      detail("Low Stock Count", formatNumber(stats.low_stock_count))
    ].join("");
    els.dashboardStats.classList.remove("hidden");
  }

  async function copyToken() {
    if (!state.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      setMessage("success", "Session token copied.");
    } catch (_error) {
      setMessage("error", "Could not copy the token from this browser.");
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
    els.loginForm.reset();
    els.totpWrap.classList.add("hidden");
    showLoginRoute();
    setMessage("success", "Signed out.");
  }

  function setMessage(type, text) {
    els.message.className = "message";
    if (!text) {
      els.message.classList.add("hidden");
      els.message.textContent = "";
      return;
    }
    els.message.classList.add(type);
    els.message.textContent = text;
  }

  function resetSubmit(label) {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = label || "Sign in";
  }

  function detail(label, value) {
    return "<div><strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(formatValue(value)) + "</div>";
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value).replace(/_/g, " ");
  }

  function firstText() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return "";
  }

  function roleLabel(role) {
    return formatValue(role || "user");
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString();
  }

  async function syncSessionFromToken() {
    if (!state.token) {
      state.user = null;
      clearStoredUsers();
      return;
    }
    try {
      const res = await authorizedFetch("/api/auth/me");
      if (!res.ok) {
        throw new Error("Unauthorized");
      }
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
    clearStoredUsers();
  }

  function clearStoredUsers() {
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
