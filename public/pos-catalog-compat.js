(function () {
  "use strict";

  // Counter must consume the same live product catalogue as Inventory.
  // The main POS bundle historically requested only branch-scoped in-stock
  // rows and then applied a second, name-based category filter. That can hide
  // valid inventory when branch stock/category naming differs slightly.
  var originalFetch = window.fetch.bind(window);
  var categoryCache = null;

  var CATEGORY_ALIASES = {
    "solar panels": "Solar Panels",
    "solar panel": "Solar Panels",
    "pv panels": "Solar Panels",
    "pv panel": "Solar Panels",
    "photovoltaic panels": "Solar Panels",
    "inverters": "Inverters",
    "inverter": "Inverters",
    "batteries": "Batteries",
    "battery": "Batteries",
    "accessories": "Accessories",
    "accessory": "Accessories",
    "cables": "Cables",
    "cable": "Cables",
    "electricals": "Electricals",
    "electrical": "Electricals",
    "breakers": "Electricals",
    "breaker": "Electricals",
    "contactors": "Electricals",
    "isolators": "Electricals",
    "bulbs": "Electricals",
    "bulb": "Electricals",
    "lighting": "Electricals",
    "switches & sockets": "Electricals",
    "switches and sockets": "Electricals",
    "conduit": "Electricals",
    "plugs & adapters": "Electricals",
    "plugs and adapters": "Electricals",
    "fittings": "Electricals",
    "networking": "Electricals",
    "others": "Others"
  };

  function normalizedCategory(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "Others";
    return CATEGORY_ALIASES[raw.toLowerCase()] || raw;
  }

  function isProductsRequest(url) {
    try {
      return new URL(url, window.location.origin).pathname === "/api/products";
    } catch (_) {
      return false;
    }
  }

  function isCategoriesRequest(url) {
    try {
      return new URL(url, window.location.origin).pathname === "/api/categories";
    } catch (_) {
      return false;
    }
  }

  function cacheCategories(payload) {
    var rows = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.data) ? payload.data : []);
    var map = {};
    rows.forEach(function (row) {
      if (!row) return;
      var id = row.id != null ? String(row.id) : "";
      if (id) map[id] = normalizedCategory(row.name || row.category_name);
    });
    categoryCache = map;
  }

  async function getCategoryCache(init) {
    if (categoryCache) return categoryCache;
    try {
      var response = await originalFetch("/api/categories", init || {});
      if (response.ok) {
        var payload = await response.clone().json();
        cacheCategories(payload);
      }
    } catch (_) {
      categoryCache = {};
    }
    return categoryCache || {};
  }

  function rewriteProductsPayload(payload, categories) {
    if (!payload || !Array.isArray(payload.data)) return payload;
    payload.data = payload.data.map(function (product) {
      var row = Object.assign({}, product);
      var category = row.category_name || row.category;
      if (!category && row.category_id != null && categories[String(row.category_id)]) {
        category = categories[String(row.category_id)];
      }
      row.category_name = normalizedCategory(category);
      if (row.current_stock == null) {
        if (row.stock != null) row.current_stock = row.stock;
        else if (row.available_stock != null) row.current_stock = row.available_stock;
      }
      return row;
    });
    return payload;
  }

  function responseWithPayload(response, payload) {
    var headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  }

  window.fetch = async function (input, init) {
    var rawUrl = typeof input === "string" ? input : (input && input.url) || "";

    if (isCategoriesRequest(rawUrl)) {
      var categoryResponse = await originalFetch(input, init);
      try {
        if (categoryResponse.ok) cacheCategories(await categoryResponse.clone().json());
      } catch (_) {}
      return categoryResponse;
    }

    if (!isProductsRequest(rawUrl)) return originalFetch(input, init);

    try {
      var url = new URL(rawUrl, window.location.origin);
      // Do not let the API hide catalogue records merely because branch stock
      // has not been synchronised yet. Counter will still show stock status and
      // the existing checkout safeguards remain responsible for sale quantity.
      url.searchParams.delete("in_stock_only");
      url.searchParams.set("fallback_product_stock", "true");
      var categories = await getCategoryCache(init);
      var productResponse = await originalFetch(url.toString(), init);
      if (!productResponse.ok) return productResponse;
      var payload = await productResponse.clone().json();
      return responseWithPayload(productResponse, rewriteProductsPayload(payload, categories));
    } catch (_) {
      return originalFetch(input, init);
    }
  };
})();
