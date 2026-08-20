(function () {
  'use strict';

  var TOKEN_KEY = 'uniquepos.token';
  var mountedRoute = '';

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function money(value) { return 'KES ' + Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function list(value) { return Array.isArray(value) ? value : (value && Array.isArray(value.data) ? value.data : (value && Array.isArray(value.items) ? value.items : [])); }
  function api(url, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': token() ? 'Bearer ' + token() : '' }, options.headers || {});
    return fetch(url, options).then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { if (!r.ok) throw new Error(body.error || body.message || 'Request failed'); return body; }); });
  }
  function isQuotationRoute() { return location.hash.replace(/^#/, '').split('?')[0] === 'quotations'; }

  // IMPORTANT: the main POS owns the quotation register layout. This module only
  // enhances its existing rows; it must never replace #viewRoot or render a second register.
  function enhanceRegister() {
    if (!isQuotationRoute()) { mountedRoute = ''; return; }
    var root = document.getElementById('viewRoot');
    if (!root) return;
    var rows = root.querySelectorAll('table tbody tr');
    if (!rows.length) return;

    rows.forEach(function (row) {
      if (row.querySelector('[data-quotation-edit]')) return;
      var convert = row.querySelector('[data-action="convert-quotation"]');
      if (!convert) return;
      var id = convert.getAttribute('data-id');
      if (!id) return;
      var statusCell = row.children[4];
      var status = statusCell ? String(statusCell.textContent || '').trim().toLowerCase() : '';
      var actions = row.lastElementChild;
      if (!actions) return;

      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn-secondary';
      edit.setAttribute('data-quotation-edit', id);
      edit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
      if (status === 'converted') {
        edit.disabled = true;
        edit.title = 'Converted quotations cannot be edited';
      } else {
        edit.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          openEditor(id);
        });
      }
      actions.appendChild(document.createTextNode(' '));
      actions.appendChild(edit);
    });
    mountedRoute = location.hash;
  }

  function dateInput(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  async function openEditor(id) {
    try {
      var result = await Promise.all([
        api('/api/quotations/' + encodeURIComponent(id)),
        api('/api/customers')
      ]);
      renderEditor(result[0], list(result[1]));
    } catch (error) {
      alert('Unable to open quotation: ' + error.message);
    }
  }

  function renderEditor(q, customers) {
    var old = document.getElementById('quotationEditOverlay');
    if (old) old.remove();
    var customerId = q.customer_id == null ? (q.customerId == null ? '' : q.customerId) : q.customer_id;
    var items = list(q.items);
    var html = '<div id="quotationEditOverlay" class="modal-overlay" style="display:flex;z-index:99999">' +
      '<div class="modal-window" style="max-width:1100px;width:96%;max-height:92vh;overflow:auto">' +
      '<div class="modal-header"><div><h3>Edit Quotation ' + esc(q.quotation_number || q.quotationNumber || '') + '</h3><p>Changes are saved to the existing quotation. No stock is moved.</p></div><button class="icon-btn" type="button" id="quotationEditClose">×</button></div>' +
      '<form id="quotationEditForm"><div class="form-grid two">' +
      '<label><span>Customer</span><select name="customer_id"><option value="">Walk-in Customer</option>' + customers.map(function (c) { var cid = c.id; return '<option value="' + esc(cid) + '"' + (String(cid) === String(customerId) ? ' selected' : '') + '>' + esc(c.name || c.company || 'Customer') + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Valid Until</span><input type="date" name="valid_until" value="' + esc(dateInput(q.valid_until || q.validUntil)) + '"></label>' +
      '<label class="form-span-2"><span>Notes</span><textarea name="notes" rows="3">' + esc(q.notes || '') + '</textarea></label></div>' +
      '<div class="section-head" style="margin-top:18px"><div><h4>Quotation Items</h4><p>Edit description, quantity, price, discount and VAT.</p></div><button class="btn btn-outline" type="button" id="quotationAddLine">Add Item</button></div>' +
      '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>VAT %</th><th>Unit</th><th></th></tr></thead><tbody id="quotationEditItems">' + items.map(itemRow).join('') + '</tbody></table></div>' +
      '<div class="quotation-edit-total" id="quotationEditTotals"></div>' +
      '<div class="inline-group" style="margin-top:18px"><button class="btn btn-primary" type="submit">Save Changes</button><button class="btn btn-outline" type="button" id="quotationEditCancel">Cancel</button></div>' +
      '</form></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('quotationEditClose').onclick = closeEditor;
    document.getElementById('quotationEditCancel').onclick = closeEditor;
    document.getElementById('quotationAddLine').onclick = function () {
      document.getElementById('quotationEditItems').insertAdjacentHTML('beforeend', itemRow({ description:'', quantity:1, unit_price:0, discount:0, vat_rate:16, unit:'pcs', product_id:'' }));
      bindRows(); calculate();
    };
    bindRows(); calculate();
    document.getElementById('quotationEditForm').addEventListener('submit', function (event) { saveEditor(event, q.id); });
  }

  function itemRow(item) {
    var product = item.product_id == null ? (item.productId == null ? '' : item.productId) : item.product_id;
    return '<tr class="quotation-edit-row"><td><input name="description" value="' + esc(item.description || '') + '" required></td>' +
      '<td><input name="quantity" type="number" min="0.001" step="0.001" value="' + esc(item.quantity == null ? 1 : item.quantity) + '" required></td>' +
      '<td><input name="unit_price" type="number" min="0" step="0.01" value="' + esc(item.unit_price == null ? (item.unitPrice || 0) : item.unit_price) + '" required></td>' +
      '<td><input name="discount" type="number" min="0" step="0.01" value="' + esc(item.discount || 0) + '"></td>' +
      '<td><input name="vat_rate" type="number" min="0" max="100" step="0.01" value="' + esc(item.vat_rate == null ? (item.vatRate == null ? 16 : item.vatRate) : item.vat_rate) + '"></td>' +
      '<td><input name="unit" value="' + esc(item.unit || 'pcs') + '"><input type="hidden" name="product_id" value="' + esc(product) + '"></td>' +
      '<td><button class="btn btn-outline quotation-remove-line" type="button">Remove</button></td></tr>';
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
      var net = Math.max(0, qty * price - discount);
      subtotal += net;
      vat += net * rate / 100;
    });
    var el = document.getElementById('quotationEditTotals');
    if (el) el.innerHTML = '<strong>Subtotal: ' + money(subtotal) + '</strong><strong>VAT: ' + money(vat) + '</strong><strong>Total: ' + money(subtotal + vat) + '</strong>';
  }

  async function saveEditor(event, id) {
    event.preventDefault();
    var form = event.target;
    var rows = Array.prototype.slice.call(form.querySelectorAll('.quotation-edit-row'));
    var items = rows.map(function (row) {
      function v(name) { var x = row.querySelector('[name="' + name + '"]'); return x ? x.value : ''; }
      return { product_id: v('product_id') || null, description: v('description'), quantity: Number(v('quantity')), unit_price: Number(v('unit_price')), discount: Number(v('discount') || 0), vat_rate: Number(v('vat_rate') || 0), unit: v('unit') || 'pcs' };
    });
    if (!items.length) { alert('A quotation must contain at least one item.'); return; }
    var submit = form.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
    try {
      await api('/api/quotations/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ customer_id: form.elements.customer_id.value || null, valid_until: form.elements.valid_until.value || null, notes: form.elements.notes.value || '', items: items }) });
      closeEditor();
      // Let the main POS refresh its own quotation register instead of replacing its layout.
      location.hash = 'quotations';
      window.setTimeout(function () { location.reload(); }, 100);
    } catch (error) {
      alert('Unable to save quotation: ' + error.message);
      if (submit) { submit.disabled = false; submit.textContent = 'Save Changes'; }
    }
  }

  function closeEditor() { var el = document.getElementById('quotationEditOverlay'); if (el) el.remove(); }

  function watch() {
    if (!isQuotationRoute()) { mountedRoute = ''; return; }
    if (mountedRoute !== location.hash || !document.querySelector('[data-quotation-edit]')) {
      enhanceRegister();
    }
  }

  window.addEventListener('hashchange', function () { mountedRoute = ''; setTimeout(watch, 150); });
  var observer = new MutationObserver(function () { if (isQuotationRoute()) setTimeout(watch, 50); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(watch, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(watch, 500); }); else setTimeout(watch, 500);
})();
