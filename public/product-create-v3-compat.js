(() => {
  'use strict';

  const text = value => String(value ?? '').trim();

  function nameFrom(form) {
    const selectors = [
      '[name="name"]', '[name="product_name"]', '[name="productName"]',
      '#productName', '#product_name', '#name', '[data-field="product-name"]'
    ];
    for (const selector of selectors) {
      const field = form.querySelector(selector);
      const value = text(field && field.value);
      if (value) return value;
    }
    const labelled = Array.from(form.querySelectorAll('input[type="text"], input:not([type]), textarea'))
      .find(field => /product\s*name/i.test(field.name || '') || /product\s*name/i.test(field.id || '') || /product\s*name/i.test(field.closest('label')?.textContent || ''));
    return text(labelled && labelled.value);
  }

  function numberFrom(fd, ...keys) {
    for (const key of keys) {
      const value = fd.get(key);
      if (value !== null && text(value) !== '') return Number(value);
    }
    return 0;
  }

  async function save(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== 'productEditorForm' && form.id !== 'inventoryV3Form') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const name = nameFrom(form);
    if (!name) {
      const field = form.querySelector('[name="name"], [name="product_name"], [name="productName"], #productName, #product_name, #name');
      if (field) field.focus();
      alert('Product name is required.');
      return;
    }

    const fd = new FormData(form);
    const productId = text(fd.get('product_id') || form.dataset.productId);
    const payload = {
      name,
      product_name: name,
      productName: name,
      sku: text(fd.get('sku') || fd.get('product_code')),
      product_code: text(fd.get('sku') || fd.get('product_code')),
      barcode: text(fd.get('barcode')),
      category: text(fd.get('category')),
      brand: text(fd.get('brand')),
      unit: text(fd.get('unit') || fd.get('unit_of_measure')) || 'pcs',
      costPrice: numberFrom(fd, 'costPrice', 'cost_price'),
      cost_price: numberFrom(fd, 'costPrice', 'cost_price'),
      sellingPrice: numberFrom(fd, 'sellingPrice', 'selling_price'),
      selling_price: numberFrom(fd, 'sellingPrice', 'selling_price'),
      vatRate: numberFrom(fd, 'vatRate', 'vat_rate'),
      vat_rate: numberFrom(fd, 'vatRate', 'vat_rate'),
      reorderLevel: numberFrom(fd, 'reorderLevel', 'min_stock'),
      min_stock: numberFrom(fd, 'reorderLevel', 'min_stock'),
      supplier: text(fd.get('supplier')),
      description: text(fd.get('description'))
    };

    const url = productId ? `/api/v3/inventory/products/${encodeURIComponent(productId)}` : '/api/v3/inventory/products';
    const method = productId ? 'PATCH' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || `Unable to save product (${response.status}).`);
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.add('hidden');
      if (form.id === 'inventoryV3Form') location.reload();
      else location.hash = '#products';
    } catch (error) {
      alert(error.message || 'Unable to save product.');
    }
  }

  // Capture phase guarantees this compatibility layer runs before the legacy
  // delegated app.js submit handler, so only one request can be sent.
  document.addEventListener('submit', save, true);
})();