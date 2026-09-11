(() => {
  'use strict';
  const text = v => String(v ?? '').trim();
  function apply() {
    const form = document.getElementById('productEditorForm');
    if (!form) return;
    const field = form.querySelector('[name="product_code"], [name="sku"]');
    if (!field) return;
    field.removeAttribute('required');
    field.readOnly = true;
    field.placeholder = 'Generated automatically';
    field.title = 'The POS generates this code automatically when the product is saved.';
    const label = field.closest('label');
    const span = label && label.querySelector('span');
    if (span) span.textContent = 'SKU / Item Code (Automatic)';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  new MutationObserver(apply).observe(document.body, {childList:true, subtree:true});
})();
