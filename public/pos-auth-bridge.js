(function () {
  "use strict";

  // Runs after the Counter compatibility layer and before app.js initializes.
  // It guarantees that every same-origin API request made by the POS carries
  // the current login token and selected branch scope. This is intentionally
  // small: it does not own POS state or sales logic.
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
})();
