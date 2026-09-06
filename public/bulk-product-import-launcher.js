(() => {
  'use strict';

  // Reuse the POS's native bulk importer. Do not navigate to a synthetic route
  // and do not create a second API client: the application's existing action
  // handler preserves authentication, branch scope and import validation.
  function install() {
    const add = document.querySelector('[data-testid="button-add-product"]');
    if (!add) return false;

    let button = document.querySelector('[data-testid="button-bulk-add-products"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = 'button-bulk-add-products';
      button.textContent = 'Bulk Add Products';
      button.style.cssText = 'height:40px;padding:0 16px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;font-weight:600;cursor:pointer';
      add.parentElement.insertBefore(button, add);
    }

    // The native delegated handler in public/app.js handles this action.
    button.dataset.action = 'bulk-import-products';
    button.removeAttribute('onclick');
    return true;
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', install);
  install();
})();
