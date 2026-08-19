(function () {
  'use strict';

  var TOKEN_KEY = 'uniquepos.token';
  var active = false;
  var requestSerial = 0;

  function isInvoiceView() {
    return new URLSearchParams(window.location.search).get('view') === 'invoices';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function root() { return document.getElementById('viewRoot'); }

  function setInvoiceUrl() {
    var url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('view', 'invoices');
    history.replaceState({ invoiceWorkspace: true }, '', url.pathname + '?' + url.searchParams.toString());
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
      '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Preparing invoice list</div></section>';
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
      return '<tr><td><strong>' + escapeHtml(invoice.invoice_number || invoice.invoiceNumber || '—') + '</strong></td>' +
        '<td>' + escapeHtml(invoice.customer_name || invoice.customerName || 'Walk-in Customer') + '</td>' +
        '<td>' + money(invoice.total) + '</td><td>' + money(invoice.amount_paid != null ? invoice.amount_paid : invoice.amountPaid) + '</td>' +
        '<td>' + money(invoice.balance_due != null ? invoice.balance_due : invoice.balanceDue) + '</td>' +
        '<td><span class="status-badge">' + escapeHtml(invoice.status || 'draft') + '</span></td>' +
        '<td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="open-document" data-type="invoice" data-id="' + id + '" data-paper="a4" data-title="Invoice">View</button>' +
        '<button class="btn btn-outline" type="button" data-action="download-document" data-type="invoice" data-id="' + id + '" data-paper="a4">PDF</button>' +
        '<button class="btn btn-outline" type="button" data-action="record-invoice-payment" data-id="' + id + '">Pay</button></div></td></tr>';
    }).join('');
  }

  function renderResult(invoices) {
    var target = root();
    if (!target || !active) return;
    var outstanding = invoices.reduce(function (sum, row) { return sum + (Number(row.balance_due != null ? row.balance_due : row.balanceDue) || 0); }, 0);
    var paid = invoices.filter(function (row) { return String(row.status || '').toLowerCase() === 'paid'; }).length;
    var value = invoices.reduce(function (sum, row) { return sum + (Number(row.total) || 0); }, 0);
    target.innerHTML = '<div class="invoice-workspace" data-invoice-workspace="1"><div class="overview-tiles">' +
      '<div class="metric-card"><span>Invoices</span><strong>' + invoices.length + '</strong></div>' +
      '<div class="metric-card"><span>Outstanding</span><strong>' + money(outstanding) + '</strong></div>' +
      '<div class="metric-card"><span>Paid</span><strong>' + paid + '</strong></div>' +
      '<div class="metric-card"><span>Total Value</span><strong>' + money(value) + '</strong></div></div>' +
      '<section class="card section-card"><div class="section-head"><div><h3>Invoice Register</h3><p>Latest invoice summaries.</p></div>' +
      '<button class="btn btn-outline" type="button" data-invoice-refresh="1"><i class="fa-solid fa-rotate"></i> Refresh</button></div>' +
      (invoices.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Invoice No.</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + renderRows(invoices) + '</tbody></table></div>' : '<div class="empty-state">No invoices found.</div>') + '</section></div>';
  }

  async function loadData(serial) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 8000) : null;
    try {
      var token = localStorage.getItem(TOKEN_KEY) || '';
      var response = await fetch('/api/invoices?limit=50', { method: 'GET', cache: 'no-store', signal: controller ? controller.signal : undefined, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!response.ok) throw new Error('Invoice service returned HTTP ' + response.status);
      var payload = await response.json();
      if (!active || serial !== requestSerial) return;
      renderResult(normalize(payload).slice(0, 50));
    } catch (error) {
      if (!active || serial !== requestSerial || !root()) return;
      root().innerHTML = '<section class="card section-card invoice-workspace" data-invoice-workspace="1"><div class="section-head"><div><h3>Invoices</h3><p>Invoice loading failed.</p></div></div><div class="empty-state"><strong>Unable to load invoices.</strong><p>' + escapeHtml(error && error.message ? error.message : 'Invoice service unavailable.') + '</p><button class="btn btn-primary" type="button" data-invoice-refresh="1">Retry</button></div></section>';
    } finally { if (timer) window.clearTimeout(timer); }
  }

  function render() {
    var target = root();
    if (!target) return;
    active = true;
    requestSerial += 1;
    var serial = requestSerial;
    setInvoiceUrl();
    setHeader();
    target.innerHTML = loadingMarkup();
    window.setTimeout(function () { if (active && serial === requestSerial) loadData(serial); }, 0);
  }

  function leave() { active = false; requestSerial += 1; }

  // Capture invoice navigation before app.js. No MutationObserver is used: the
  // previous observer reacted to app.js replacing viewRoot during startup and
  // could repeatedly call render(), aborting/restarting the invoice request and
  // leaving the screen permanently on "Preparing invoice list".
  document.addEventListener('click', function (event) {
    var routeButton = event.target && event.target.closest ? event.target.closest('[data-route]') : null;
    if (routeButton) {
      var route = routeButton.getAttribute('data-route');
      if (route === 'invoices') {
        event.preventDefault(); event.stopImmediatePropagation(); render(); return;
      }
      if (active) leave();
      return;
    }
    if (!active) return;
    var refresh = event.target && event.target.closest ? event.target.closest('[data-invoice-refresh]') : null;
    if (refresh) { event.preventDefault(); event.stopImmediatePropagation(); render(); }
  }, true);

  document.addEventListener('input', function (event) {
    if (active && event.target && event.target.id === 'globalSearchInput') event.stopImmediatePropagation();
  }, true);

  document.addEventListener('change', function (event) {
    if (active && event.target && (event.target.id === 'branchSelect' || event.target.id === 'userSelect')) event.stopImmediatePropagation();
  }, true);

  if (window.location.hash.replace(/^#/, '') === 'invoices') {
    var safeUrl = new URL(window.location.href); safeUrl.hash = ''; safeUrl.searchParams.set('view', 'invoices');
    history.replaceState({ invoiceWorkspace: true }, '', safeUrl.pathname + '?' + safeUrl.searchParams.toString());
  }

  if (isInvoiceView()) window.setTimeout(render, 250);
})();
