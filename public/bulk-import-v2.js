(function () {
  'use strict';

  var FIELDS = [
    ['product_code', 'Product Code / SKU'], ['barcode', 'Barcode'], ['product_name', 'Product Name'],
    ['category', 'Category'], ['brand', 'Brand'], ['unit', 'Unit'], ['cost_price', 'Cost Price'],
    ['selling_price', 'Selling Price'], ['vat_rate', 'VAT'], ['reorder_level', 'Reorder Level'],
    ['opening_stock', 'Opening Stock'], ['supplier', 'Supplier'], ['location', 'Location'], ['description', 'Description']
  ];
  var ALIASES = {
    product_code: ['productcode','productcodesku','sku','code','itemcode','itemnumber','productid'],
    barcode: ['barcode','barcodenumber','ean','upc'], product_name: ['productname','name','itemname','item'],
    category: ['category','categoryname','productcategory'], brand: ['brand','brandname','manufacturer'], unit: ['unit','uom','measure'],
    cost_price: ['costprice','cost','buyprice','purchaseprice','buyingprice'], selling_price: ['sellingprice','saleprice','price','retailprice','unitprice','selling'],
    vat_rate: ['vat','vatrate','tax','taxrate'], reorder_level: ['reorderlevel','minimumstock','minstock','reorderqty','minimumqty'],
    opening_stock: ['openingstock','stock','currentstock','qty','quantity','openingqty'], supplier: ['supplier','suppliername','vendor'],
    location: ['location','branch','branchcode','branchname','store'], description: ['description','details','notes']
  };
  var state = { file: null, preview: null, mapping: {}, branchId: '', autoGenerateCodes: true };

  function key(value) { return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function toast(message, type) { if (typeof window.showToast === 'function') window.showToast(message, type || 'info'); else console.log(message); }
  function autoMap(headers) {
    var normalized = (headers || []).map(function (h) { return { raw: String(h == null ? '' : h), key: key(h) }; });
    var mapping = {};
    FIELDS.forEach(function (pair) {
      var aliases = ALIASES[pair[0]] || [];
      var exact = normalized.find(function (h) { return aliases.indexOf(h.key) !== -1; });
      if (exact) mapping[pair[0]] = exact.raw;
      else {
        var partial = normalized.find(function (h) { return aliases.some(function (a) { return h.key.indexOf(a) !== -1 || a.indexOf(h.key) !== -1; }); });
        if (partial && partial.key) mapping[pair[0]] = partial.raw;
      }
    });
    return mapping;
  }
  function num(value) {
    if (String(value == null ? '' : value).trim() === '') return null;
    var n = Number(String(value).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  function mount(root, branchId) {
    if (!root) throw new Error('Bulk Import mount target is missing.');
    state.branchId = branchId || '';
    root.innerHTML = '<div class="section-card"><div class="section-card__header"><div><h3>Bulk Import — New Catalogue</h3><p>Upload CSV or Excel, map the catalogue columns, validate the rows, then import into the clean inventory.</p></div></div><div class="stack-form"><label><span>Catalogue file</span><input id="bulkV2File" type="file" accept=".csv,.xlsx,.xls" /></label><div id="bulkV2Status" class="inline-message">Choose a CSV or Excel catalogue.</div><div id="bulkV2Mapping"></div><div id="bulkV2Preview"></div><div class="modal-actions"><button id="bulkV2Import" class="btn btn-primary" disabled>Import Valid Products</button></div></div></div>';
    root.querySelector('#bulkV2File').addEventListener('change', previewFile);
    root.querySelector('#bulkV2Import').addEventListener('click', importProducts);
  }

  function previewFile() {
    var input = document.getElementById('bulkV2File');
    state.file = input && input.files && input.files[0];
    if (!state.file) return;
    var status = document.getElementById('bulkV2Status');
    status.textContent = 'Reading and validating catalogue…';
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        var base64 = comma >= 0 ? result.slice(comma + 1) : result;
        fetch('/api/v2/products/bulk-import/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: state.file.name, file_base64: base64, auto_generate_codes: state.autoGenerateCodes })
        }).then(function (response) {
          return response.json().then(function (data) { if (!response.ok) throw new Error(data.error || 'Preview failed'); return data; });
        }).then(function (data) {
          state.preview = data;
          state.mapping = Object.keys(data.mapping || {}).length ? data.mapping : autoMap(data.headers || []);
          if (!Object.keys(state.mapping).length) throw new Error('Could not identify catalogue columns.');
          renderPreview();
        }).catch(function (error) { state.preview = null; status.textContent = error.message; toast(error.message, 'error'); });
      } catch (error) { status.textContent = error.message; toast(error.message, 'error'); }
    };
    reader.onerror = function () { status.textContent = 'Unable to read the selected catalogue file.'; };
    reader.readAsDataURL(state.file);
  }

  function renderPreview() {
    var p = state.preview, status = document.getElementById('bulkV2Status');
    if (!p) return;
    status.textContent = state.file.name + ': ' + p.total + ' rows — ' + p.valid + ' valid, ' + p.invalid + ' invalid' + (p.auto_generated_codes ? ' — ' + p.auto_generated_codes + ' product codes generated' : '') + '.';
    var mapHtml = '<div class="bulk-map-toolbar"><h4>Column Mapping</h4><button id="bulkV2AutoMap" type="button" class="btn btn-secondary">Auto-map Columns</button><label><input id="bulkV2AutoCode" type="checkbox" ' + (state.autoGenerateCodes ? 'checked' : '') + '> Generate product codes automatically when SKU is blank</label></div><div class="table-wrap"><table><thead><tr><th>POS Field</th><th>Catalogue Column</th></tr></thead><tbody>';
    FIELDS.forEach(function (pair) { var field = pair[0], label = pair[1]; mapHtml += '<tr><td>' + esc(label) + '</td><td><select data-bulk-map="' + field + '"><option value="">— Not mapped —</option>'; (p.headers || []).forEach(function (h) { mapHtml += '<option value="' + esc(h) + '"' + (state.mapping[field] === h ? ' selected' : '') + '>' + esc(h) + '</option>'; }); mapHtml += '</select></td></tr>'; });
    mapHtml += '</tbody></table></div>';
    document.getElementById('bulkV2Mapping').innerHTML = mapHtml;
    document.getElementById('bulkV2AutoMap').onclick = function () { state.mapping = autoMap(p.headers || []); revalidate(); };
    document.getElementById('bulkV2AutoCode').onchange = function (e) { state.autoGenerateCodes = e.target.checked; if (state.autoGenerateCodes) previewFile(); else revalidate(); };
    document.querySelectorAll('[data-bulk-map]').forEach(function (el) { el.onchange = function () { state.mapping[el.dataset.bulkMap] = el.value; revalidate(); }; });
    var html = '<div class="table-wrap"><table><thead><tr><th>Row</th><th>Product</th><th>SKU/Barcode</th><th>Selling Price</th><th>Opening Stock</th><th>Status</th></tr></thead><tbody>';
    (p.rows || []).slice(0, 100).forEach(function (r) { var name = r.normalized && r.normalized.product_name || r.raw && r.raw[state.mapping.product_name] || ''; var code = r.normalized && r.normalized.product_code || r.raw && (r.raw[state.mapping.product_code] || r.raw[state.mapping.barcode]) || ''; var price = r.normalized && r.normalized.selling_price || r.raw && r.raw[state.mapping.selling_price] || ''; var stock = r.normalized && r.normalized.opening_stock || r.raw && r.raw[state.mapping.opening_stock] || ''; var statusText = r.generated_product_code ? 'Existing products will be matched by name + price before creating a new SKU.' : (r.errors && r.errors.length ? '<span class="inline-message">' + esc(r.errors.map(function (e) { return e.message; }).join('; ')) + '</span>' : 'Ready'); html += '<tr><td>' + r.rowNumber + '</td><td>' + esc(name) + '</td><td>' + esc(code) + '</td><td>' + esc(price) + '</td><td>' + esc(stock) + '</td><td>' + statusText + '</td></tr>'; });
    html += '</tbody></table></div>';
    document.getElementById('bulkV2Preview').innerHTML = html;
    document.getElementById('bulkV2Import').disabled = p.valid === 0;
  }

  function revalidate() {
    if (!state.preview) return;
    state.preview.rows = state.preview.rows.map(function (r) {
      var raw = r.raw || {};
      function value(field) { return String(raw[state.mapping[field]] == null ? '' : raw[state.mapping[field]]).trim(); }
      var generated = r.generated_product_code || (r.normalized && r.normalized.product_code) || '';
      var n = { product_code: value('product_code') || (!state.mapping.product_code && state.autoGenerateCodes ? generated : ''), barcode: value('barcode'), product_name: value('product_name'), category: value('category'), brand: value('brand'), unit: value('unit') || 'pcs', cost_price: num(value('cost_price')), selling_price: num(value('selling_price')), vat_rate: num(value('vat_rate')), reorder_level: num(value('reorder_level')), opening_stock: num(value('opening_stock')), supplier: value('supplier'), location: value('location'), description: value('description') };
      if (n.vat_rate == null) n.vat_rate = 16; if (n.reorder_level == null) n.reorder_level = 0; if (n.opening_stock == null) n.opening_stock = 0;
      var errors = []; if (!n.product_name) errors.push({ message: 'Product Name is required' }); if (!n.product_code && !n.barcode) errors.push({ message: 'Product Code/SKU or Barcode is required' }); if (n.selling_price == null || n.selling_price < 0) errors.push({ message: 'Selling Price must be valid' }); if (n.cost_price != null && n.cost_price < 0) errors.push({ message: 'Cost Price must be non-negative' });
      return Object.assign({}, r, { normalized: n, errors: errors });
    });
    state.preview.valid = state.preview.rows.filter(function (r) { return !r.errors.length; }).length;
    state.preview.invalid = state.preview.rows.length - state.preview.valid;
    renderPreview();
  }

  function importProducts() {
    var p = state.preview, branchId = Number(state.branchId || document.getElementById('branchSelect').value || 0);
    if (!p) return; if (!branchId) { toast('Select a branch before importing.', 'error'); return; }
    var rows = p.rows.filter(function (r) { return !r.errors.length; }).map(function (r) {
      return { rowNumber: r.rowNumber, normalized: r.normalized, generated_product_code: r.generated_product_code || '' };
    });
    if (!rows.length) { toast('There are no valid products to import.', 'error'); return; }
    var button = document.getElementById('bulkV2Import'); button.disabled = true; button.textContent = 'Importing…';
    fetch('/api/v2/products/bulk-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch_id: branchId, rows: rows }) }).then(function (response) { return response.json().then(function (data) { if (!response.ok) throw new Error(data.error || 'Import failed'); return data; }); }).then(function (data) { toast('Import complete: ' + data.created + ' created, ' + data.updated + ' updated' + (data.nameMatched ? ' — ' + data.nameMatched + ' matched by name/price' : '') + '.', 'success'); state.preview = null; state.file = null; document.getElementById('bulkV2File').value = ''; document.getElementById('bulkV2Status').textContent = 'Import complete. Upload another catalogue when ready.'; document.getElementById('bulkV2Mapping').innerHTML = ''; document.getElementById('bulkV2Preview').innerHTML = ''; }).catch(function (error) { button.disabled = false; button.textContent = 'Import Valid Products'; toast(error.message, 'error'); });
  }

  window.UniquePOSBulkImportV2 = { mount: mount };
})();
