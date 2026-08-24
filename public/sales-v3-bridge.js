(function () {
  'use strict';

  // The clean inventory cutover made inventory_products_v2/inventory_stock_v2
  // authoritative, but the Sales workspace still requested the retired
  // /api/products catalogue with in_stock_only=true. That made newly imported
  // V3 products invisible to Sales even though Inventory showed them.
  const originalFetch = window.fetch.bind(window);

  function isSalesRoute() {
    return String(location.hash || '').replace(/^#/, '').split('?')[0] === 'sales';
  }

  function isSalesProductRequest(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname === '/api/products' && isSalesRoute();
    } catch (_) {
      return false;
    }
  }

  function selectedBranchId() {
    const el = document.getElementById('branchSelect');
    const value = el && el.value ? Number(el.value) : 0;
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function legacyProduct(row) {
    const stock = number(row.quantity_on_hand);
    return {
      id: row.id,
      product_id: row.id,
      product_code: row.sku || '',
      sku: row.sku || '',
      barcode: row.barcode || '',
      product_name: row.name || '',
      name: row.name || '',
      category_name: String(row.category || '').trim() || 'Others',
      category: String(row.category || '').trim() || 'Others',
      unit: row.unit || 'pcs',
      cost_price: number(row.cost_price),
      selling_price: number(row.selling_price),
      vat_rate: number(row.vat_rate),
      min_stock: number(row.reorder_level),
      current_stock: stock,
      stock: stock,
      available_stock: stock,
      is_active: row.is_active !== false
    };
  }

  function makeResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isSalesProductRequest(rawUrl)) return originalFetch(input, init);

    try {
      const requested = new URL(rawUrl, window.location.origin);
      const query = requested.searchParams.get('search') || requested.searchParams.get('q') || '';
      const branchId = selectedBranchId();
      const liveUrl = new URL('/api/v3/inventory/products', window.location.origin);
      if (query) liveUrl.searchParams.set('q', query);

      // V3 is the authoritative inventory source. It currently returns stock
      // across active branches; preserve the selected branch as metadata for
      // future branch-scoped V3 support without falling back to the retired
      // catalogue.
      const response = await originalFetch(liveUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) return response;

      const data = await response.json();
      const products = Array.isArray(data.products) ? data.products.map(legacyProduct) : [];
      // Sales itself applies current_stock > 0, so do not hide products here
      // and accidentally create a second, inconsistent stock filter.
      return makeResponse({
        data: products,
        products,
        total: products.length,
        count: products.length,
        branch_id: branchId || null,
        source: 'inventory_products_v2'
      });
    } catch (error) {
      console.error('[sales-v3] live inventory catalogue failed', error);
      return originalFetch(input, init);
    }
  };

  function clearSalesView() {
    if (!isSalesRoute()) return;
    // The normal Sales route reloads its data when the branch changes. This
    // event is intentionally just a cache-busting hook for browser/devtools
    // visibility; the bridge itself never caches responses.
  }

  window.addEventListener('hashchange', clearSalesView);
  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'branchSelect') clearSalesView();
  });
})();
