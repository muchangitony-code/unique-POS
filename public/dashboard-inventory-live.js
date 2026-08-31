(() => {
  'use strict';

  const route = () => String(location.hash || '').replace(/^#/, '').split('?')[0];

  function setKpi(label, value, money) {
    document.querySelectorAll('.kpi-card').forEach(card => {
      const labelEl = card.querySelector('.kpi-card__label');
      const valueEl = card.querySelector('.kpi-card__value');
      if (!labelEl || !valueEl || labelEl.textContent.trim().toLowerCase() !== label.toLowerCase()) return;
      const number = Number(value || 0);
      valueEl.textContent = money
        ? 'KES ' + new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
        : new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(number);
      const trend = card.querySelector('.kpi-card__trend');
      if (trend) trend.textContent = 'Live inventory query';
    });
  }

  function renderUpdated(timestamp) {
    const root = document.getElementById('viewRoot');
    if (!root || route() !== 'inventory') return;
    let el = document.getElementById('inventoryLastUpdated');
    if (!el) {
      el = document.createElement('div');
      el.id = 'inventoryLastUpdated';
      el.style.cssText = 'font-size:12px;opacity:.75;margin:8px 0 14px;text-align:right';
      root.prepend(el);
    }
    const date = timestamp && timestamp !== '1970-01-01T00:00:00.000Z' ? new Date(timestamp) : new Date();
    el.textContent = `Inventory last updated: ${date.toLocaleString('en-KE')}`;
  }

  async function refresh() {
    if (route() !== 'inventory') return;
    const root = document.getElementById('viewRoot');
    if (!root || !root.querySelector('.kpi-card')) return;
    try {
      const response = await fetch('/api/v3/inventory/dashboard', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      setKpi('Stock Lines', data.total_products);
      setKpi('Low Stock', data.low_stock_items);
      setKpi('Out of Stock', data.out_of_stock_items);
      setKpi('Stock Value', data.inventory_cost_value, true);
      renderUpdated(data.last_updated);
    } catch (error) {
      console.warn('[inventory] live dashboard refresh failed', error);
    }
  }

  window.addEventListener('hashchange', () => setTimeout(refresh, 150));
  new MutationObserver(() => { if (route() === 'inventory') refresh(); }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(refresh, 250);
})();
