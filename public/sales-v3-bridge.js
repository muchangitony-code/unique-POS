(function () {
  'use strict';

  // Sales must always read stock for the selected branch. The authoritative
  // inventory tables contain one stock row per product/branch. Never fall
  // back to the retired aggregate catalogue because that can leak stock from
  // another branch into the current counter.
  const originalFetch = window.fetch.bind(window);
  let refreshScheduled = false;

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

  function refreshSalesRoute() {
    if (!isSalesRoute() || refreshScheduled) return;
    refreshScheduled = true;
    window.setTimeout(function () {
      refreshScheduled = false;
      if (!isSalesRoute() || !selectedBranchId()) return;
      // app.js owns the renderer. Re-entering the same hash through its
      // hashchange handler guarantees the initial catalogue request happens
      // after this bridge has installed its fetch interception.
      window.dispatchEvent(new Event('hashchange'));
    }, 50);
  }

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isSalesProductRequest(rawUrl)) return originalFetch(input, init);

    try {
      const requested = new URL(rawUrl, window.location.origin);
      const query = requested.searchParams.get('search') || requested.searchParams.get('q') || '';
      const branchId = selectedBranchId();

      if (!branchId) {
        return makeResponse({ data: [], products: [], total: 0, count: 0, branch_id: null, source: 'inventory_products_v2', error: 'Select a branch to load stock.' }, 400);
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
      return makeResponse({ data: [], products: [], total: 0, count: 0, branch_id: selectedBranchId() || null, source: 'inventory_products_v2', error: 'Unable to load branch stock.' }, 503);
    }
  };

  window.addEventListener('hashchange', function () {
    if (isSalesRoute()) refreshSalesRoute();
  });
  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'branchSelect') refreshSalesRoute();
  });
  window.setTimeout(refreshSalesRoute, 150);
})();
