(function () {
  "use strict";

  var previousFetch = window.fetch.bind(window);
  var TOKEN_KEY = "uniquepos.token";

  function headersFor(input, init) {
    var headers = new Headers();
    try { if (input && input.headers) new Headers(input.headers).forEach(function (v, k) { headers.set(k, v); }); } catch (_) {}
    try { if (init && init.headers) new Headers(init.headers).forEach(function (v, k) { headers.set(k, v); }); } catch (_) {}
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

  function repairLoginMarkup() {
    var form = document.getElementById("loginForm");
    if (!form) return false;
    if (!document.getElementById("password")) {
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
    }
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
    return !!document.getElementById("password");
  }

  repairLoginMarkup();
  document.addEventListener("DOMContentLoaded", repairLoginMarkup);
  var attempts = 0;
  var timer = setInterval(function () {
    attempts += 1;
    if (repairLoginMarkup() || attempts >= 20) clearInterval(timer);
  }, 100);
})();
