(()=>{
'use strict';
const TOKEN='uniquepos.token';
let items=[]; let loading=false; let timer=null;
const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const route=()=>String(location.hash||'').replace(/^#/,'').split('?')[0];
function headers(){const t=localStorage.getItem(TOKEN)||'';return t?{Accept:'application/json',Authorization:'Bearer '+t}:{Accept:'application/json'};}
function stockOf(x){for(const k of ['quantity_on_hand','current_stock','stock','quantity']){const n=Number(x?.[k]);if(Number.isFinite(n))return n;}return 0;}
function keyMap(rows){const m=new Map();rows.forEach(x=>{const p={id:x.id,name:x.name??x.product_name,sku:x.sku??x.product_code,barcode:x.barcode,stock:stockOf(x)};for(const k of [p.id,p.name,p.sku,p.barcode]){const z=norm(k);if(z)m.set(z,p);}});return m;}
function findProduct(card,map){const id=card.dataset.productId||card.dataset.id||card.querySelector('[data-product-id]')?.dataset.productId||'';let p=map.get(norm(id));if(p)return p;const text=norm(card.textContent||'');for(const x of new Set(map.values())){if((x.sku&&text.includes(norm(x.sku)))||(x.barcode&&text.includes(norm(x.barcode)))||(x.name&&text.includes(norm(x.name))))return x;}return null;}
function apply(){if(route()!=='sales'||!items.length)return;const map=keyMap(items);const root=document.getElementById('viewRoot')||document;const cards=[...root.querySelectorAll('.product-card,.product-grid > *,article')].filter(c=>!c.closest('#salesCatalogV5'));
 cards.forEach(card=>{const p=findProduct(card,map);if(!p)return;const available=p.stock>0;const status=[...card.querySelectorAll('span,small,div')].find(el=>/^(in stock|low stock|out of stock)$/i.test(el.textContent.trim()));if(status){status.textContent=available?'In stock':'Out of stock';status.classList.remove('out','low','ok');status.classList.add(available?'ok':'out');}const add=[...card.querySelectorAll('button')].find(b=>/^\s*\+?\s*add\s*$/i.test(b.textContent||''));if(add){add.disabled=!available;add.setAttribute('aria-disabled',String(!available));}});
}
async function load(){if(loading||route()!=='sales')return;loading=true;try{const u=new URL('/api/products',location.origin);u.searchParams.set('limit','1000');u.searchParams.set('fallback_product_stock','true');const b=document.getElementById('branchSelect')?.value;if(b)u.searchParams.set('branch_id',b);const r=await fetch(u,{cache:'no-store',headers:headers()});if(!r.ok)return;const j=await r.json();items=Array.isArray(j)?j:(Array.isArray(j.data)?j.data:(Array.isArray(j.products)?j.products:[]));apply();}catch(_){}finally{loading=false;}}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(route()==='sales'){load();apply();}},80);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);window.addEventListener('DOMContentLoaded',schedule);document.addEventListener('change',e=>{if(e.target?.id==='branchSelect'){items=[];schedule();}});setInterval(()=>{if(route()==='sales')apply();},250);schedule();
})();
