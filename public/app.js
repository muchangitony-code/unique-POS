(function () {
  const state = {
    token: localStorage.getItem("uniquepos.token") || "",
    user: readStoredJson("uniquepos.user")
  };

  const els = {
    apiStatus: document.getElementById("apiStatus"),
    brandName: document.getElementById("brandName"),
    brandSummary: document.getElementById("brandSummary"),
    loginForm: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    totpWrap: document.getElementById("totpWrap"),
    totp: document.getElementById("totp"),
    submitBtn: document.getElementById("submitBtn"),
    message: document.getElementById("message"),
    accountCard: document.getElementById("accountCard"),
    accountDetails: document.getElementById("accountDetails"),
    copyTokenBtn: document.getElementById("copyTokenBtn"),
    signOutBtn: document.getElementById("signOutBtn")
  };

  boot();

  async function boot() {
    bindEvents();
    renderSession();
    await Promise.all([loadHealth(), loadBranding()]);
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

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("uniquepos.token", state.token);
      localStorage.setItem("uniquepos.user", JSON.stringify(state.user));
      els.loginForm.reset();
      els.totpWrap.classList.add("hidden");
      setMessage("success", "Signed in successfully.");
      renderSession();
    } catch (error) {
      setMessage("error", error.message || "Unable to sign in.");
    } finally {
      resetSubmit();
    }
  }

  function renderSession() {
    const user = state.user;
    if (!state.token || !user) {
      els.accountCard.classList.add("hidden");
      return;
    }
    els.accountCard.classList.remove("hidden");
    els.accountDetails.innerHTML = [
      detail("Name", user.name),
      detail("Email", user.email),
      detail("Role", formatValue(user.role)),
      detail("Branch", firstText(user.branch && user.branch.name, user.branch && user.branch.branch_name, user.branch_id, "Not assigned"))
    ].join("");
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

  function signOut() {
    state.token = "";
    state.user = null;
    localStorage.removeItem("uniquepos.token");
    localStorage.removeItem("uniquepos.user");
    els.loginForm.reset();
    els.totpWrap.classList.add("hidden");
    els.accountCard.classList.add("hidden");
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
