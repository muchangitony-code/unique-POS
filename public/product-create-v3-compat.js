(() => {
  'use strict';
  function text(value) { return String(value ?? '').trim(); }
  function normalizeLegacyEditor() {
    const form = document.getElementById('productEditorForm');
    if (!form || form.dataset.v3Compat === '1') return;
    form.dataset.v3Compat = '1';
    const sku = form.elements.product_code;
    if (sku) { sku.required = false; sku.removeAttribute('required'); sku.placeholder = 'Auto-generated'; }
  }
  new MutationObserver(normalizeLegacyEditor).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form || form.id !== 'productEditorForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const fd = new FormData(form);
    const productId = text(fd.get('product_id'));
    const name = text(fd.get('name')) || text(fd.get('product_name'));
    if (!name) { alert('Product name is required.'); return; }
    const body = {
      name,
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
    const response = await fetch(url, { method: productId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { alert(data.error || 'Unable to save product.'); return; }
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
    window.location.hash = '#products';
    window.location.reload();
  }, true);
  normalizeLegacyEditor();
})();
