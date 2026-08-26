(function () {
  'use strict';

  // Sales must use the same branch stock table as Bulk Import / Inventory V3.
  var TOKEN_KEY = 'uniquepos.token';
  var timer = null;
  var busy = false;
  var cache = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function list(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.products)) return payload.products;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }
  function branchId() {
    var el = document.getElementById('branchSelect');
    var value = el && el.value ? String(el.value) : '';
    return /^\d+$/.test(value) ? value : '';
  }
  function headers() {
    var h = new Headers({ Accept: 'application/json' });
    var token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) h.set('Authorization', 'Bearer ' + token);
    return h;
  }
  function normalize(row) {
    var stock = row.quantity_on_hand;
    if (stock == null) stock = row.current_stock;
    if (stock == null) stock = row.stock;
    if (stock == null) stock = row.available_stock;
    return {
      id: row.id,
      name: row.name || row.product_name || row.productName || row.description || 'Product',
      sku: row.sku || row.product_code || row.code || '',
      barcode: row.barcode || '',
      category: row.category || row.category_name || row.categoryName || 'Others',
      price: Number(row.selling_price != null ? row.selling_price : row.price) || 0,
      stock: stock == null || stock === '' ? null : Number(stock),
      image: row.image_url || row.imageUrl || ''
    };
  }
  async function loadProducts() {
    var branch = branchId();
    if (!branch) return null;
    var response = await fetch('/api/v3/inventory/products?branchId=' + encodeURIComponent(branch), {
      headers: headers(), cache: 'no-store'
    });
    if (!response.ok) throw new Error('Branch inventory API returned ' + response.status);
    return list(await response.json()).map(normalize).filter(function (p) { return p.id != null; });
  }
  function categoryFilter() {
    var active = document.querySelector('.pos-categories-panel .chip.active');
    return active ? String(active.getAttribute('data-value') || active.textContent || '').trim() : 'All Products';
  }
  function searchFilter() {
    var input = document.getElementById('posProductSearch');
    return input ? String(input.value || '').trim().toLowerCase() : '';
  }
  function matches(p) {
    var category = categoryFilter();
    var query = searchFilter();
    var c = String(p.category || 'Others').toLowerCase();
    var categoryOk = !category || category === 'All Products' || c === category.toLowerCase() ||
      (category === 'Others' && ['solar panels','inverters','batteries','accessories','cables','electricals'].indexOf(c) === -1);
    var text = (p.name + ' ' + p.sku + ' ' + p.barcode + ' ' + p.category).toLowerCase();
    return categoryOk && (!query || text.indexOf(query) !== -1);
  }
  function card(p) {
    var known = Number.isFinite(p.stock);
    var inStock = known && p.stock > 0;
    var stockText = known ? ('Stock: ' + p.stock) : 'Stock unavailable';
    var button = inStock
      ? '<button type="button" class="btn btn-primary" data-action="add-to-basket" data-id="' + esc(p.id) + '"><i class="fa-solid fa-plus"></i> Add to Basket</button>'
      : '<button type="button" class="btn btn-outline" disabled><i class="fa-solid fa-ban"></i> Out of stock</button>';
    return '<article class="product-card" data-id="' + esc(p.id) + '">' +
      '<div class="product-card__image">' + (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">' : '<i class="fa-solid fa-box-open"></i>') + '</div>' +
      '<div class="product-card__body">' +
      '<div class="product-card__title">' + esc(p.name) + '</div>' +
      '<div class="product-card__meta"><span>KES ' + p.price.toLocaleString('en-KE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span>' +
      '<span class="stock-pill ' + (known && p.stock > 0 ? 'ok' : 'out') + '">' + esc(stockText) + '</span></div>' +
      button + '</div></article>';
  }
  function render(panel, products) {
    var filtered = (products || []).filter(matches);
    panel.innerHTML = filtered.length
      ? '<div class="product-grid">' + filtered.map(card).join('') + '</div>'
      : '<div class="empty-state"><i class="fa-regular fa-face-smile"></i><p>No products match the current search or category.</p></div>';
    panel.dataset.salesCatalog = 'branch-v3';
  }
  async function sync() {
    if (busy) return;
    var panel = document.querySelector('.pos-products-panel');
    if (!panel) return;
    var branch = branchId();
    if (!branch) {
      panel.dataset.salesCatalog = 'waiting-for-branch';
      return;
    }
    if (cache && cache.branch === branch) {
      render(panel, cache.products);
      return;
    }
    busy = true;
    try {
      var products = await loadProducts();
      if (products) {
        cache = { branch: branch, products: products };
        render(panel, products);
      }
    } catch (error) {
      panel.dataset.salesCatalog = 'error';
      panel.dataset.salesCatalogError = error.message || 'catalogue request failed';
      console.error('[sales-catalog-fix]', error);
    } finally { busy = false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(sync, 150); }
  var observer = new MutationObserver(function () { if (document.querySelector('.pos-products-panel')) schedule(); });
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'posProductSearch') schedule(); });
  document.addEventListener('click', function (e) { if (e.target.closest('.pos-categories-panel .chip')) schedule(); });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'branchSelect') { cache = null; schedule(); }
  });
  window.addEventListener('load', schedule);
  window.addEventListener('hashchange', schedule);
  schedule();
})();
