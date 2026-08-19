(function () {
  'use strict';

  // The legacy invoice route is deliberately bypassed. Railway shows the
  // invoice API returning 200 responses in milliseconds; the browser freeze
  // happens after the response, inside the monolithic client render path.
  // This controller owns invoice navigation and keeps the invoice UI small,
  // paginated and asynchronous.

  var TOKEN_KEY = 'uniquepos.token';
  var active = false;
  var rendering = false;
  var observer = null;

  function isInvoiceView() {
    return new URLSearchParams(window.location.search).get('view') === 'invoices';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(value) {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency', currency: 'KES', maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function setInvoiceUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set('view', 'invoices');
    history.replaceState({ invoiceWorkspace: true }, '', url.pathname + '?' + url.searchParams.toString() + url.hash);
  }

  function root() {
    return document.getElementById('viewRoot');
  }

  function setHeader() {
    var title = document.getElementById('pageTitle');
    var subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Invoices';
    if (subtitle) subtitle.textContent = 'Manage A4 invoices, payments and receivables.';
  }

  function loadingMarkup() {
    return '<section class="card section-card invoice-workspace" data-invoice-workspace="1">' +
      '<div class="section-head"><div><h3>Invoices</h3><p>Loading invoice summaries…</p></div></div>' +
      '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Preparing invoice list</div>' +
      '</section>';
  }

  function normalize(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.invoices)) return payload.invoices;
    return [];
  }

  function renderRows(invoices) {
    return invoices.map(function (invoice) {
      var id = escapeHtml(invoice.id);
      return '<tr>' +
        '<td><strong>' + escapeHtml(invoice.invoice_number || '—') + '</strong></td>' +
        '<td>' + escapeHtml(invoice.customer_name || 'Walk-in Customer') + '</td>' +
        '<td>' + money(invoice.total) + '</td>' +
        '<td>' + money(invoice.amount_paid) + '</td>' +
        '<td>' + money(invoice.balance_due) + '</td>' +
        '<td><span class="status-badge">' + escapeHtml(invoice.status || 'draft') + '</span></td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn-outline" type="button" data-action="open-document" data-type="invoice" data-id="' + id + '" data-paper="a4" data-title="Invoice">View</button>' +
          '<button class="btn btn-outline" type="button" data-action="download-document" data-type="invoice" data-id="' + id + '" data-paper="a4">PDF</button>' +
          '<button class="btn btn-outline" type="button" data-action="record-invoice-payment" data-id="' + id + '">Pay</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  async function loadData() {
    var target = root();
    if (!target || !active) return;

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 8000) : null;
    try {
      var token = localStorage.getItem(TOKEN_KEY) || '';
      var response = await fetch('/api/invoices?limit=50', {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      if (!response.ok) throw new Error('Invoice service returned HTTP ' + response.status);
      var invoices = normalize(await response.json()).slice(0, 50);
      if (!active || !root()) return;

      var outstanding = invoices.reduce(function (sum, row) { return sum + (Number(row.balance_due) || 0); }, 0);
      var paid = invoices.filter(function (row) { return String(row.status || '').toLowerCase() === 'paid'; }).length;
      var value = invoices.reduce(function (sum, row) { return sum + (Number(row.total) || 0); }, 0);

      root().innerHTML = '<div class="invoice-workspace" data-invoice-workspace="1">' +
        '<div class="overview-tiles">' +
          '<div class="metric-card"><span>Invoices</span><strong>' + invoices.length + '</strong></div>' +
          '<div class="metric-card"><span>Outstanding</span><strong>' + money(outstanding) + '</strong></div>' +
          '<div class="metric-card"><span>Paid</span><strong>' + paid + '</strong></div>' +
          '<div class="metric-card"><span>Total Value</span><strong>' + money(value) + '</strong></div>' +
        '</div>' +
        '<section class="card section-card">' +
          '<div class="section-head"><div><h3>Invoice Register</h3><p>Latest invoice summaries. Invoice items are loaded only when an individual document is opened.</p></div>' +
          '<button class="btn btn-outline" type="button" data-invoice-refresh="1"><i class="fa-solid fa-rotate"></i> Refresh</button></div>' +
          (invoices.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Invoice No.</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + renderRows(invoices) + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>No invoices found.</div>') +
        '</section>' +
      '</div>';
    } catch (error) {
      if (!active || !root()) return;
      root().innerHTML = '<section class="card section-card invoice-workspace" data-invoice-workspace="1">' +
        '<div class="section-head"><div><h3>Invoices</h3><p>The invoice workspace remains responsive even when the service is unavailable.</p></div></div>' +
        '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><strong>Unable to load invoices.</strong><p>' + escapeHtml(error && error.message ? error.message : 'Invoice service unavailable.') + '</p><button class="btn btn-primary" type="button" data-invoice-refresh="1">Retry</button></div>' +
      '</section>';
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function render() {
    if (rendering) return;
    var target = root();
    if (!target) return;
    rendering = true;
    active = true;
    setInvoiceUrl();
    setHeader();
    target.innerHTML = loadingMarkup();
    rendering = false;

    // Paint the lightweight shell first. Network and table work start only
    // after the browser has had an opportunity to paint/respond to input.
    window.requestAnimationFrame(function () {
      if (active) loadData();
    });
  }

  function leave() {
    active = false;
    if (observer) { observer.disconnect(); observer = null; }
  }

  function installObserver() {
    var target = root();
    if (!target || observer) return;
    observer = new MutationObserver(function () {
      if (!active || rendering) return;
      if (!target.querySelector('[data-invoice-workspace="1"]')) {
        window.setTimeout(function () { if (active) render(); }, 0);
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  // Capture before the monolithic app.js delegates. The legacy invoice route
  // is never entered, so its render path cannot freeze the page.
  document.addEventListener('click', function (event) {
    var routeButton = event.target && event.target.closest ? event.target.closest('[data-route]') : null;
    if (routeButton) {
      var route = routeButton.getAttribute('data-route');
      if (route === 'invoices') {
        event.preventDefault();
        event.stopImmediatePropagation();
        render();
        installObserver();
        return;
      }
      if (active) leave();
      return;
    }

    if (!active) return;
    var refresh = event.target && event.target.closest ? event.target.closest('[data-invoice-refresh]') : null;
    if (refresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
      render();
      installObserver();
    }
  }, true);

  // Prevent global app handlers from replacing the isolated invoice view while
  // the user searches or changes branch/user selectors.
  document.addEventListener('input', function (event) {
    if (!active) return;
    if (event.target && event.target.id === 'globalSearchInput') {
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('change', function (event) {
    if (!active) return;
    if (event.target && (event.target.id === 'branchSelect' || event.target.id === 'userSelect')) {
      event.stopImmediatePropagation();
    }
  }, true);

  // If someone opens the old #invoices URL directly, convert it to the safe
  // workspace before app.js initializes its own router.
  if (window.location.hash.replace(/^#/, '') === 'invoices') {
    var safeUrl = new URL(window.location.href);
    safeUrl.hash = '';
    safeUrl.searchParams.set('view', 'invoices');
    history.replaceState({ invoiceWorkspace: true }, '', safeUrl.pathname + '?' + safeUrl.searchParams.toString());
  }

  if (isInvoiceView()) {
    window.setTimeout(function () {
      render();
      installObserver();
    }, 0);
  }
})();
