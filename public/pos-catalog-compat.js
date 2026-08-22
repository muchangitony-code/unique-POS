(function () {
  "use strict";

  // Counter compatibility layer. The main POS bundle can render an empty
  // product grid even when the master catalogue contains products. This layer
  // restores the catalogue from the live product endpoint and keeps stock
  // status visible instead of silently hiding the cards.
  var originalFetch = window.fetch.bind(window);
  var categoryCache = null;
  var stockCache = null;
  var stockPromise = null;
  var repairTimer = null;
  var repairing = false;

  var CATEGORY_ALIASES = {
    "solar panels": "Solar Panels", "solar panel": "Solar Panels",
    "pv panels": "Solar Panels", "pv panel": "Solar Panels",
    "photovoltaic panels": "Solar Panels",
    "inverters": "Inverters", "inverter": "Inverters",
    "batteries": "Batteries", "battery": "Batteries",
    "accessories": "Accessories", "accessory": "Accessories",
    "cables": "Cables", "cable": "Cables",
    "electricals": "Electricals", "electrical": "Electricals",
    "breakers": "Electricals", "breaker": "Electricals",
    "contactors": "Electricals", "contactor": "Electricals",
    "isolators": "Electricals", "isolator": "Electricals",
    "bulbs": "Electricals", "bulb": "Electricals", "lighting": "Electricals",
    "switches & sockets": "Electricals", "switches and sockets": "Electricals",
    "conduit": "Electricals", "plugs & adapters": "Electricals",
    "plugs and adapters": "Electricals", "fittings": "Electricals",
    "networking": "Electricals", "others": "Others"
  };

  function normalizedCategory(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "Others";
    return CATEGORY_ALIASES[raw.toLowerCase()] || raw;
  }
  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.items)) return value.items;
    return [];
  }
  function number(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttr(value) { return escapeHtml(value); }
  function money(value) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(number(value, 0));
  }
  function isProductsRequest(url) {
    try { return new URL(url, window.location.origin).pathname === "/api/products"; } catch (_) { return false; }
  }
  function isCategoriesRequest(url) {
    try { return new URL(url, window.location.origin).pathname === "/api/categories"; } catch (_) { return false; }
  }
  function isStockRequest(url) {
    try { return new URL(url, window.location.origin).pathname === "/api/inventory/stock-count"; } catch (_) { return false; }
  }
  function cacheCategories(payload) {
    var map = {};
    normalizeList(payload).forEach(function (row) {
      if (row && row.id != null) map[String(row.id)] = normalizedCategory(row.name || row.category_name);
    });
    categoryCache = map;
  }
  function buildStockMap(payload) {
    var map = {};
    normalizeList(payload).forEach(function (row) {
      if (!row) return;
      var id = row.product_id != null ? String(row.product_id) : (row.id != null ? String(row.id) : "");
      if (!id) return;
      map[id] = { current: number(row.current_stock, number(row.stock, number(row.available_stock, 0))), min: number(row.min_stock, 0) };
    });
    return map;
  }
  function rewriteProductsPayload(payload, categories, stockMap) {
    if (!payload || !Array.isArray(payload.data)) return payload;
    payload.data = payload.data.map(function (product) {
      var row = Object.assign({}, product);
      var category = row.category_name || row.category;
      if (!category && row.category_id != null && categories[String(row.category_id)]) category = categories[String(row.category_id)];
      row.category_name = normalizedCategory(category);
      var stock = stockMap && stockMap[String(row.id)];
      if (stock) {
        row.current_stock = stock.current;
        if (!number(row.min_stock, 0)) row.min_stock = stock.min;
      } else if (row.current_stock == null) {
        row.current_stock = number(row.stock, number(row.available_stock, 0));
      }
      return row;
    });
    return payload;
  }
  async function getCategoryCache(init) {
    if (categoryCache) return categoryCache;
    try {
      var response = await originalFetch("/api/categories", init || {});
      if (response.ok) cacheCategories(await response.clone().json());
    } catch (_) { categoryCache = {}; }
    return categoryCache || {};
  }
  async function getStockCache(init) {
    if (stockCache) return stockCache;
    if (stockPromise) return stockPromise;
    stockPromise = originalFetch("/api/inventory/stock-count", init || {})
      .then(function (response) { return response.ok ? response.clone().json().then(buildStockMap).catch(function () { return {}; }) : {}; })
      .catch(function () { return {}; })
      .then(function (map) { stockCache = map || {}; stockPromise = null; return stockCache; });
    return stockPromise;
  }
  function responseWithPayload(response, payload) {
    var headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: headers });
  }

  window.fetch = async function (input, init) {
    var rawUrl = typeof input === "string" ? input : (input && input.url) || "";
    if (isCategoriesRequest(rawUrl)) {
      var categoryResponse = await originalFetch(input, init);
      try { if (categoryResponse.ok) cacheCategories(await categoryResponse.clone().json()); } catch (_) {}
      return categoryResponse;
    }
    if (isStockRequest(rawUrl)) {
      var stockResponse = await originalFetch(input, init);
      try { if (stockResponse.ok) stockCache = buildStockMap(await stockResponse.clone().json()); } catch (_) {}
      return stockResponse;
    }
    if (!isProductsRequest(rawUrl)) return originalFetch(input, init);
    try {
      var url = new URL(rawUrl, window.location.origin);
      url.searchParams.delete("in_stock_only");
      url.searchParams.set("fallback_product_stock", "true");
      var categoriesPromise = getCategoryCache(init);
      var stockPromiseLocal = getStockCache(init);
      var productResponse = await originalFetch(url.toString(), init);
      if (!productResponse.ok) return productResponse;
      var payload = await productResponse.clone().json();
      return responseWithPayload(productResponse, rewriteProductsPayload(payload, await categoriesPromise, await stockPromiseLocal));
    } catch (_) { return originalFetch(input, init); }
  };

  function activeCategory() {
    var chip = document.querySelector(".pos-categories-panel .chip.active");
    return chip ? String(chip.getAttribute("data-value") || chip.textContent || "").trim() : "All Products";
  }
  function currentSearch() {
    var input = document.getElementById("posProductSearch");
    return input ? String(input.value || "").trim().toLowerCase() : "";
  }
  function matchesCategory(product, filter) {
    if (!filter || filter === "All Products") return true;
    var category = normalizedCategory(product.category_name || product.category);
    if (filter === "Others") return ["Solar Panels", "Inverters", "Batteries", "Accessories", "Cables", "Electricals"].indexOf(category) === -1;
    return category.toLowerCase() === String(filter).toLowerCase();
  }
  function matchesSearch(product, query) {
    if (!query) return true;
    return [product.product_name, product.product_code, product.barcode, product.category_name].some(function (value) { return String(value || "").toLowerCase().indexOf(query) !== -1; });
  }
  function productCard(product, stock) {
    var rawStock = stock ? stock.current : (product.current_stock != null ? product.current_stock : (product.stock != null ? product.stock : product.available_stock));
    var stockKnown = rawStock != null && rawStock !== "";
    var current = number(rawStock, 0);
    var min = number(stock && stock.min, number(product.min_stock, 0));
    var inStock = stockKnown ? current > 0 : true;
    var image = String(product.image_url || "").trim();
    var imageHtml = image ? '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(product.product_name || "Product") + '" />' : '<i class="fa-solid fa-solar-panel"></i>';
    var stockClass = stockKnown && current <= 0 ? "out" : (stockKnown && current <= min ? "low" : "ok");
    var stockText = stockKnown && current <= 0 ? "Out of stock" : (stockKnown && current <= min ? "Low stock" : "In stock");
    var action = inStock ? ' data-action="add-to-basket"' : '';
    var disabled = inStock ? '' : ' disabled aria-disabled="true" title="No stock available in this branch"';
    return '<article class="product-card"' + action + ' data-id="' + escapeAttr(String(product.id)) + '"><div class="product-card__image">' + imageHtml + '</div><div class="product-card__body"><div class="product-card__title">' + escapeHtml(product.product_name || "Product") + '</div><div class="product-card__meta"><span>' + money(product.selling_price) + '</span><span class="stock-pill ' + stockClass + '">' + stockText + '</span></div><button type="button" class="btn ' + (inStock ? 'btn-primary' : 'btn-outline') + '" data-action="' + (inStock ? 'add-to-basket' : 'noop') + '" data-id="' + escapeAttr(String(product.id)) + '"' + disabled + '><i class="fa-solid ' + (inStock ? 'fa-plus' : 'fa-ban') + '"></i>' + (inStock ? 'Add to Basket' : 'Out of stock') + '</button></div></article>';
  }

  async function repairEmptyCounterCatalog() {
    if (String(location.hash || "") !== "#sales" || repairing) return;
    var panel = document.querySelector(".pos-products-panel");
    if (!panel) return;

    // Only leave the normal renderer alone when it actually produced product cards.
    // A product-grid containing only the empty-state message must be repaired.
    if (panel.querySelector(".product-card")) return;
    repairing = true;
    panel.dataset.catalogRepair = "loading";
    try {
      var response = await originalFetch("/api/products?limit=500&in_stock_only=false&fallback_product_stock=true", {});
      if (!response.ok) throw new Error("Product catalogue request failed");
      var products = normalizeList(await response.json());
      var categories = await getCategoryCache({});
      var stockMap = await getStockCache({});
      products = products.map(function (product) {
        var row = Object.assign({}, product);
        if (!row.category_name && row.category_id != null && categories[String(row.category_id)]) row.category_name = categories[String(row.category_id)];
        row.category_name = normalizedCategory(row.category_name || row.category);
        if (stockMap[String(row.id)]) row.current_stock = stockMap[String(row.id)].current;
        return row;
      });
      var query = currentSearch();
      var filter = activeCategory();
      var filtered = products.filter(function (product) { return matchesSearch(product, query) && matchesCategory(product, filter); });
      if (!filtered.length) {
        panel.dataset.catalogRepair = "empty";
        return;
      }
      panel.innerHTML = '<div class="product-grid">' + filtered.map(function (product) { return productCard(product, stockMap[String(product.id)]); }).join("") + '</div>';
      panel.dataset.catalogRepair = "done";
    } catch (_) {
      panel.dataset.catalogRepair = "failed";
    } finally {
      repairing = false;
    }
  }

  function scheduleRepair() {
    clearTimeout(repairTimer);
    repairTimer = setTimeout(repairEmptyCounterCatalog, 150);
  }
  var observer = new MutationObserver(function () {
    if (String(location.hash || "") === "#sales") scheduleRepair();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleRepair);
  window.addEventListener("load", scheduleRepair);
  document.addEventListener("input", function (event) { if (event.target && event.target.id === "posProductSearch") scheduleRepair(); });
  document.addEventListener("click", function (event) { if (event.target.closest("[data-action=pos-category]")) scheduleRepair(); });
  scheduleRepair();
})();
