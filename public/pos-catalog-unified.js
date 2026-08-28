(() => {
  'use strict';

  // Single source of truth for the Sales catalogue.
  // Sales historically read /api/products while Inventory and bulk import use
  // inventory_products_v2 + inventory_stock_v2. That split created two
  // catalogues with different category and stock fields. The adapter below
  // makes the legacy Sales request read the same V3 inventory catalogue.

  const nativeFetch = window.fetch.bind(window);
  const text = value => String(value ?? '').trim();
  const normalKey = value => text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = new Map([
    ['solar panel', 'Solar Panels'], ['solar panels', 'Solar Panels'], ['pv panel', 'Solar Panels'], ['pv panels', 'Solar Panels'],
    ['inverter', 'Inverters'], ['inverters', 'Inverters'], ['battery', 'Batteries'], ['batteries', 'Batteries'],
    ['accessory', 'Accessories'], ['accessories', 'Accessories'], ['cable', 'Cables'], ['cables', 'Cables'],
    ['electrical', 'Electricals'], ['electricals', 'Electricals'], ['other', 'Others'], ['others', 'Others']
  ]);

  function categoryName(value) {
    const raw = text(value);
    if (!raw) return 'Others';
    return aliases.get(normalKey(raw)) || raw;
  }

  function selectedBranchId() {
    const element = document.getElementById('branchSelect');
    const id = Number(element && element.value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function isLegacyProductsRequest(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      return url.pathname === '/api/products';
    } catch (_) { return false; }
  }

  function buildInventoryUrl(input) {
    const original = new URL(typeof input === 'string' ? input : input.url, location.origin);
    const url = new URL('/api/v3/inventory/products', location.origin);
    const branchId = selectedBranchId();
    if (branchId) url.searchParams.set('branchId', String(branchId));
    const q = text(original.searchParams.get('q') || original.searchParams.get('search'));
    if (q) url.searchParams.set('q', q);
    return url.toString();
  }

  function toSalesProduct(product) {
    const row = product && typeof product === 'object' ? product : {};
    const quantity = Number(row.quantity_on_hand ?? row.current_stock ?? row.stock ?? 0);
    const category = categoryName(row.category_name ?? row.categoryName ?? row.category);
    return {
      ...row,
      id: row.id,
      product_name: text(row.product_name || row.name),
      name: text(row.name || row.product_name),
      product_code: text(row.product_code || row.sku),
      sku: text(row.sku || row.product_code),
      barcode: text(row.barcode),
      category,
      category_name: category,
      categoryName: category,
      selling_price: Number(row.selling_price ?? row.sellingPrice ?? 0),
      cost_price: Number(row.cost_price ?? row.costPrice ?? 0),
      vat_rate: Number(row.vat_rate ?? row.vatRate ?? 16),
      current_stock: Number.isFinite(quantity) ? quantity : 0,
      stock: Number.isFinite(quantity) ? quantity : 0,
      pos_enabled: row.pos_enabled !== false,
      is_active: row.is_active !== false
    };
  }

  window.fetch = async function(input, init) {
    if (!isLegacyProductsRequest(input)) return nativeFetch(input, init);

    const response = await nativeFetch(buildInventoryUrl(input), init);
    if (!response.ok) return response;

    let payload;
    try { payload = await response.clone().json(); }
    catch (_) { return response; }

    const products = Array.isArray(payload.products) ? payload.products.map(toSalesProduct) : [];
    const body = { data: products, products, total: products.length, source: 'inventory-v3' };
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
})();