(function () {
  'use strict';

  var DEMO_VALUES = new Set([
    '125,450', '38,750', '45,200', '32,600', '36', '12', '58,900', '18', '7',
    'KES 125,450.00', 'KES 38,750.00', 'KES 45,200.00', 'KES 32,600.00', 'KES 58,900.00'
  ]);

  function cleanStaticShell() {
    var branch = document.getElementById('branchSelect');
    if (branch && branch.options.length === 1 && branch.options[0].text === 'Main Branch') {
      branch.options[0].text = 'Select branch';
      branch.options[0].value = '';
    }
    var user = document.getElementById('userSelect');
    if (user && user.options.length === 1 && user.options[0].text === 'Admin') {
      user.options[0].text = 'Select user';
      user.options[0].value = '';
    }
    var clockDate = document.getElementById('topbarDate');
    if (clockDate && clockDate.textContent.trim() === 'Saturday, 10 Aug 2026') clockDate.textContent = '—';
    var clockTime = document.getElementById('topbarTime');
    if (clockTime && clockTime.textContent.trim() === '12:45 PM') clockTime.textContent = '—';
    document.querySelectorAll('[data-action="notify"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('#modalTitle').forEach(function (el) {
      if (el.textContent.trim() === 'Modal') el.textContent = '';
    });
    document.querySelectorAll('*').forEach(function (el) {
      if (el.children.length) return;
      var text = el.textContent.trim();
      if (text === '+254 700 000000' || text === 'sales@uniquesolarkenya.co.ke') {
        el.textContent = '—';
        el.setAttribute('title', 'Business contact details not configured');
      }
    });
  }

  function ensureInventoryBulkAddButton() {
    var route = String(location.hash || '').replace(/^#/, '').split('?')[0];
    if (route !== 'inventory') return;
    var root = document.getElementById('viewRoot');
    if (!root) return;
    var toolbar = root.querySelector('.module-toolbar');
    if (!toolbar) return;
    if (toolbar.querySelector('[data-action="bulk-add-products"]')) return;
    var group = toolbar.querySelector('.inline-group');
    if (!group) {
      group = document.createElement('div');
      group.className = 'inline-group';
      toolbar.prepend(group);
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.setAttribute('data-action', 'bulk-add-products');
    button.innerHTML = '<i class="fa-solid fa-file-import"></i> Bulk Add Products';
    var productListButton = group.querySelector('[data-route="products"]');
    if (productListButton) group.insertBefore(button, productListButton);
    else group.appendChild(button);
  }

  function bindBulkAddAction() {
    if (window.__uniquePosBulkAddBound) return;
    window.__uniquePosBulkAddBound = true;
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="bulk-add-products"]');
      if (!button) return;
      event.preventDefault();
      // Invoke the first-class importer in public/app.js through its native action.
      button.setAttribute('data-action', 'bulk-import-products');
      button.click();
    });
  }

  function neutralizeDemoDashboard() {
    var route = String(location.hash || '').replace(/^#/, '').split('?')[0];
    if (route !== 'dashboard') return;
    var root = document.getElementById('viewRoot');
    if (!root) return;
    root.querySelectorAll('*').forEach(function (el) {
      if (el.children.length) return;
      var text = el.textContent.trim();
      if (DEMO_VALUES.has(text)) {
        el.textContent = '—';
        el.setAttribute('title', 'Live value not available');
      }
    });
  }

  var scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      cleanStaticShell();
      ensureInventoryBulkAddButton();
      neutralizeDemoDashboard();
    }, 0);
  }

  bindBulkAddAction();
  run();
  window.addEventListener('hashchange', run);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();
