(function () {
  'use strict';

  var TOKEN_KEY = 'uniquepos.token';
  var mounted = false;
  var lastRoute = '';

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function money(value) { return 'KES ' + Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function api(url, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': token() ? 'Bearer ' + token() : '' }, options.headers || {});
    return fetch(url, options).then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { if (!r.ok) throw new Error(body.error || body.message || 'Request failed'); return body; }); });
  }
  function list(value) { return Array.isArray(value) ? value : (value && Array.isArray(value.data) ? value.data : (value && Array.isArray(value.items) ? value.items : [])); }
  function isQuotationRoute() { return location.hash.replace(/^#/, '').split('?')[0] === 'quotations'; }
  function root() { return document.getElementById('viewRoot'); }

  function mount() {
    if (!isQuotationRoute() || !root()) return;
    var routeKey = location.hash;
    if (mounted && routeKey === lastRoute) return;
    mounted = true; lastRoute = routeKey;
    loadQuotations();
  }

  async function loadQuotations() {
    try {
      var data = await api('/api/quotations');
      var quotes = list(data);
      renderRegister(quotes);
    } catch (error) {
      var el = root();
      if (el) el.insertAdjacentHTML('beforeend', '<div class="card section-card quotation-edit-error"><strong>Unable to load quotations.</strong><p>' + esc(error.message) + '</p></div>');
    }
  }

  function renderRegister(quotes) {
    var el = root();
    if (!el) return;
    var html = '<section class="card section-card quotation-edit-register"><div class="section-head"><div><h3>Quotation Register</h3><p>Edit quotations before they are converted to invoices.</p></div><div class="inline-group"><button class="btn btn-outline" type="button" id="quotationEditRefresh">Refresh</button></div></div>';
    if (!quotes.length) html += '<div class="empty-state"><strong>No quotations found.</strong><p>Create a quotation first.</p></div></section>';
    else {
      html += '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Quotation No.</th><th>Customer</th><th>Date</th><th>Valid Until</th><th>Status</th><th>Total</th><th>Action</th></tr></thead><tbody>';
      quotes.forEach(function (q) {
        var locked = String(q.status || '').toLowerCase() === 'converted';
        html += '<tr><td><strong>' + esc(q.quotation_number || q.quotationNumber || ('Q-' + q.id)) + '</strong></td><td>' + esc(q.customer_name || q.customerName || 'Walk-in Customer') + '</td><td>' + esc(dateText(q.created_at || q.createdAt)) + '</td><td>' + esc(dateText(q.valid_until || q.validUntil)) + '</td><td>' + esc(q.status || 'draft') + '</td><td>' + money(q.total) + '</td><td><div class="inline-group">' + (locked ? '<button class="btn btn-outline" disabled title="Converted quotations cannot be edited">Converted</button>' : '<button class="btn btn-primary" type="button" data-quotation-edit="' + esc(q.id) + '"><i class="fa-solid fa-pen-to-square"></i> Edit</button>') + '</div></td></tr>';
      });
      html += '</tbody></table></div></section>';
    }
    el.innerHTML = html;
    var refresh = document.getElementById('quotationEditRefresh');
    if (refresh) refresh.addEventListener('click', loadQuotations);
    el.querySelectorAll('[data-quotation-edit]').forEach(function (button) { button.addEventListener('click', function () { openEditor(button.getAttribute('data-quotation-edit')); }); });
  }

  function dateText(value) { if (!value) return '—'; var d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString('en-GB'); }
  function dateInput(value) { if (!value) return ''; var d = new Date(value); if (Number.isNaN(d.getTime())) return String(value).slice(0, 10); return d.toISOString().slice(0, 10); }

  async function openEditor(id) {
    try {
      var result = await Promise.all([api('/api/quotations/' + encodeURIComponent(id)), api('/api/customers')]);
      var q = result[0], customers = list(result[1]);
      renderEditor(q, customers);
    } catch (error) {
      alert('Unable to open quotation: ' + error.message);
    }
  }

  function renderEditor(q, customers) {
    var old = document.getElementById('quotationEditOverlay');
    if (old) old.remove();
    var customerId = q.customer_id == null ? (q.customerId == null ? '' : q.customerId) : q.customer_id;
    var items = list(q.items);
    var html = '<div id="quotationEditOverlay" class="modal-overlay" style="display:flex;z-index:99999"><div class="modal-window" style="max-width:1100px;width:96%;max-height:92vh;overflow:auto"><div class="modal-header"><div><h3>Edit Quotation ' + esc(q.quotation_number || q.quotationNumber || '') + '</h3><p>Changes are saved to the existing quotation. No stock is moved.</p></div><button class="icon-btn" type="button" id="quotationEditClose">×</button></div><form id="quotationEditForm"><div class="form-grid two"><label><span>Customer</span><select name="customer_id"><option value="">Walk-in Customer</option>' + customers.map(function (c) { var cid = c.id; return '<option value="' + esc(cid) + '"' + (String(cid) === String(customerId) ? ' selected' : '') + '>' + esc(c.name || c.company || 'Customer') + '</option>'; }).join('') + '</select></label><label><span>Valid Until</span><input type="date" name="valid_until" value="' + esc(dateInput(q.valid_until || q.validUntil)) + '"></label><label class="form-span-2"><span>Notes</span><textarea name="notes" rows="3">' + esc(q.notes || '') + '</textarea></label></div><div class="section-head" style="margin-top:18px"><div><h4>Quotation Items</h4><p>Edit description, quantity, price, discount and VAT.</p></div><button class="btn btn-outline" type="button" id="quotationAddLine">Add Item</button></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>VAT %</th><th>Unit</th><th></th></tr></thead><tbody id="quotationEditItems">' + items.map(itemRow).join('') + '</tbody></table></div><div class="quotation-edit-total" id="quotationEditTotals"></div><div class="inline-group" style="margin-top:18px"><button class="btn btn-primary" type="submit">Save Changes</button><button class="btn btn-outline" type="button" id="quotationEditCancel">Cancel</button></div></form></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var overlay = document.getElementById('quotationEditOverlay');
    document.getElementById('quotationEditClose').onclick = closeEditor;
    document.getElementById('quotationEditCancel').onclick = closeEditor;
    document.getElementById('quotationAddLine').onclick = function () { document.getElementById('quotationEditItems').insertAdjacentHTML('beforeend', itemRow({ description:'', quantity:1, unit_price:0, discount:0, vat_rate:16, unit:'pcs', product_id:'' })); bindRows(); calculate(); };
    bindRows(); calculate();
    document.getElementById('quotationEditForm').addEventListener('submit', function (event) { saveEditor(event, q.id); });
  }

  function itemRow(item) {
    var product = item.product_id == null ? (item.productId == null ? '' : item.productId) : item.product_id;
    return '<tr class="quotation-edit-row"><td><input name="description" value="' + esc(item.description || '') + '" required></td><td><input name="quantity" type="number" min="0.001" step="0.001" value="' + esc(item.quantity == null ? 1 : item.quantity) + '" required></td><td><input name="unit_price" type="number" min="0" step="0.01" value="' + esc(item.unit_price == null ? (item.unitPrice || 0) : item.unit_price) + '" required></td><td><input name="discount" type="number" min="0" step="0.01" value="' + esc(item.discount || 0) + '"></td><td><input name="vat_rate" type="number" min="0" max="100" step="0.01" value="' + esc(item.vat_rate == null ? (item.vatRate == null ? 16 : item.vatRate) : item.vat_rate) + '"></td><td><input name="unit" value="' + esc(item.unit || 'pcs') + '"><input type="hidden" name="product_id" value="' + esc(product) + '"></td><td><button class="btn btn-outline quotation-remove-line" type="button">Remove</button></td></tr>';
  }

  function bindRows() {
    document.querySelectorAll('#quotationEditItems .quotation-edit-row').forEach(function (row) {
      row.querySelectorAll('input').forEach(function (input) { input.addEventListener('input', calculate); });
      var remove = row.querySelector('.quotation-remove-line');
      if (remove) remove.onclick = function () { row.remove(); calculate(); };
    });
  }

  function calculate() {
    var subtotal = 0, vat = 0;
    document.querySelectorAll('#quotationEditItems .quotation-edit-row').forEach(function (row) {
      var qty = Number(row.querySelector('[name=quantity]').value || 0);
      var price = Number(row.querySelector('[name=unit_price]').value || 0);
      var discount = Number(row.querySelector('[name=discount]').value || 0);
      var rate = Number(row.querySelector('[name=vat_rate]').value || 0);
      var net = Math.max(0, qty * price - discount); subtotal += net; vat += net * rate / 100;
    });
    var total = subtotal + vat;
    var el = document.getElementById('quotationEditTotals');
    if (el) el.innerHTML = '<strong>Subtotal: ' + money(subtotal) + '</strong><strong>VAT: ' + money(vat) + '</strong><strong>Total: ' + money(total) + '</strong>';
  }

  async function saveEditor(event, id) {
    event.preventDefault();
    var form = event.target;
    var rows = Array.prototype.slice.call(form.querySelectorAll('.quotation-edit-row'));
    var items = rows.map(function (row) { function v(name) { var x = row.querySelector('[name="' + name + '"]'); return x ? x.value : ''; } return { product_id: v('product_id') || null, description: v('description'), quantity: Number(v('quantity')), unit_price: Number(v('unit_price')), discount: Number(v('discount') || 0), vat_rate: Number(v('vat_rate') || 0), unit: v('unit') || 'pcs' }; });
    if (!items.length) { alert('A quotation must contain at least one item.'); return; }
    var payload = { customer_id: form.elements.customer_id.value || null, valid_until: form.elements.valid_until.value || null, notes: form.elements.notes.value || '', items: items };
    try {
      await api('/api/quotations/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) });
      closeEditor();
      await loadQuotations();
      alert('Quotation updated successfully.');
    } catch (error) { alert('Unable to save quotation: ' + error.message); }
  }

  function closeEditor() { var el = document.getElementById('quotationEditOverlay'); if (el) el.remove(); }

  window.addEventListener('hashchange', function () { mounted = false; setTimeout(mount, 150); });
  var observer = new MutationObserver(function () { if (isQuotationRoute() && !document.getElementById('quotation-edit-ui-marker')) { setTimeout(mount, 100); } });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 300); }); else setTimeout(mount, 300);
})();
