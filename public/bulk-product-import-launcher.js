(() => {
  'use strict';
  const API = '/api';
  const TOKEN_KEYS = ['uniquepos.token', 'token', 'authToken'];

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return '';
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const t = token();
    if (t && !headers.Authorization) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(typeof data === 'object' && data?.message ? data.message : `${res.status} ${res.statusText}`);
    return data;
  }

  function csvRows(text) {
    const rows = [];
    let row = [], field = '', quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (c === '"') {
        if (quote && n === '"') { field += '"'; i++; }
        else quote = !quote;
      } else if (c === ',' && !quote) { row.push(field.trim()); field = ''; }
      else if ((c === '\n' || c === '\r') && !quote) {
        if (c === '\r' && n === '\n') i++;
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = []; field = '';
      } else field += c;
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  const aliases = {
    product_code: ['product code','product_code','sku','code'],
    barcode: ['barcode'],
    product_name: ['product name','product_name','name','description'],
    category: ['category'], brand: ['brand'], supplier: ['supplier'],
    unit: ['unit'], cost_price: ['cost price','cost_price','buying price','buying_price'],
    selling_price: ['selling price','selling_price','price'], vat_rate: ['vat','vat rate','vat_rate'],
    current_stock: ['initial stock','current stock','stock','quantity','current_stock'],
    min_stock: ['min stock','minimum stock','reorder level','min_stock'],
    image_url: ['image url','image_url','image']
  };

  function keyFor(header) {
    const h = String(header || '').trim().toLowerCase();
    return Object.keys(aliases).find(k => aliases[k].includes(h)) || null;
  }

  function autoCode(name, n) {
    const prefix = String(name || 'PRODUCT').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'PRODUCT';
    return `${prefix}-${String(Date.now()).slice(-6)}-${String(n + 1).padStart(3, '0')}`;
  }

  function number(v, fallback) {
    const x = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(x) ? x : fallback;
  }

  function normalizeLookup(data) {
    return Array.isArray(data) ? data : (data?.data || data?.items || []);
  }

  async function lookups() {
    const [categories, brands, suppliers] = await Promise.all([
      api('/categories').catch(() => []),
      api('/brands').catch(() => []),
      api('/suppliers').catch(() => []),
    ]);
    const map = list => new Map(normalizeLookup(list).map(x => [String(x.name || x.category_name || x.brand_name || x.supplier_name || '').trim().toLowerCase(), x.id]));
    return { categories: map(categories), brands: map(brands), suppliers: map(suppliers) };
  }

  function modal() {
    if (document.getElementById('bulk-product-import-modal')) return;
    const el = document.createElement('div');
    el.id = 'bulk-product-import-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `
      <div style="width:min(900px,100%);max-height:92vh;overflow:auto;background:#fff;color:#172033;border-radius:14px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><div><h2 style="margin:0;font-size:22px">Bulk Add Products</h2><p style="margin:6px 0 0;color:#64748b">Upload a CSV. Existing product fields are preserved; blank product codes are generated automatically.</p></div><button id="bulk-close" style="border:0;background:transparent;font-size:26px;cursor:pointer">×</button></div>
        <div style="margin-top:18px;padding:14px;border:1px solid #dbe3ee;border-radius:10px;background:#f8fafc;font-size:14px"><b>Supported columns:</b> Product Code, Barcode, Product Name, Category, Brand, Supplier, Unit, Cost Price, Selling Price, VAT Rate, Initial Stock, Min Stock, Image URL. Product Name, Cost Price and Selling Price are required. Category/Brand/Supplier names are matched to existing records.</div>
        <input id="bulk-file" type="file" accept=".csv,text/csv" style="margin-top:18px;width:100%" />
        <textarea id="bulk-csv" placeholder="Or paste CSV data here..." style="margin-top:14px;width:100%;min-height:220px;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-family:monospace"></textarea>
        <div id="bulk-status" style="margin-top:12px;min-height:22px;color:#475569"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button id="bulk-cancel" style="padding:10px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer">Cancel</button><button id="bulk-import" style="padding:10px 18px;border:0;background:#1d4ed8;color:#fff;border-radius:8px;font-weight:600;cursor:pointer">Import Products</button></div>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('#bulk-close').onclick = close;
    el.querySelector('#bulk-cancel').onclick = close;
    el.querySelector('#bulk-file').onchange = async e => {
      const f = e.target.files?.[0]; if (f) el.querySelector('#bulk-csv').value = await f.text();
    };
    el.querySelector('#bulk-import').onclick = async () => {
      const button = el.querySelector('#bulk-import');
      const status = el.querySelector('#bulk-status');
      const rows = csvRows(el.querySelector('#bulk-csv').value);
      if (rows.length < 2) { status.textContent = 'Add a header row and at least one product row.'; return; }
      const keys = rows[0].map(keyFor);
      if (!keys.includes('product_name')) { status.textContent = 'CSV must include a Product Name column.'; return; }
      const records = rows.slice(1).map((cells, index) => {
        const r = {}; keys.forEach((k, i) => { if (k) r[k] = cells[i] ?? ''; }); r.__index = index; return r;
      }).filter(r => String(r.product_name || '').trim());
      if (!records.length) { status.textContent = 'No valid product rows found.'; return; }
      button.disabled = true;
      const old = button.textContent;
      try {
        status.textContent = 'Loading categories, brands and suppliers…';
        const maps = await lookups();
        let ok = 0, failed = 0; const errors = [];
        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          status.textContent = `Importing ${i + 1} of ${records.length}…`;
          const find = (m, value) => value ? m.get(String(value).trim().toLowerCase()) : undefined;
          const payload = {
            product_code: String(r.product_code || '').trim() || autoCode(r.product_name, i),
            barcode: String(r.barcode || '').trim() || undefined,
            product_name: String(r.product_name).trim(),
            category_id: find(maps.categories, r.category),
            brand_id: find(maps.brands, r.brand),
            supplier_id: find(maps.suppliers, r.supplier),
            unit: String(r.unit || 'pcs').trim() || 'pcs',
            cost_price: number(r.cost_price, 0),
            selling_price: number(r.selling_price, 0),
            vat_rate: number(r.vat_rate, 16),
            current_stock: number(r.current_stock, 0),
            min_stock: number(r.min_stock, 5),
            image_url: String(r.image_url || '').trim() || undefined,
          };
          try { await api('/products', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); ok++; }
          catch (err) { failed++; errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        status.innerHTML = `<b>${ok} product(s) imported.</b>${failed ? ` ${failed} failed: ${errors.slice(0,3).join(' | ')}` : ''}`;
        if (ok) setTimeout(() => { close(); location.reload(); }, failed ? 2500 : 900);
      } catch (err) { status.textContent = `Import failed: ${err.message}`; }
      finally { button.disabled = false; button.textContent = old; }
    };
  }

  function install() {
    const add = document.querySelector('[data-testid="button-add-product"]');
    if (!add || document.querySelector('[data-testid="button-bulk-add-products"]')) return false;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.testid = 'button-bulk-add-products';
    b.textContent = 'Bulk Add Products';
    b.style.cssText = 'height:40px;padding:0 16px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;font-weight:600;cursor:pointer';
    b.onclick = modal;
    add.parentElement.insertBefore(b, add);
    return true;
  }

  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', install);
  install();
})();
