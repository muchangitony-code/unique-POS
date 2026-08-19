(function () {
  'use strict';
  if (window.__invoiceRouteFallbackInstalled) return;
  window.__invoiceRouteFallbackInstalled = true;

  var TOKEN_KEY = 'uniquepos.token';
  var originalHashChange = window.location.hash;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function normalize(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.invoices)) return payload.invoices;
    return [];
  }

  function showLoading(root) {
    root.innerHTML = '<section class="card section-card"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading invoices…</div></section>';
  }

  async function renderInvoicesFallback() {
    var root = document.getElementById('viewRoot');
    if (!root) return;
    var title = document.getElementById('pageTitle');
    var subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Invoices';
    if (subtitle) subtitle.textContent = 'Manage A4 tax invoices, payments and receivables.';
    showLoading(root);

    try {
      var token = localStorage.getItem(TOKEN_KEY) || '';
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) window.setTimeout(function () { controller.abort(); }, 12000);
      var url = '/api/invoices?limit=20&_invoice_fallback=' + Date.now();
      var response = await fetch(url, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      if (!response.ok) throw new Error('Invoice service returned HTTP ' + response.status);
      var invoices = normalize(await response.json());
      var outstanding = invoices.reduce(function (sum, item) { return sum + (Number(item.balance_due) || 0); }, 0);
      var paid = invoices.filter(function (item) { return String(item.status || '').toLowerCase() === 'paid'; }).length;
      var value = invoices.reduce(function (sum, item) { return sum + (Number(item.total) || 0); }, 0);

      root.innerHTML = [
        '<div class="overview-tiles">',
          '<div class="metric-card"><span>Invoices</span><strong>' + invoices.length + '</strong></div>',
          '<div class="metric-card"><span>Outstanding</span><strong>' + money(outstanding) + '</strong></div>',
          '<div class="metric-card"><span>Paid</span><strong>' + paid + '</strong></div>',
          '<div class="metric-card"><span>Value</span><strong>' + money(value) + '</strong></div>',
        '</div>',
        '<section class="card section-card">',
          '<div class="section-head"><div><h3>Invoices</h3><p>Latest invoices. The list is deliberately lightweight so the page remains responsive.</p></div></div>',
          invoices.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Invoice No</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + invoices.map(function (invoice) {
            var id = esc(invoice.id);
            return '<tr><td><strong>' + esc(invoice.invoice_number || '—') + '</strong></td>' +
              '<td>' + esc(invoice.customer_name || 'Walk-in Customer') + '</td>' +
              '<td>' + money(invoice.total) + '</td>' +
              '<td>' + money(invoice.amount_paid) + '</td>' +
              '<td>' + money(invoice.balance_due) + '</td>' +
              '<td>' + esc(invoice.status || 'sent') + '</td>' +
              '<td><div class="table-actions"><button class="btn btn-outline" type="button" data-action="open-document" data-type="invoice" data-id="' + id + '" data-paper="a4" data-title="Invoice">View</button><button class="btn btn-outline" type="button" data-action="download-document" data-type="invoice" data-id="' + id + '" data-paper="a4">PDF</button><button class="btn btn-outline" type="button" data-action="record-invoice-payment" data-id="' + id + '">Pay</button></div></td>' +
              '</tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>No invoices found.</div>',
        '</section>'
      ].join('');
    } catch (error) {
      root.innerHTML = '<section class="card section-card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><strong>Unable to load invoices.</strong><p>' + esc(error && error.message ? error.message : 'Invoice service unavailable.') + '</p><button class="btn btn-primary" type="button" id="invoiceFallbackRetry">Retry</button></div></section>';
      var retry = document.getElementById('invoiceFallbackRetry');
      if (retry) retry.addEventListener('click', renderInvoicesFallback);
    }
  }

  function isInvoicesRoute() {
    return String(window.location.hash || '').replace(/^#/, '') === 'invoices';
  }

  window.addEventListener('hashchange', function (event) {
    if (!isInvoicesRoute()) return;
    event.stopImmediatePropagation();
    renderInvoicesFallback();
  }, true);

  if (isInvoicesRoute()) {
    window.setTimeout(renderInvoicesFallback, 0);
  }
})();
