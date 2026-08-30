(function(){'use strict';
// Robust POS catalogue compatibility renderer
// This script is defensive: it tolerates small markup/route differences between
// Counter versions so the product catalogue stays in sync with the sale page
// and category clicks keep showing connected products.

var baseFetch = window.fetch.bind(window);
var selected = 'All Products';
var timer = 0, busy = false;
var aliases = {
  'solar panel':'Solar Panels','solar panels':'Solar Panels','pv panel':'Solar Panels',
  'inverter':'Inverters','inverters':'Inverters','battery':'Batteries','batteries':'Batteries'
};

function t(v){return String(v==null?'':v).trim();}
function k(v){return t(v).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c];});}
function list(x){if(Array.isArray(x))return x;if(x&&Array.isArray(x.data))return x.data;if(x&&Array.isArray(x.items))return x.items;if(x&&Array.isArray(x.products))return x.products;return []}
function canon(v){var q=k(v);return aliases[q]||t(v)||'Others'}

// Try several well-known endpoints: legacy /api/products and the v3 inventory endpoint.
async function fetchProducts(){
  var urls = [
    '/api/products?limit=5000&in_stock_only=false&fallback_product_stock=true',
    '/api/v3/inventory/products?limit=5000'
  ];
  for(var i=0;i<urls.length;i++){
    try{
      var r = await baseFetch(urls[i]);
      if(!r.ok) continue;
      var j = await r.json().catch(()=>null);
      if(!j) continue;
      var items = list(j);
      if(items.length) return items;
    }catch(_){/* ignore and try next */}
  }
  return [];
}

async function fetchCategories(){
  try{
    var r = await baseFetch('/api/categories');
    if(!r.ok) return [];
    var j = await r.json().catch(()=>null);
    return list(j);
  }catch(_){return []}
}

function match(p){
  var searchInput = document.getElementById('posProductSearch') || document.getElementById('productSearch') || document.querySelector('input[data-pos-search]');
  var q = (searchInput && t(searchInput.value).toLowerCase()) || '';
  if(selected && selected!=='All Products'){
    if(selected==='Others'){
      if(['Solar Panels','Inverters','Batteries','Accesories','Lighting'].includes(p.category||p.category_name||p.categoryName||p.category_name_display)) return false;
    } else {
      var cat = (p.category || p.category_name || p.categoryName || p.category_name_display || p.category_display);
      if(!cat) return false;
      if(canon(cat)!==selected) return false;
    }
  }
  if(!q) return true;
  var name = (p.name||p.product_name||p.productName||'').toString().toLowerCase();
  var sku = (p.sku||p.product_code||p.productCode||'').toString().toLowerCase();
  return name.indexOf(q)>=0 || sku.indexOf(q)>=0 || (p.barcode||'').toString().indexOf(q)>=0;
}

function card(p){
  var id = t(p.id!=null?p.id:p.product_id||p.productId);
  var price = Number(p.selling_price!=null?p.selling_price:p.sellingPrice||0);
  var stock = p.current_stock!=null?p.current_stock:(p.stock!=null?p.stock:p.current_stock||0);
  var title = esc(p.name||p.product_name||p.productName||'Untitled');
  var sku = esc(p.sku||p.product_code||p.productCode||'');
  return '<div class="product-card" data-id="'+esc(id)+'">'+
    '<div class="product-card__title">'+title+'</div>'+
    '<div class="product-card__meta">'+(sku?('<small>'+sku+'</small>'):'')+'<div class="price">'+(isFinite(price)?(''+price):'')+'</div></div>'+
    '<div class="product-card__stock">'+(stock!=null?('In stock: '+esc(String(stock))):'')+'</div>'+
    '<div class="product-card__actions"><button data-action="add-to-basket" data-id="'+esc(id)+'">Add</button></div>'+
    '</div>';
}

async function load(){
  var results = await Promise.all([fetchProducts(), fetchCategories()]);
  var ps = results[0]||[];
  var cs = results[1]||[];
  // Normalise category names for older markup that stores id vs name.
  var catMap = {};
  cs.forEach(function(c){ if(c && (c.id||c.name)) catMap[String(c.id)] = c.name || c.display_name || c.category; });
  ps.forEach(function(p){ if(!p.category && p.category_id) p.category = catMap[String(p.category_id)] || p.category; if(!p.category && p.category_name) p.category = p.category_name; });
  return ps;
}

async function render(){
  var panel = document.querySelector('.pos-products-panel');
  if(!panel) return; // nothing to do on pages without the POS catalogue
  if(busy) return;
  // Only render on known POS/sales routes or when the catalogue panel is visible
  var routeOk = false;
  try{ var h = (location.hash||'').toLowerCase(); if(h.startsWith('#sales')||h.startsWith('#sale')||h.startsWith('#pos')||h.startsWith('#counter')) routeOk = true; }catch(_){routeOk=false}
  if(!routeOk){
    // if the catalogue panel is visible in the current view, still render
    if(!(panel.offsetParent || panel.getClientRects().length)) return; // not visible
  }

  busy = true;
  try{
    var all = await load();
    var rows = all.filter(match);
    var container = panel.querySelector('.product-grid') || panel;
    if(!container) return;
    container.innerHTML = rows.map(card).join('') || '<div class="empty-note">No products.</div>';
  }catch(err){ console.error('[pos-catalog-compat] render failed', err); }
  busy = false;
}

function schedule(){ clearTimeout(timer); timer = setTimeout(render, 120); }

function categoryFrom(el){ if(!el) return '';
  var v = el.getAttribute && (el.getAttribute('data-value') || el.getAttribute('data-category') || el.getAttribute('data-category-id') || el.getAttribute('data-name'));
  if(!v && el.dataset){ v = el.dataset.value || el.dataset.category || el.dataset.categoryId || el.dataset.name; }
  return t(v||el.textContent||'');
}

// Delegate clicks from category chips and product actions
document.addEventListener('click', function(e){
  var cat = e.target.closest && e.target.closest('[data-action="pos-category"], .pos-category, .pos-categories-panel .chip, [data-category-id]');
  if(cat){ selected = canon(categoryFrom(cat) || 'All Products'); schedule(); return; }
  var add = e.target.closest && e.target.closest('[data-action="add-to-basket"]');
  if(add){ var id = add.getAttribute('data-id') || add.dataset.id; var ev = new CustomEvent('pos:add-to-basket',{detail:{productId:id}}); window.dispatchEvent(ev); return; }
});

// search input handling (support multiple possible IDs)
document.addEventListener('input', function(e){
  var target = e.target || e.srcElement;
  if(!target) return;
  if(['posProductSearch','productSearch'].indexOf(target.id) !== -1 || target.matches && target.matches('input[data-pos-search]')) schedule();
}, true);

window.addEventListener('hashchange', schedule);
window.addEventListener('load', schedule);
// also render on initial DOM ready
if(document.readyState === 'complete' || document.readyState === 'interactive') schedule(); else document.addEventListener('DOMContentLoaded', schedule);

})();
