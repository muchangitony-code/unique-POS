(function () {
  'use strict';
  var TOKEN_KEY = 'uniquepos.token';
  var PAGE_SIZE = 20;
  var REQUEST_TIMEOUT_MS = 15000;
  var state = { page: 1, total: 0, pages: 1, query: '', status: '', invoices: [], loading: false };
  var root = function () { return document.getElementById('viewRoot'); };
  function isInvoiceRoute() { return String(location.hash || '').replace(/^#/, '') === 'invoices'; }
  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;'); }
  function money(value) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(value) || 0); }
  function normalize(payload) { return payload && Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : []; }
  function authHeaders(extra) { var headers = Object.assign({}, extra || {}); if (token()) headers.Authorization = 'Bearer ' + token(); return headers; }
  async function request(url, options) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var opts = Object.assign({}, options || {}, { headers: authHeaders((options || {}).headers) });
    if (controller) opts.signal = controller.signal;
    try {
      var response = await fetch(url, opts);
      var body = await response.text();
      var payload = body ? (function () { try { return JSON.parse(body); } catch (_) { return { message: body }; } })() : null;
      if (!response.ok) throw new Error((payload && (payload.error || payload.message)) || ('Request failed: HTTP ' + response.status));
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Invoice request timed out after 15 seconds. The server is not responding to the invoice query.');
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }
  function renderShell() { var target = root(); if (!target) return; target.innerHTML = '<div class="invoice-module" data-invoice-module="1"><div class="invoice-module__toolbar"><div><span class="invoice-eyebrow">Receivables</span><h2>Invoice Register</h2><p>Paginated invoice records with independent detail, payment and PDF operations.</p></div><div class="invoice-module__controls"><input id="invoiceModuleSearch" type="search" placeholder="Search invoice or customer" value="' + escapeHtml(state.query) + '"><select id="invoiceModuleStatus"><option value="">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select><button type="button" class="btn btn-outline" data-invoice-op="refresh">Refresh</button></div></div><div id="invoiceModuleBody"></div></div>'; bindRootEvents(target); }
  function bindRootEvents(target) { var search = target.querySelector('#invoiceModuleSearch'); var status = target.querySelector('#invoiceModuleStatus'); if (search) search.addEventListener('input', function () { state.query = search.value.trim(); state.page = 1; loadRegister(); }); if (status) status.addEventListener('change', function () { state.status = status.value; state.page = 1; loadRegister(); }); target.addEventListener('click', function (event) { var button = event.target.closest('[data-invoice-op]'); if (!button) return; var op = button.getAttribute('data-invoice-op'); if (op === 'refresh') loadRegister(); if (op === 'prev' && state.page > 1) { state.page -= 1; loadRegister(); } if (op === 'next' && state.page < state.pages) { state.page += 1; loadRegister(); } if (op === 'detail') openDetail(button.getAttribute('data-id')); if (op === 'payment') openPayment(button.getAttribute('data-id')); if (op === 'pdf') downloadPdf(button.getAttribute('data-id')); if (op === 'preview') previewPdf(button.getAttribute('data-id')); }); }
  async function loadRegister() {
    var body = document.getElementById('invoiceModuleBody');
    if (!body || !isInvoiceRoute() || state.loading) return;
    state.loading = true;
    body.innerHTML = '<div class="invoice-module__loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading invoice register…</div>';
    try {
      var legacyParams = new URLSearchParams({ page: String(state.page), page_size: String(PAGE_SIZE) });
      if (state.query) legacyParams.set('search', state.query);
      if (state.status) legacyParams.set('status', state.status);
      var payload;
      try {
        payload = await request('/api/invoices/paginated?' + legacyParams.toString());
      } catch (legacyError) {
        var params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((state.page - 1) * PAGE_SIZE) });
        if (state.query) params.set('search', state.query);
        if (state.status) params.set('status', state.status);
        payload = await request('/api/invoices?' + params.toString());
      }
      state.invoices = normalize(payload);
      state.total = Number(payload && (payload.total || payload.count)) || state.invoices.length;
      state.pages = Math.max(1, Number(payload && payload.pages) || Math.ceil(state.total / PAGE_SIZE));
      renderRegister(body);
    } catch (error) {
      body.innerHTML = '<div class="invoice-module__error"><strong>Unable to load invoices.</strong><p>' + escapeHtml(error.message) + '</p><button class="btn btn-primary" type="button" data-invoice-op="refresh">Retry</button></div>';
    } finally {
      state.loading = false;
    }
  }
  function renderRegister(body) { var rows = state.invoices.map(function (invoice) { return '<tr><td><strong>' + escapeHtml(invoice.invoice_number || '—') + '</strong></td><td>' + escapeHtml(invoice.customer_name || 'Walk-in Customer') + '</td><td>' + money(invoice.total) + '</td><td>' + money(invoice.amount_paid) + '</td><td>' + money(invoice.balance_due) + '</td><td><span class="badge">' + escapeHtml(invoice.status || 'draft') + '</span></td><td><div class="invoice-row-actions"><button type="button" class="btn btn-outline" data-invoice-op="detail" data-id="' + escapeHtml(invoice.id) + '">Detail</button><button type="button" class="btn btn-outline" data-invoice-op="payment" data-id="' + escapeHtml(invoice.id) + '">Payment</button><button type="button" class="btn btn-outline" data-invoice-op="preview" data-id="' + escapeHtml(invoice.id) + '">Preview</button><button type="button" class="btn btn-outline" data-invoice-op="pdf" data-id="' + escapeHtml(invoice.id) + '">PDF</button></div></td></tr>'; }).join(''); body.innerHTML = (rows ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Operations</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="invoice-module__empty">No invoices match the current filter.</div>') + '<div class="invoice-module__pagination"><span>Page ' + state.page + ' of ' + state.pages + ' · ' + state.total + ' invoices</span><div><button type="button" class="btn btn-outline" data-invoice-op="prev"' + (state.page <= 1 ? ' disabled' : '') + '>Previous</button><button type="button" class="btn btn-outline" data-invoice-op="next"' + (state.page >= state.pages ? ' disabled' : '') + '>Next</button></div></div>'; }
  async function openDetail(id) { try { var payload = await request('/api/invoices/' + encodeURIComponent(id)); var invoice = payload && payload.invoice ? payload.invoice : payload; showDialog('Invoice Detail', renderDetail(invoice)); } catch (error) { showDialog('Invoice Detail', '<div class="invoice-module__error">' + escapeHtml(error.message) + '</div>'); } }
  function renderDetail(invoice) { if (!invoice) return '<div class="invoice-module__empty">Invoice not found.</div>'; var items = Array.isArray(invoice.items) ? invoice.items : []; return '<div class="invoice-detail"><div class="invoice-detail__grid"><div><span>Invoice</span><strong>' + escapeHtml(invoice.invoice_number || '—') + '</strong></div><div><span>Customer</span><strong>' + escapeHtml(invoice.customer_name || 'Walk-in Customer') + '</strong></div><div><span>Status</span><strong>' + escapeHtml(invoice.status || 'draft') + '</strong></div><div><span>Balance</span><strong>' + money(invoice.balance_due) + '</strong></div></div>' + (items.length ? '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>' + items.map(function (item) { return '<tr><td>' + escapeHtml(item.product_name || item.description || 'Item') + '</td><td>' + escapeHtml(item.quantity) + '</td><td>' + money(item.unit_price) + '</td><td>' + money(item.total) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</div>'; }
  async function openPayment(id) { var amount = window.prompt('Payment amount'); if (!amount) return; var method = window.prompt('Payment method (cash, mpesa, bank_transfer, card, credit)', 'cash'); if (!method) return; var reference = window.prompt('Payment reference (optional)', '') || ''; try { await request('/api/invoices/' + encodeURIComponent(id) + '/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), method: method, reference: reference, notes: '' }) }); showDialog('Payment Recorded', '<div class="invoice-module__success">Payment recorded successfully.</div>'); loadRegister(); } catch (error) { showDialog('Payment Failed', '<div class="invoice-module__error">' + escapeHtml(error.message) + '</div>'); } }
  async function previewPdf(id) { try { var payload = await request('/api/documents/invoice/' + encodeURIComponent(id) + '/preview?paper=a4'); if (!payload || !payload.html) throw new Error('The server returned an empty invoice preview.'); showDialog('Invoice Preview', '<iframe class="invoice-module__frame" title="Invoice Preview"></iframe>'); var frame = document.querySelector('.invoice-module__frame'); if (frame) frame.srcdoc = payload.html; } catch (error) { showDialog('Invoice Preview', '<div class="invoice-module__error">' + escapeHtml(error.message) + '</div>'); } }
  async function downloadPdf(id) { try { var response = await fetch('/api/documents/invoice/' + encodeURIComponent(id) + '/pdf?paper=a4', { headers: authHeaders({ Accept: 'application/pdf' }) }); if (!response.ok) throw new Error('PDF request failed: HTTP ' + response.status); var blob = await response.blob(); if (!blob.size) throw new Error('Generated PDF is empty.'); var url = URL.createObjectURL(blob); var link = document.createElement('a'); link.href = url; link.download = 'invoice-' + id + '.pdf'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500); } catch (error) { showDialog('Invoice PDF', '<div class="invoice-module__error">' + escapeHtml(error.message) + '</div>'); } }
  function showDialog(title, html) { var existing = document.getElementById('invoiceModuleDialog'); if (existing) existing.remove(); var dialog = document.createElement('div'); dialog.id = 'invoiceModuleDialog'; dialog.className = 'invoice-module-dialog'; dialog.innerHTML = '<div class="invoice-module-dialog__window"><div class="invoice-module-dialog__head"><h3>' + escapeHtml(title) + '</h3><button type="button" data-invoice-dialog-close aria-label="Close">×</button></div><div class="invoice-module-dialog__body">' + html + '</div></div>'; document.body.appendChild(dialog); dialog.addEventListener('click', function (event) { if (event.target === dialog || event.target.closest('[data-invoice-dialog-close]')) dialog.remove(); }); }
  function mount() { if (!isInvoiceRoute()) return; if (!root()) return; renderShell(); loadRegister(); }
  window.addEventListener('hashchange', mount);
  window.addEventListener('load', function () { if (isInvoiceRoute()) mount(); });
})();
