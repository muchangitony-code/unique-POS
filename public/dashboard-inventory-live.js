(() => {
  'use strict';

  const ENDPOINT = '/api/v3/inventory/dashboard';
  const REFRESH_MS = 30000;
  let refreshTimer = null;
  let refreshQueued = false;
  let requestInFlight = false;
  let lastPayloadSignature = '';

  const route = () => String(location.hash || '').replace(/^#/, '').split('?')[0] || 'dashboard';
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatNumber = value => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(number(value));
  const formatMoney = value => 'KES ' + new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number(value));

  function inventoryRoot() {
    const root = document.getElementById('viewRoot');
    return root && route() === 'inventory' ? root : null;
  }

  function cardsByLabel(root) {
    const cards = Array.from(root.querySelectorAll('.kpi-card'));
    const byLabel = new Map();
    for (const card of cards) {
      const label = card.querySelector('.kpi-card__label');
      if (!label) continue;
      byLabel.set(label.textContent.trim().toLowerCase(), card);
    }
    return byLabel;
  }

  function setCard(card, label, value, formatter) {
    if (!card) return;
    const labelEl = card.querySelector('.kpi-card__label');
    const valueEl = card.querySelector('.kpi-card__value');
    if (labelEl) labelEl.textContent = label;
    if (valueEl) valueEl.textContent = formatter(value);
    card.dataset.inventoryMetric = label.toLowerCase().replace(/\s+/g, '-');
  }

  function normalizePayload(payload) {
    const source = payload && payload.data && typeof payload.data === 'object' ? payload.data : (payload || {});
    return {
      totalProducts: number(source.total_products ?? source.totalProducts),
      totalUnits: number(source.total_units ?? source.totalUnits),
      outOfStock: number(source.out_of_stock_items ?? source.outOfStockItems),
      lowStock: number(source.low_stock_items ?? source.lowStockItems),
      inventoryValue: number(source.inventory_cost_value ?? source.inventoryCostValue),
      lastUpdated: source.last_updated ?? source.lastUpdated ?? null
    };
  }

  function renderKpis(root, metrics) {
    const byLabel = cardsByLabel(root);
    const cards = Array.from(root.querySelectorAll('.kpi-card'));
    const stockLines = byLabel.get('stock lines') || byLabel.get('total products') || cards[0];
    const units = byLabel.get('low stock') || byLabel.get('total units') || cards[1];
    const outOfStock = byLabel.get('out of stock') || cards[2];
    const value = byLabel.get('stock value') || byLabel.get('inventory value') || cards[3];

    setCard(stockLines, 'Total Products', metrics.totalProducts, formatNumber);
    setCard(units, 'Total Units', metrics.totalUnits, formatNumber);
    setCard(outOfStock, 'Out of Stock', metrics.outOfStock, formatNumber);
    setCard(value, 'Inventory Value', metrics.inventoryValue, formatMoney);
  }

  function renderStatus(root, metrics, error) {
    let status = root.querySelector('#inventoryLiveStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'inventoryLiveStatus';
      status.className = 'inventory-live-status';
      status.setAttribute('role', 'status');
      const anchor = root.querySelector('.page-actions, .inventory-actions, .kpi-grid') || root.firstElementChild;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(status, anchor.nextSibling);
      else root.prepend(status);
    }

    if (error) {
      status.textContent = 'Inventory data could not be refreshed. Showing the last confirmed values.';
      status.dataset.state = 'error';
      return;
    }

    const when = metrics.lastUpdated ? new Date(metrics.lastUpdated) : null;
    status.textContent = when && !Number.isNaN(when.getTime())
      ? `Live inventory • Updated ${when.toLocaleString('en-KE')}`
      : 'Live inventory';
    status.dataset.state = 'ready';
  }

  async function refreshInventoryDashboard() {
    const root = inventoryRoot();
    if (!root || requestInFlight) return;
    requestInFlight = true;
    try {
      const response = await fetch(ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Inventory dashboard request failed (${response.status})`);
      const metrics = normalizePayload(await response.json());
      const signature = JSON.stringify(metrics);
      if (signature !== lastPayloadSignature || root.querySelector('.kpi-card__label')?.textContent.trim() !== 'Total Products') {
        renderKpis(root, metrics);
        lastPayloadSignature = signature;
      }
      renderStatus(root, metrics, null);
      window.dispatchEvent(new CustomEvent('inventory-dashboard-updated', { detail: metrics }));
    } catch (error) {
      console.error('[inventory] dashboard refresh failed', error);
      const currentRoot = inventoryRoot();
      if (currentRoot) renderStatus(currentRoot, {}, error);
    } finally {
      requestInFlight = false;
    }
  }

  function queueRefresh(delay = 0) {
    if (refreshQueued) return;
    refreshQueued = true;
    window.setTimeout(() => {
      refreshQueued = false;
      refreshInventoryDashboard();
    }, delay);
  }

  function syncRoute() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (route() === 'inventory') {
      queueRefresh(50);
      refreshTimer = window.setInterval(refreshInventoryDashboard, REFRESH_MS);
    }
  }

  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('pageshow', syncRoute);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && route() === 'inventory') refreshInventoryDashboard();
  });

  const observer = new MutationObserver(() => {
    if (route() !== 'inventory') return;
    const root = inventoryRoot();
    if (root && root.querySelector('.kpi-card')) queueRefresh(25);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  syncRoute();
})();
