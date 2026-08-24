(() => {
  'use strict';

  const root = () => document.getElementById('viewRoot');
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
  const selectedBranchId = () => {
    const el = document.getElementById('branchSelect');
    const value = el && el.value ? Number(el.value) : 0;
    return Number.isInteger(value) && value > 0 ? value : 0;
  };
  let products = [];
  let query = '';
  let loaded = false;

  async function loadProducts() {
    const branchId = selectedBranchId();
    if (!branchId) {
      products = [];
      loaded = true;
      render();
      return;
    }
    const url = new URL('/api/v3/inventory/products', window.location.origin);
    url.searchParams.set('branchId', String(branchId));
    if (query) url.searchParams.set('q', query);
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Live branch inventory service is unavailable.');
    const data = await response.json();
    products = Array.isArray(data.products) ? data.products : [];
    loaded = true;
    render();
  }

  function productRows() {
    if (!products.length) return '<tr><td colspan="8" class="empty-state">No products with inventory records for the selected branch.</td></tr>';
    return products.map(p => `<tr>
      <td><strong>${esc(p.sku)}</strong></td><td>${esc(p.barcode || '')}</td><td>${esc(p.name)}</td>
      <td>${esc(p.category || '')}</td><td>${esc(p.unit || 'pcs')}</td>
      <td>${Number(p.selling_price || 0).toLocaleString()}</td><td>${Number(p.quantity_on_hand || 0).toLocaleString()}</td>
      <td><div class="inline-group"><button class="btn btn-outline" type="button" data-v3-edit="${esc(p.id)}">Edit</button><button class="btn btn-outline" type="button" data-v3-delete="${esc(p.id)}">Delete</button></div></td>
    </tr>`).join('');
  }

  function render() {
    const el = root();
    if (!el) return;
    const branchId = selectedBranchId();
    el.innerHTML = `<section class="card section-card inventory-v3-page">
      <div class="section-head"><div><h2>Products & Inventory</h2><p>Live catalogue and stock for the selected branch.</p></div><button class="btn btn-primary" type="button" id="inventoryV3Add">Add Product</button></div>
      <div class="inline-group" style="margin-bottom:16px"><input id="inventoryV3Search" class="form-control" type="search" placeholder="Search name, SKU or barcode" value="${esc(query)}"><button class="btn btn-outline" type="button" id="inventoryV3Refresh">Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>SKU</th><th>Barcode</th><th>Product</th><th>Category</th><th>Unit</th><th>Selling</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${productRows()}</tbody></table></div>
      <div class="inventory-v3-status">${branchId ? (loaded ? `${products.length} products — branch ${branchId} live query` : 'Loading live branch inventory…') : 'Select a branch to view branch stock.'}</div>
    </section>`;
    el.querySelector('#inventoryV3Search').addEventListener('input', event => { query = event.target.value; loadProducts().catch(showError); });
    el.querySelector('#inventoryV3Refresh').addEventListener('click', () => loadProducts().catch(showError));
    el.querySelector('#inventoryV3Add').addEventListener('click', openCreate);
    el.querySelectorAll('[data-v3-edit]').forEach(button => button.addEventListener('click', () => openEdit(button.dataset.v3Edit)));
    el.querySelectorAll('[data-v3-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.v3Delete)));
  }

  function showError(error) {
    const el = root();
    if (el) { const status = el.querySelector('.inventory-v3-status'); if (status) status.textContent = error.message || 'Unable to load live branch inventory.'; }
  }

  function form(product) {
    const p = product || {};
    return `<form id="inventoryV3Form" class="stack-form">
      <label>SKU<input name="sku" required value="${esc(p.sku)}"></label><label>Barcode<input name="barcode" value="${esc(p.barcode)}"></label>
      <label>Product name<input name="name" required value="${esc(p.name)}"></label><label>Category<input name="category" value="${esc(p.category)}"></label>
      <label>Brand<input name="brand" value="${esc(p.brand)}"></label><label>Unit<input name="unit" value="${esc(p.unit || 'pcs')}"></label>
      <label>Buying price<input name="costPrice" type="number" min="0" step="0.01" value="${esc(p.cost_price || 0)}"></label>
      <label>Selling price<input name="sellingPrice" type="number" min="0" step="0.01" value="${esc(p.selling_price || 0)}"></label>
      <label>VAT %<input name="vatRate" type="number" min="0" step="0.01" value="${esc(p.vat_rate || 0)}"></label>
      <label>Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" value="${esc(p.reorder_level || 0)}"></label>
      <label>Supplier<input name="supplier" value="${esc(p.supplier)}"></label><label>Description<textarea name="description">${esc(p.description)}</textarea></label>
      <div class="inline-group"><button class="btn btn-primary" type="submit">Save Product</button><button class="btn btn-outline" type="button" id="inventoryV3Cancel">Cancel</button></div>
    </form>`;
  }

  function showModal(title, body) {
    const overlay = document.getElementById('modalOverlay'); document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalSubtitle').textContent = 'Live Product & Inventory module'; document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modalActions').innerHTML = ''; overlay.classList.remove('hidden');
  }
  function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

  function openCreate() {
    showModal('Add Product', form()); document.getElementById('inventoryV3Cancel').addEventListener('click', closeModal);
    document.getElementById('inventoryV3Form').addEventListener('submit', async event => {
      event.preventDefault(); const body = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch('/api/v3/inventory/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), cache: 'no-store' });
      const data = await response.json(); if (!response.ok) return alert(data.error || 'Unable to create product.');
      closeModal(); await loadProducts();
    });
  }

  async function openEdit(id) {
    const product = products.find(item => String(item.id) === String(id)); if (!product) return;
    showModal('Edit Product', form(product)); document.getElementById('inventoryV3Cancel').addEventListener('click', closeModal);
    document.getElementById('inventoryV3Form').addEventListener('submit', async event => {
      event.preventDefault(); const body = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch('/api/v3/inventory/products/' + encodeURIComponent(id), { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), cache: 'no-store' });
      const data = await response.json(); if (!response.ok) return alert(data.error || 'Unable to update product.');
      closeModal(); await loadProducts();
    });
  }

  async function deleteProduct(id) {
    const product = products.find(item => String(item.id) === String(id)); if (!product) return;
    if (!window.confirm(`Delete ${product.name}? This removes its inventory record and movement history.`)) return;
    const response = await fetch('/api/v3/inventory/products/' + encodeURIComponent(id), { method: 'DELETE', cache: 'no-store' });
    if (!response.ok) { let data = {}; try { data = await response.json(); } catch {} return alert(data.error || 'Unable to delete product.'); }
    await loadProducts();
  }

  function activeRoute() { return String(location.hash || '#dashboard').replace(/^#/, '').split('?')[0]; }
  function isInventoryRoute() { return activeRoute() === 'products' || activeRoute() === 'inventory'; }
  function activate() { if (!isInventoryRoute()) return; loaded = false; products = []; render(); loadProducts().catch(showError); }
  window.addEventListener('hashchange', () => setTimeout(activate, 0));
  document.addEventListener('change', event => {
    if (event.target && event.target.id === 'branchSelect' && isInventoryRoute()) setTimeout(activate, 0);
  });
  setTimeout(activate, 0);
})();
