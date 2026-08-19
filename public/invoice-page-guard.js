(function () {
  'use strict';
  if (window.__invoicePageGuardInstalled) return;
  window.__invoicePageGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);

  function isInvoiceList(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.pathname === '/api/invoices';
    } catch (_) {
      return false;
    }
  }

  // Keep invoice list requests bounded and uncached. Do not alter fetch
  // behaviour for any other API endpoint.
  window.fetch = function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isInvoiceList(url)) return originalFetch(input, init);

    const u = new URL(url, window.location.href);
    u.searchParams.set('limit', '20');
    u.searchParams.set('_invoice_page', String(Date.now()));

    const requestInit = Object.assign({}, init || {}, { cache: 'no-store' });

    if (typeof AbortController !== 'undefined' && !requestInit.signal) {
      const controller = new AbortController();
      requestInit.signal = controller.signal;
      window.setTimeout(function () { controller.abort(); }, 15000);
    }

    return originalFetch(u.toString(), requestInit);
  };
})();
