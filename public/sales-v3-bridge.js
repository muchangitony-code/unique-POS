(function () {
  'use strict';

  // Sales must always read stock for the selected branch. The authoritative
  // inventory tables contain one stock row per product/branch, so an aggregate
  // catalogue would leak stock from other branches into the current counter.
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

  function makeResponse(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
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

      // Never fall back to aggregate stock. If the user has not selected a
      // branch yet, show an empty catalogue until the branch context exists.
      if (!branchId) {
        return makeResponse({ data: [], products: [], total: 0, count: 0, branch_id: null, source: 'inventory_products_v2', error: 'Select a branch to load stock.' });
      }

      const liveUrl = new URL('/api/v3/inventory/products', window.location.origin);
      liveUrl.searchParams.set('branchId', String(branchId));
      if (query) liveUrl.searchParams.set('q', query);

      const response = await originalFetch(liveUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) return response;

      const data = await response.json();
      const products = Array.isArray(data.products) ? data.products.map(legacyProduct) : [];
      return makeResponse({
        data: products,
        products,
        total: products.length,
        count: products.length,
        branch_id: branchId,
        source: 'inventory_products_v2'
      });
    } catch (error) {
      console.error('[sales-v3] branch-scoped live inventory catalogue failed', error);
      return originalFetch(input, init);
    }
  };
})();
