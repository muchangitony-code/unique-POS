(() => {
  'use strict';
  const KEY = 'uniquepos.category-display-names.v1';
  const defaults = ['Solar Panels','Inverters','Batteries','Accessories','Cables','Electricals','Others'];
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const write = value => localStorage.setItem(KEY, JSON.stringify(value));
  const label = name => read()[String(name || '')] || String(name || '');
  const canonicalForLabel = text => Object.entries(read()).find(([key,value]) => String(value).trim() === String(text).trim())?.[0] || text;

  function mapVisibleCategories(scope=document) {
    const map = read();
    if (!Object.keys(map).length) return;
    scope.querySelectorAll('button,a,option,th,td,span').forEach(el => {
      if (el.dataset.categoryDisplayMapped === '1') return;
      const own = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.nodeValue).join('').trim();
      const canonical = Object.keys(map).find(k => k === own);
      if (!canonical) return;
      el.dataset.categoryCanonical = canonical;
      el.dataset.categoryDisplayMapped = '1';
      el.textContent = map[canonical];
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-category-display-mapped="1"]');
    if (!button || !button.dataset.categoryCanonical) return;
    const canonical = button.dataset.categoryCanonical;
    const shown = label(canonical);
    if (button.textContent.trim() !== canonical) {
      button.textContent = canonical;
      setTimeout(() => { if (document.contains(button)) { button.textContent = shown; button.dataset.categoryDisplayMapped = '1'; } }, 0);
    }
  }, true);

  const observer = new MutationObserver(() => mapVisibleCategories(document));
  document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, {childList:true,subtree:true}));

  window.UniquePOSCategories = {
    label,
    canonicalForLabel,
    list: () => {
      const mapped = Object.keys(read());
      return [...new Set([...defaults, ...mapped])].map(name => ({name, label:label(name)}));
    },
    rename: (canonical, displayName) => {
      canonical = String(canonical || '').trim(); displayName = String(displayName || '').trim();
      if (!canonical || !displayName) throw new Error('Both category names are required.');
      const map = read();
      if (displayName === canonical) delete map[canonical]; else map[canonical] = displayName;
      write(map); mapVisibleCategories(document); document.dispatchEvent(new CustomEvent('uniquepos:categories-changed'));
    }
  };
})();