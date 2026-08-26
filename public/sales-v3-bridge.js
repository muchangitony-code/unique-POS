(function () {
  'use strict';

  // Sales must use the same branch-scoped inventory source as Products/Inventory.
  // Keep the adapter deliberately small and passive: it must never trigger route
  // changes or refresh loops. It only normalizes the live inventory response
  // into every stock field used by the legacy Sales renderer.
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
    const outOfStock = stock <= 0;
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
      brand: row.brand || '',
      unit: row.unit || 'pcs',
      cost_price: number(row.cost_price),
      selling_price: number(row.selling_price),
      vat_rate: number(row.vat_rate),
      min_stock: number(row.reorder_level),
      reorder_level: number(row.reorder_level),

      // Stock aliases. Different generations of the Sales renderer use
      // different names; all must describe the same branch quantity.
      current_stock: stock,
      stock: stock,
      quantity: stock,
      quantity_on_hand: stock,
      stock_quantity: stock,
      available_stock: stock,
      available_quantity: stock,
      qty: stock,
      currentStock: stock,
      is_out_of_stock: outOfStock,
      out_of_stock: outOfStock,
      in_stock: !outOfStock,

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
})();
