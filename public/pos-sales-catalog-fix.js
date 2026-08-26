(function () {
  'use strict';

  // Final Sales catalogue bridge. This runs independently of the older
  // compatibility layer and explicitly carries the login token + selected
  // branch so Sales can read the same product catalogue as Inventory/Bulk Import.
  var TOKEN_KEY = 'uniquepos.token';
  var timer = null;
  var busy = false;
  var lastSignature = '';
  var cache = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function list(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.products)) return payload.products;
    return [];
  }

  function branchId() {
    var select = document.getElementById('branchSelect');
    var value = select && select.value ? String(select.value) : '';
    return value && value !== 'all' ? value : '';
  }

  function headers() {
    var h = new Headers({ Accept: 'application/json' });
    var token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) h.set('Authorization', 'Bearer ' + token);
    var branch = branchId();
    if (branch && /^\d+$/.test(branch)) h.set('x-branch-id', branch);
    return h;
  }

  function normalize(row) {
    return {
      id: row.id,
      name: row.product_name || row.name || row.productName || row.description || 'Product',
      sku: row.product_code || row.sku || row.code || '',
      barcode: row.barcode || '',
      category: row.category_name || row.category || row.categoryName || 'Others',
      price: Number(row.selling_price != null ? row.selling_price : (row.sellingPrice != null ? row.sellingPrice : row.price)) || 0,
      stock: row.current_stock != null ? Number(row.current_stock) : (row.quantity_on_hand != null ? Number(row.quantity_on_hand) : (row.stock != null ? Number(row.stock) : (row.available_stock != null ? Number(row.available_stock) : null))),
      image: row.image_url || row.imageUrl || ''
    };
  }

  async function loadProducts() {
    var branch = branchId();
    var url = '/api/products?limit=500&in_stock_only=false&fallback_product_stock=true';
    if (branch && /^\d+$/.test(branch)) url += '&branchId=' + encodeURIComponent(branch);
    var response = await fetch(url, { headers: headers(), cache: 'no-store' });
    if (!response.ok) throw new Error('Products API returned ' + response.status);
    return list(await response.json()).map(normalize).filter(function (p) { return p.id != null; });
  }

  function categoryFilter() {
    var active = document.querySelector('.pos-categories-panel .chip.active');
    if (!active) return 'All Products';
    return String(active.getAttribute('data-value') || active.textContent || '').trim();
  }

  function searchFilter() {
    var input = document.getElementById('posProductSearch');
    return String(input ? input.value : '').trim().toLowerCase();
  }

  function matches(p) {
    var category = categoryFilter();
    var query = searchFilter();
    var categoryOk = !category || category === 'All Products' || p.category.toLowerCase() === category.toLowerCase() || (category === 'Others' && ['solar panels','inverters','batteries','accessories','cables','electricals'].indexOf(p.category.toLowerCase()) === -1);
    var text = (p.name + ' ' + p.sku + ' ' + p.barcode + ' ' + p.category).toLowerCase();
    return categoryOk && (!query || text.indexOf(query) !== -1);
  }

  function card(p) {
    var stockKnown = p.stock != null && Number.isFinite(p.stock);
    var inStock = !stockKnown || p.stock > 0;
    var stockText = !stockKnown ? 'Stock available' : (p.stock > 0 ? ('Stock: ' + p.stock) : 'Out of stock');
    var action = inStock ? 'add-to-basket' : 'noop';
    return '<article class="product-card" data-id="' + esc(p.id) + '">' +
      '<div class="product-card__image">' + (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">' : '<i class="fa-solid fa-box-open"></i>') + '</div>' +
      '<div class="product-card__body">' +
      '<div class="product-card__title">' + esc(p.name) + '</div>' +
      '<div class="product-card__meta"><span>KES ' + p.price.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span><span class="stock-pill ' + (stockKnown && p.stock <= 0 ? 'out' : 'ok') + '">' + esc(stockText) + '</span></div>' +
      '<button type="button" class="btn ' + (inStock ? 'btn-primary' : 'btn-outline') + '" data-action="' + action + '" data-id="' + esc(p.id) + '"' + (inStock ? '' : ' disabled') + '>' + (inStock ? '<i class="fa-solid fa-plus"></i> Add to Basket' : 'Out of stock') + '</button>' +
      '</div></article>';
  }

  function render(panel, products) {
    var filtered = products.filter(matches);
    var signature = branchId() + '|' + categoryFilter() + '|' + searchFilter() + '|' + filtered.map(function (p) { return p.id + ':' + p.stock; }).join(',');
    if (signature === lastSignature && panel.querySelector('.product-card')) return;
    lastSignature = signature;
    if (!filtered.length) {
      panel.innerHTML = '<div class="empty-state"><i class="fa-regular fa-face-smile"></i><p>No products match the current search or category.</p></div>';
      return;
    }
    panel.innerHTML = '<div class="product-grid">' + filtered.map(card).join('') + '</div>';
  }

  async function sync() {
    if (busy) return;
    var panel = document.querySelector('.pos-products-panel');
    if (!panel) return;
    // Do not interfere with an already populated, live product grid unless
    // branch/search/category changed. An empty panel is always repaired.
    var needsLoad = !panel.querySelector('.product-card') || !cache || cache.branch !== branchId();
    if (!needsLoad) {
      render(panel, cache.products);
      return;
    }
    busy = true;
    try {
      var products = await loadProducts();
      cache = { branch: branchId(), products: products };
      render(panel, products);
      panel.dataset.salesCatalog = 'connected';
    } catch (error) {
      panel.dataset.salesCatalog = 'error';
      panel.dataset.salesCatalogError = error.message || 'catalogue request failed';
      console.error('[sales-catalog-fix]', error);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 200);
  }

  var observer = new MutationObserver(function () {
    if (document.querySelector('.pos-products-panel')) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'posProductSearch') { lastSignature = ''; schedule(); } });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="pos-category"]') || e.target.closest('.pos-categories-panel .chip')) { lastSignature = ''; schedule(); }
  });
  var branch = document.getElementById('branchSelect');
  if (branch) branch.addEventListener('change', function () { cache = null; lastSignature = ''; schedule(); });
  window.addEventListener('load', schedule);
  window.addEventListener('hashchange', schedule);
  schedule();
})();
