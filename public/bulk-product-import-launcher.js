(() => {
  'use strict';

  // The POS has a first-class bulk-import workflow in public/app.js. This launcher
  // deliberately does not perform API requests itself: a second API client here
  // previously bypassed the application's authenticated request path and caused
  // every row to fail with 401. The Products-page shortcut now hands off to the
  // native Bulk Import route, which uses the same token, branch scope and API
  // client as the rest of the POS.
  function install() {
    const add = document.querySelector('[data-testid="button-add-product"]');
    if (!add || document.querySelector('[data-testid="button-bulk-add-products"]')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = 'button-bulk-add-products';
    button.textContent = 'Bulk Add Products';
    button.style.cssText = 'height:40px;padding:0 16px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;font-weight:600;cursor:pointer';
    button.addEventListener('click', () => {
      location.hash = 'bulk-import';
    });

    add.parentElement.insertBefore(button, add);
    return true;
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', install);
  install();
})();
