(function () {
  'use strict';

  var originalFetch = window.fetch.bind(window);
  var categoryCache = null;
  var stockCache = null;
  var stockPromise = null;
  var repairTimer = null;
  var repairing = false;

  var CATEGORY_ALIASES = {
    'solar panel': 'Solar Panels', 'solar panels': 'Solar Panels', 'pv panel': 'Solar Panels', 'pv panels': 'Solar Panels', 'photovoltaic panel': 'Solar Panels', 'photovoltaic panels': 'Solar Panels',
    'inverter': 'Inverters', 'inverters': 'Inverters',
    'battery': 'Batteries', 'batteries': 'Batteries',
    'accessory': 'Accessories', 'accessories': 'Accessories',
    'cable': 'Cables', 'cables': 'Cables',
    'electrical': 'Electricals', 'electricals': 'Electricals', 'breaker': 'Electricals', 'breakers': 'Electricals', 'contactor': 'Electricals', 'contactors': 'Electricals', 'isolator': 'Electricals', 'isolators': 'Electricals', 'bulb': 'Electricals', 'bulbs': 'Electricals', 'lighting': 'Electricals', 'switch': 'Electricals', 'switches': 'Electricals', 'switches sockets': 'Electricals', 'switches and sockets': 'Electricals', 'conduit': 'Electricals', 'plugs adapters': 'Electricals', 'plugs and adapters': 'Electricals', 'fittings': 'Electricals',
    'networking': 'Electricals', 'other': 'Others', 'others': 'Others'
  };

  function text(value) { return String(value == null ? '' : value).trim(); }
  function key(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function normalizedCategory(value) {
    var raw = text(value);
    if (!raw) return 'Others';
    return CATEGORY_ALIASES[key(raw)] || raw;
  }
  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.items)) return value.items;
    if (value && Array.isArray(value.products)) return value.products;
    return [];
  }
  function number(value, fallback) { var n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;'); }
  function money(value) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(number(value, 0)); }
  function isProductsRequest(url) { try { return new URL(url, window.location.origin).pathname === '/api/products'; } catch (_) { return false; } }
  function isCategoriesRequest(url) { try { return new URL(url, window.location.origin).pathname === '/api/categories'; } catch (_) { return false; } }
  function isStockRequest(url) { try { return new URL(url, window.location.origin).pathname === '/api/inventory/stock-count'; } catch (_) { return false; } }

  function cacheCategories(payload) {
    var byId = {}, byKey = {};
    normalizeList(payload).forEach(function (row) {
      if (!row) return;
      var name = normalizedCategory(row.name || row.category_name || row.category || row.label || row.title);
      var ids = [row.id, row.category_id, row.categoryId, row.value].filter(function (v) { return v !== undefined && v !== null && text(v) !== ''; });
      ids.forEach(function (id) { byId[String(id)] = name; });
      if (name && name !== 'Others') byKey[key(name)] = name;
    });
    categoryCache = { byId: byId, byKey: byKey };
  }
  function resolveCategory(row, categories) {
    row = row || {};
    categories = categories || { byId: {}, byKey: {} };
    var ids = [row.category_id, row.categoryId];
    var direct = [row.category_name, row.categoryName, row.category, row.category_label, row.categoryLabel, row.category && row.category.name];
    for (var i = 0; i < direct.length; i++) {
      var value = direct[i];
      if (value && typeof value === 'object') value = value.name || value.category_name || value.label || value.id;
      var raw = text(value);
      if (!raw) continue;
      if (categories.byId[raw]) return categories.byId[raw];
      var canonical = categories.byKey[key(raw)];
      if (canonical) return canonical;
      if (!/^\d+$/.test(raw)) return normalizedCategory(raw);
      ids.push(raw);
    }
    for (var j = 0; j < ids.length; j++) {
      var id = text(ids[j]);
      if (id && categories.byId[id]) return categories.byId[id];
    }
    return 'Others';
  }
  function buildStockMap(payload) {
    var map = {};
    normalizeList(payload).forEach(function (row) {
      if (!row) return;
      var id = row.product_id != null ? String(row.product_id) : (row.id != null ? String(row.id) : '');
      if (id) map[id] = { current: number(row.current_stock, number(row.stock, number(row.available_stock, 0))), min: number(row.min_stock, 0) };
    });
    return map;
  }
  function getCategoryName(product, categories) { return resolveCategory(product, categories || categoryCache); }
  function rewriteProductsPayload(payload, categories, stockMap) {
    var listKey = Array.isArray(payload && payload.data) ? 'data' : (Array.isArray(payload && payload.items) ? 'items' : (Array.isArray(payload) ? null : null));
    var list = listKey ? payload[listKey] : (Array.isArray(payload) ? payload : null);
    if (!list) return payload;
    var mapped = list.map(function (product) {
      var row = Object.assign({}, product);
      row.category_name = getCategoryName(row, categories);
      var stock = stockMap && stockMap[String(row.id != null ? row.id : row.product_id)];
      if (stock) { row.current_stock = stock.current; if (!number(row.min_stock, 0)) row.min_stock = stock.min; }
      else if (row.current_stock == null) row.current_stock = number(row.stock, number(row.available_stock, 0));
      return row;
    });
    if (listKey) payload[listKey] = mapped; else payload = mapped;
    return payload;
  }
  function responseWithPayload(response, payload) { var headers = new Headers(response.headers); headers.set('Content-Type', 'application/json'); return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: headers }); }
  async function getCategoryCache(init) {
    if (categoryCache) return categoryCache;
    try { var response = await originalFetch('/api/categories', init || {}); if (response.ok) cacheCategories(await response.clone().json()); } catch (_) { categoryCache = { byId: {}, byKey: {} }; }
    return categoryCache || { byId: {}, byKey: {} };
  }
  async function getStockCache(init) {
    if (stockCache) return stockCache;
    if (stockPromise) return stockPromise;
    stockPromise = originalFetch('/api/inventory/stock-count', init || {}).then(function (r) { return r.ok ? r.clone().json().then(buildStockMap).catch(function () { return {}; }) : {}; }).catch(function () { return {}; }).then(function (map) { stockCache = map || {}; stockPromise = null; return stockCache; });
    return stockPromise;
  }

  window.fetch = async function (input, init) {
    var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (isCategoriesRequest(rawUrl)) { var cr = await originalFetch(input, init); try { if (cr.ok) cacheCategories(await cr.clone().json()); } catch (_) {} return cr; }
    if (isStockRequest(rawUrl)) { var sr = await originalFetch(input, init); try { if (sr.ok) stockCache = buildStockMap(await sr.clone().json()); } catch (_) {} return sr; }
    if (!isProductsRequest(rawUrl)) return originalFetch(input, init);
    try {
      var url = new URL(rawUrl, window.location.origin); url.searchParams.delete('in_stock_only'); url.searchParams.set('fallback_product_stock', 'true');
      var categoriesPromise = getCategoryCache(init), stockPromiseLocal = getStockCache(init);
      var pr = await originalFetch(url.toString(), init); if (!pr.ok) return pr;
      var payload = await pr.clone().json();
      return responseWithPayload(pr, rewriteProductsPayload(payload, await categoriesPromise, await stockPromiseLocal));
    } catch (_) { return originalFetch(input, init); }
  };

  function activeCategory() {
    var chip = document.querySelector('.pos-categories-panel .chip.active, [data-action="pos-category"].active, .pos-category.active');
    return chip ? text(chip.getAttribute('data-value') || chip.getAttribute('data-category') || chip.textContent) : 'All Products';
  }
  function currentSearch() { var input = document.getElementById('posProductSearch'); return input ? text(input.value).toLowerCase() : ''; }
  function matchesCategory(product, filter) {
    var wanted = normalizedCategory(filter);
    if (!filter || key(filter) === 'all products' || key(filter) === 'all') return true;
    var category = getCategoryName(product, categoryCache);
    if (key(wanted) === 'others') return ['solar panels', 'inverters', 'batteries', 'accessories', 'cables', 'electricals'].indexOf(key(category)) === -1;
    return key(category) === key(wanted);
  }
  function matchesSearch(product, query) { if (!query) return true; return [product.product_name, product.name, product.product_code, product.sku, product.barcode, getCategoryName(product, categoryCache)].some(function (v) { return String(v || '').toLowerCase().indexOf(query) !== -1; }); }
  function productCard(product, stock) {
    var rawStock = stock ? stock.current : (product.current_stock != null ? product.current_stock : (product.stock != null ? product.stock : product.available_stock));
    var stockKnown = rawStock != null && rawStock !== ''; var current = number(rawStock, 0); var min = number(stock && stock.min, number(product.min_stock, 0)); var inStock = stockKnown ? current > 0 : true;
    var image = text(product.image_url); var title = product.product_name || product.name || 'Product'; var imageHtml = image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(title) + '">' : '<i class="fa-solid fa-solar-panel"></i>';
    var stockClass = stockKnown && current <= 0 ? 'out' : (stockKnown && current <= min ? 'low' : 'ok'); var stockText = stockKnown && current <= 0 ? 'Out of stock' : (stockKnown && current <= min ? 'Low stock' : 'In stock');
    var id = String(product.id != null ? product.id : product.product_id);
    return '<article class="product-card"' + (inStock ? ' data-action="add-to-basket"' : '') + ' data-id="' + escapeHtml(id) + '"><div class="product-card__image">' + imageHtml + '</div><div class="product-card__body"><div class="product-card__title">' + escapeHtml(title) + '</div><div class="product-card__meta"><span>' + money(product.selling_price != null ? product.selling_price : product.sellingPrice) + '</span><span class="stock-pill ' + stockClass + '">' + stockText + '</span></div><button type="button" class="btn ' + (inStock ? 'btn-primary' : 'btn-outline') + '" data-action="' + (inStock ? 'add-to-basket' : 'noop') + '" data-id="' + escapeHtml(id) + '"' + (inStock ? '' : ' disabled aria-disabled="true"') + '><i class="fa-solid ' + (inStock ? 'fa-plus' : 'fa-ban') + '"></i>' + (inStock ? 'Add to Basket' : 'Out of stock') + '</button></div></article>';
  }
  async function repairCatalog() {
    if (String(location.hash || '') !== '#sales' || repairing) return;
    var panel = document.querySelector('.pos-products-panel'); if (!panel) return;
    var hasEmpty = !panel.querySelector('.product-card'); if (!hasEmpty && panel.dataset.catalogRepair === 'done') return;
    repairing = true;
    try {
      var response = await originalFetch('/api/products?limit=1000&in_stock_only=false&fallback_product_stock=true', {}); if (!response.ok) throw new Error('Product catalogue request failed');
      var products = normalizeList(await response.json()); var categories = await getCategoryCache({}); var stockMap = await getStockCache({});
      products = products.map(function (p) { var row = Object.assign({}, p); row.category_name = getCategoryName(row, categories); var id = String(row.id != null ? row.id : row.product_id); if (stockMap[id]) row.current_stock = stockMap[id].current; return row; });
      var query = currentSearch(), filter = activeCategory(); var filtered = products.filter(function (p) { return matchesSearch(p, query) && matchesCategory(p, filter); });
      if (filtered.length) { panel.innerHTML = '<div class="product-grid">' + filtered.map(function (p) { return productCard(p, stockMap[String(p.id != null ? p.id : p.product_id)]); }).join('') + '</div>'; panel.dataset.catalogRepair = 'done'; }
      else panel.dataset.catalogRepair = 'empty';
    } catch (_) { panel.dataset.catalogRepair = 'failed'; }
    finally { repairing = false; }
  }
  function scheduleRepair() { clearTimeout(repairTimer); repairTimer = setTimeout(repairCatalog, 80); }
  var observer = new MutationObserver(function () { if (String(location.hash || '') === '#sales') scheduleRepair(); }); observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleRepair); window.addEventListener('load', scheduleRepair);
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'posProductSearch') scheduleRepair(); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-action="pos-category"], .pos-category, .pos-categories-panel .chip')) setTimeout(scheduleRepair, 0); });
  scheduleRepair();
})();