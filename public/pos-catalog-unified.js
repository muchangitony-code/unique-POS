(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let categoryPromise = null;
  let categoryMap = new Map();

  const text = v => String(v ?? '').trim();
  const key = v => text(v).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = {
    'solar panel':'Solar Panels','solar panels':'Solar Panels','pv panel':'Solar Panels','pv panels':'Solar Panels',
    'inverter':'Inverters','inverters':'Inverters','battery':'Batteries','batteries':'Batteries',
    'accessory':'Accessories','accessories':'Accessories','cable':'Cables','cables':'Cables',
    'electrical':'Electricals','electricals':'Electricals','other':'Others','others':'Others'
  };
  function canonical(v) { const raw = text(v); return aliases[key(raw)] || raw; }
  function list(payload) {
    if (Array.isArray(payload)) return payload;
    for (const k of ['data','items','products','categories','results','rows']) if (Array.isArray(payload?.[k])) return payload[k];
    return [];
  }
  function categoriesUrl(url) { try { return new URL(url, location.origin).pathname === '/api/categories'; } catch { return false; } }
  function productsUrl(url) { try { return new URL(url, location.origin).pathname === '/api/products'; } catch { return false; } }
  function absorbCategories(payload) {
    categoryMap = new Map();
    for (const row of list(payload)) {
      if (!row) continue;
      const name = canonical(row.name || row.category_name || row.categoryName || row.label || row.title || (typeof row.category === 'string' ? row.category : ''));
      if (!name) continue;
      for (const id of [row.id,row.category_id,row.categoryId,row.value]) if (text(id)) categoryMap.set(text(id), name);
      categoryMap.set(key(name), name);
    }
    return categoryMap;
  }
  async function ensureCategories(init) {
    if (categoryMap.size) return categoryMap;
    if (!categoryPromise) categoryPromise = nativeFetch('/api/categories', init || {}).then(async r => {
      if (r.ok) absorbCategories(await r.clone().json());
      return categoryMap;
    }).catch(() => categoryMap);
    return categoryPromise;
  }
  function resolve(row) {
    const candidates = [row.category_name,row.categoryName,row.category_label,row.categoryLabel,row.category,row.category?.name,row.category_id,row.categoryId];
    for (let value of candidates) {
      if (value && typeof value === 'object') value = value.name || value.label || value.category_name || value.id;
      const raw = text(value); if (!raw) continue;
      if (categoryMap.has(raw)) return categoryMap.get(raw);
      if (categoryMap.has(key(raw))) return categoryMap.get(key(raw));
      if (!/^\d+$/.test(raw)) return canonical(raw);
    }
    return 'Others';
  }
  function normalizeProducts(payload) {
    const arr = list(payload);
    const mapped = arr.map(product => {
      const row = {...product}; const category = resolve(row);
      row.category = category; row.category_name = category; row.categoryName = category;
      return row;
    });
    if (Array.isArray(payload)) return mapped;
    for (const k of ['data','items','products','results','rows']) if (Array.isArray(payload?.[k])) return {...payload,[k]:mapped};
    return payload;
  }
  function jsonResponse(response, payload) {
    const headers = new Headers(response.headers); headers.set('Content-Type','application/json');
    return new Response(JSON.stringify(payload), {status:response.status,statusText:response.statusText,headers});
  }
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (categoriesUrl(url)) {
      const response = await nativeFetch(input, init);
      if (response.ok) try { absorbCategories(await response.clone().json()); } catch {}
      return response;
    }
    if (!productsUrl(url)) return nativeFetch(input, init);
    const categories = ensureCategories(init);
    const response = await nativeFetch(input, init);
    if (!response.ok) return response;
    try { await categories; return jsonResponse(response, normalizeProducts(await response.clone().json())); }
    catch { return response; }
  };
})();