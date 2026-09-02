(function () {
  "use strict";

  // Compatibility bridge: every same-origin API request carries the active token
  // and selected branch scope.
  var previousFetch = window.fetch.bind(window);
  var TOKEN_KEY = "uniquepos.token";

  function headersFor(input, init) {
    var headers = new Headers();
    try {
      if (input && input.headers) new Headers(input.headers).forEach(function (v, k) { headers.set(k, v); });
    } catch (_) {}
    try {
      if (init && init.headers) new Headers(init.headers).forEach(function (v, k) { headers.set(k, v); });
    } catch (_) {}

    var token = localStorage.getItem(TOKEN_KEY) || "";
    if (token && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);

    var branch = document.getElementById("branchSelect");
    var branchId = branch && branch.value ? String(branch.value) : "";
    if (branchId && branchId !== "all" && !headers.has("x-branch-id")) {
      var numeric = parseInt(branchId, 10);
      if (Number.isInteger(numeric) && numeric > 0) headers.set("x-branch-id", String(numeric));
    }
    return headers;
  }

  window.fetch = function (input, init) {
    var options = Object.assign({}, init || {});
    options.headers = headersFor(input, init);
    return previousFetch(input, options);
  };

  // Repair a historical markup/runtime mismatch: app.js requires #password but
  // some deployed index.html versions omitted the field. Insert it before the
  // application initializes so authentication receives both credentials.
  function repairLoginMarkup() {
    var form = document.getElementById("loginForm");
    if (!form || document.getElementById("password")) return;
    var submit = document.getElementById("submitBtn");
    var label = document.createElement("label");
    var caption = document.createElement("span");
    var input = document.createElement("input");
    caption.textContent = "Password";
    input.id = "password";
    input.name = "password";
    input.type = "password";
    input.autocomplete = "current-password";
    input.required = true;
    label.appendChild(caption);
    label.appendChild(input);
    form.insertBefore(label, submit || null);

    // Prevent the login viewport from inheriting a stale horizontal scroll
    // position or allowing oversized content to clip the hero.
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
    window.scrollTo(0, 0);
  }

  repairLoginMarkup();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", repairLoginMarkup, { once: true });
  }
})();
