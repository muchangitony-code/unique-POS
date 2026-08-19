(function () {
  'use strict';

  // The main POS still requests the legacy invoice collection endpoint.
  // That endpoint can hang in production, while the paginated endpoint is
  // the supported invoice-register path. Rewrite only that collection read.
  var originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var rawUrl = typeof input === 'string' ? input : (input && input.url);
    if (!rawUrl) return originalFetch(input, init);

    var url;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch (_) {
      return originalFetch(input, init);
    }

    if (
      url.origin === window.location.origin &&
      url.pathname === '/api/invoices' &&
      url.searchParams.has('limit') &&
      !url.searchParams.has('offset')
    ) {
      var limit = Number(url.searchParams.get('limit')) || 20;
      url.pathname = '/api/invoices/paginated';
      url.searchParams.delete('limit');
      url.searchParams.delete('offset');
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', String(Math.min(Math.max(limit, 1), 120)));
      return originalFetch(url.toString(), init);
    }

    return originalFetch(input, init);
  };
})();
