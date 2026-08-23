/*
 * Clean Product / Inventory module.
 *
 * Intentionally self-contained. It does not intercept fetch, click events,
 * MutationObserver, routing, or other application globals.
 */
(function () {
  'use strict';

  const state = {
    products: [],
    page: 1,
    pageSize: 50,
    query: '',
    loading: false,
    initialized: false,
  };

  function root() {
    return document.querySelector('[data-inventory-product-root]');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderEmpty(message) {
    const el = root();
    if (!el) return;
    el.innerHTML = `
      <section class="inventory-product-empty">
        <h2>Products</h2>
        <p>${escapeHtml(message)}</p>
        <button type="button" data-action="add-product">Add product</button>
        <button type="button" data-action="import-products">Import stock master</button>
      </section>`;
  }

  function render() {
    const el = root();
    if (!el) return;
    if (!state.products.length) {
      renderEmpty('No products in the catalogue. The catalogue will remain empty until you add or import products.');
      return;
    }
    el.innerHTML = `
      <section class="inventory-product-module">
        <header>
          <h2>Products</h2>
          <input type="search" data-product-search placeholder="Search SKU, barcode or name" value="${escapeHtml(state.query)}">
          <button type="button" data-action="add-product">Add product</button>
          <button type="button" data-action="import-products">Import</button>
        </header>
        <div class="inventory-product-table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Barcode</th><th>Product</th><th>Category</th><th>Selling price</th><th>Stock</th></tr></thead>
            <tbody>${state.products.map(p => `
              <tr data-product-id="${escapeHtml(p.id)}">
                <td>${escapeHtml(p.sku)}</td>
                <td>${escapeHtml(p.barcode)}</td>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.category)}</td>
                <td>${escapeHtml(p.selling_price)}</td>
                <td>${escapeHtml(p.quantity_on_hand)}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    render();
  }

  window.UniqueInventoryProductModule = Object.freeze({
    init,
    getState: () => ({ ...state, products: [...state.products] }),
    setProducts(products) {
      state.products = Array.isArray(products) ? products.slice() : [];
      render();
    },
    resetToEmpty() {
      state.products = [];
      render();
    },
  });
})();
