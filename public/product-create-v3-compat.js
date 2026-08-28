(() => {
  'use strict';

  // Compatibility bridge for the legacy product editor only.
  // Inventory V3 owns #inventoryV3Form and its edit handler already knows the
  // exact product ID. Intercepting that form here created a competing save path
  // which could fall back to POST and trigger a false duplicate SKU/barcode error.
  const text = value => String(value ?? '').trim();

  function nameFrom(form) {
    const selectors = ['[name="name"]', '[name="product_name"]', '[name="productName"]', '#productName', '#product_name', '#name', '[data-field="product-name"]'];
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

  function resolveProductId(form, fd) {
    const direct = [fd.get('product_id'), fd.get('productId'), fd.get('id'), form.dataset.productId, form.dataset.product_id, form.dataset.id];
    for (const value of direct) {
      const id = text(value);
      if (/^\d+$/.test(id) && Number(id) > 0) return id;
    }
    const action = text(form.getAttribute('action'));
    const match = action.match(/(?:products|product)\/(\d+)(?:\D|$)/i);
    return match ? match[1] : '';
  }

  async function saveLegacyProduct(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'productEditorForm') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const name = nameFrom(form);
    if (!name) return alert('Product name is required.');
    const fd = new FormData(form);
    const productId = resolveProductId(form, fd);
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
    const response = await fetch(url, { method: productId ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify(payload), cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return alert(data.error || data.message || 'Unable to save product.');
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
    location.hash = '#products';
  }

  document.addEventListener('submit', saveLegacyProduct, true);
})();
