(function () {
  'use strict';

  const RULES = [
    { rule_name: 'Solar Panels', category_name: 'Solar Panels', keywords: ['solar panel','pv panel','photovoltaic panel','monocrystalline panel','polycrystalline panel','mono panel','poly panel','half-cell panel','flexible solar panel'], priority: 10 },
    { rule_name: 'Solar Inverters', category_name: 'Inverters', keywords: ['inverter','hybrid inverter','off-grid inverter','on-grid inverter','pure sine','sine wave inverter','inverter charger','solar inverter','all-in-one solar system'], priority: 20 },
    { rule_name: 'Lithium Batteries', category_name: 'Lithium Batteries', keywords: ['lifepo4','li-fe','lithium battery','lithium iron phosphate','lithium bank','rack battery','battery module','battery pack'], priority: 30 },
    { rule_name: 'Charge Controllers', category_name: 'Charge Controllers', keywords: ['charge controller','solar controller','mppt','pwm controller','pwm charge','solar charger regulator'], priority: 40 },
    { rule_name: 'Mounting Structures', category_name: 'Mounting Structures', keywords: ['mounting structure','mounting frame','roof mount','ground mount','pole mount','solar rail','l-feet','l feet','mid clamp','end clamp','solar clamp','tilt frame','ballast frame','mounting bracket'], priority: 50 },
    { rule_name: 'Solar Cables', category_name: 'Solar Cables', keywords: ['solar cable','pv cable','pv wire','photovoltaic cable','mc4','mc 4','solar connector','dc solar cable'], priority: 60 },
    { rule_name: 'DC Protection', category_name: 'DC Protection', keywords: ['dc breaker','dc mcb','dc fuse','anl fuse','anl holder','dc surge','dc spd','battery disconnect','battery isolator','pv isolator','solar fuse','dc combiner'], priority: 70 },
    { rule_name: 'AC Protection', category_name: 'AC Protection', keywords: ['rccb','rcbo','ac surge','ac spd','surge arrester','earth leakage','residual current','inverter output protection'], priority: 80 },
    { rule_name: 'Electrical Cables', category_name: 'Electrical Cables', keywords: ['electrical cable','twin and earth','twin & earth','single core cable','armoured cable','flexible cable','house wire','building wire','copper wire'], priority: 90 },
    { rule_name: 'Switchgear', category_name: 'Switchgear', keywords: ['isolator switch','main switch','changeover switch','change over','transfer switch','ats','automatic transfer','manual transfer'], priority: 100 },
    { rule_name: 'Lighting', category_name: 'Lighting', keywords: ['led bulb','light bulb','floodlight','flood light','batten','solar street light','streetlight','downlight','spotlight','led lamp','light fitting'], priority: 110 },
    { rule_name: 'Conduits and Trunking', category_name: 'Conduits & Trunking', keywords: ['conduit','trunking','cable trunking','pvc pipe','conduit pipe','conduit elbow','conduit clip','cable management'], priority: 120 },
    { rule_name: 'Sockets and Switches', category_name: 'Sockets & Switches', keywords: ['wall socket','socket outlet','plug socket','light switch','1-gang','1 gang','2-gang','2 gang','usb socket','fused spur','weatherproof socket','wall plug'], priority: 130 },
    { rule_name: 'Distribution Boards', category_name: 'Distribution Boards', keywords: ['distribution board','db box','consumer unit','consumer board','distribution box','split board','ip enclosure','db enclosure'], priority: 140 },
    { rule_name: 'Circuit Breakers', category_name: 'Circuit Breakers', keywords: ['mcb','mccb','circuit breaker','miniature breaker','single pole breaker','double pole breaker','3 pole breaker','4 pole breaker'], priority: 150 },
    { rule_name: 'Tools', category_name: 'Tools', keywords: ['multimeter','tester','clamp meter','crimping tool','crimper','wire stripper','cable cutter','screwdriver','pliers','drill','spanner','tool kit'], priority: 160 },
    { rule_name: 'Water Pumps', category_name: 'Water Pumps', keywords: ['water pump','solar pump','submersible pump','surface pump','pump controller','borehole pump','dc pump','pump kit'], priority: 170 },
    { rule_name: 'Small Appliances', category_name: 'Small Appliances', keywords: ['appliance','dc fan','solar fan','television','tv','refrigerator','fridge','blender','small cooker','low watt'], priority: 180 },
    { rule_name: 'Electrical Accessories', category_name: 'Accessories', keywords: ['cable lug','lug','busbar','bus bar','battery monitor','din rail','earthing','earth rod','earth clamp','terminal block','cable gland','connector','junction box','electrical accessory'], priority: 190 }
  ];

  function token() { return localStorage.getItem('uniquepos.token'); }

  async function request(url, options) {
    const auth = token();
    if (!auth) throw new Error('No active POS session');
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' });
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function asArray(response) {
    return Array.isArray(response) ? response : (response && (response.data || response.categories || response.rules || response.items)) || [];
  }

  function categoryName(category) {
    return String(category && (category.name || category.category_name || category.title || category.label) || '').trim();
  }

  function makeKeywords(name) {
    const lower = String(name).trim().toLowerCase();
    const words = lower.split(/[>\\/,&|]+|\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
    return Array.from(new Set([lower].concat(words)));
  }

  async function syncRules() {
    if (!token()) return;
    const rulesResponse = await request('/api/settings/product-categorization-rules');
    const existing = asArray(rulesResponse);
    const existingNames = new Set(existing.map(function (r) { return String(r.rule_name || '').trim().toLowerCase(); }));
    const existingCategories = new Set(existing.map(function (r) { return String(r.category_name || '').trim().toLowerCase(); }));
    let nextPriority = existing.reduce(function (max, r) { return Math.max(max, Number(r.priority) || 0); }, 0);
    let created = 0;

    for (const rule of RULES) {
      const key = rule.rule_name.toLowerCase();
      if (existingNames.has(key) || existingCategories.has(rule.category_name.toLowerCase())) continue;
      await request('/api/settings/product-categorization-rules', { method: 'POST', body: JSON.stringify(Object.assign({}, rule, { is_enabled: true })) });
      existingNames.add(key);
      existingCategories.add(rule.category_name.toLowerCase());
      nextPriority = Math.max(nextPriority, rule.priority);
      created += 1;
    }

    // Every category currently in the POS gets a rule if one does not already exist.
    // This also covers categories added later without requiring another code change.
    let categories = [];
    try { categories = asArray(await request('/api/categories')); } catch (_) { categories = []; }
    for (const category of categories) {
      const name = categoryName(category);
      const key = name.toLowerCase();
      if (!name || existingCategories.has(key)) continue;
      nextPriority += 10;
      await request('/api/settings/product-categorization-rules', {
        method: 'POST',
        body: JSON.stringify({
          rule_name: 'Auto: ' + name,
          category_name: name,
          keywords: makeKeywords(name),
          priority: nextPriority,
          is_enabled: true
        })
      });
      existingCategories.add(key);
      existingNames.add(('Auto: ' + name).toLowerCase());
      created += 1;
    }
    if (created) window.dispatchEvent(new CustomEvent('uniquepos:category-rules-seeded', { detail: { created: created } }));
  }

  let busy = false;
  async function run() {
    if (busy || !token()) return;
    busy = true;
    try { await syncRules(); } catch (_) {} finally { busy = false; }
  }

  let attempts = 0;
  const startup = window.setInterval(function () {
    attempts += 1;
    if (!token()) { if (attempts >= 120) window.clearInterval(startup); return; }
    window.clearInterval(startup);
    run();
    // Detect categories added during the active session and create their rules automatically.
    window.setInterval(run, 5000);
  }, 500);
})();
