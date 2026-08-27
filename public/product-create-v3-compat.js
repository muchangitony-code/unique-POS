(() => {
  'use strict';

  function text(value) { return String(value ?? '').trim(); }

  function findProductName(form) {
    const candidates = [
      form.elements.name,
      form.elements.product_name,
      form.elements.productName,
      form.querySelector('#productName'),
      form.querySelector('#product_name'),
      form.querySelector('input[name="name"]'),
      form.querySelector('input[name="product_name"]'),
      form.querySelector('input[name="productName"]'),
      form.querySelector('[data-field="product-name"]')
    ];
    for (const field of candidates) {
      const value = text(field && field.value);
      if (value) return value;
    }
    return '';
  }

  function normalizeLegacyEditor() {
    const form = document.getElementById('productEditorForm');
    if (!form) return;
    const sku = form.elements.product_code || form.elements.sku;
    if (sku) {
      sku.required = false;
      sku.removeAttribute('required');
      sku.placeholder = 'Auto-generated';
    }
  }

  new MutationObserver(normalizeLegacyEditor).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('input', event => {
    const form = event.target && event.target.closest && event.target.closest('#productEditorForm');
    if (!form) return;
    const name = findProductName(form);
    if (name) {
      ['name', 'product_name', 'productName'].forEach(key => {
        const field = form.elements[key];
        if (field && field.setCustomValidity) field.setCustomValidity('');
      });
    }
  }, true);

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form || form.id !== 'productEditorForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const fd = new FormData(form);
    const productId = text(fd.get('product_id'));
    const name = findProductName(form);
    if (!name) {
      const field = form.elements.name || form.elements.product_name || form.elements.productName || form.querySelector('input,textarea');
      if (field) {
        field.focus();
        if (field.setCustomValidity) {
          field.setCustomValidity('Product name is required.');
          field.reportValidity();
          field.setCustomValidity('');
        }
      } else {
        alert('Product name is required.');
      }
      return;
    }

    const body = {
      name,
      product_name: name,
      sku: text(fd.get('sku')) || text(fd.get('product_code')),
      barcode: text(fd.get('barcode')),
      category: text(fd.get('category')),
      brand: text(fd.get('brand')),
      unit: text(fd.get('unit')) || text(fd.get('unit_of_measure')) || 'pcs',
      costPrice: Number(fd.get('costPrice') || fd.get('cost_price') || 0),
      sellingPrice: Number(fd.get('sellingPrice') || fd.get('selling_price') || 0),
      vatRate: Number(fd.get('vatRate') || fd.get('vat_rate') || 0),
      reorderLevel: Number(fd.get('reorderLevel') || fd.get('min_stock') || 0),
      supplier: text(fd.get('supplier')),
      description: text(fd.get('description'))
    };

    const url = productId ? '/api/v3/inventory/products/' + encodeURIComponent(productId) : '/api/v3/inventory/products';
    try {
      const response = await fetch(url, {
        method: productId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || data.message || 'Unable to save product.');
        return;
      }
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.add('hidden');
      window.location.hash = '#products';
      window.location.reload();
    } catch (error) {
      alert(error && error.message ? error.message : 'Unable to save product.');
    }
  }, true);

  normalizeLegacyEditor();
})();