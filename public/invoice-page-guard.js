(function () {
  'use strict';
  if (window.__invoicePageGuardInstalled) return;
  window.__invoicePageGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);

  function isInvoiceList(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.pathname === '/api/invoices' && !/\/api\/invoices\/\d+/.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isInvoiceList(url)) return originalFetch(input, init);

    const u = new URL(url, window.location.href);
    u.searchParams.set('limit', '20');

    const requestInit = Object.assign({}, init || {});
    if (typeof AbortController !== 'undefined' && !requestInit.signal) {
      const controller = new AbortController();
      requestInit.signal = controller.signal;
      window.setTimeout(function () { controller.abort(); }, 15000);
    }

    return originalFetch(u.toString(), requestInit);
  };
})();
