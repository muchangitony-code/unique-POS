(()=>{
'use strict';
/* Clean sales category controller.
 * Products remain owned and rendered exclusively by app.js.
 * This file only reads the existing Products API and filters those rendered cards.
 */
const nativeFetch=window.fetch.bind(window);
let productCategories=new Map();
let loading=null;
let active='__all__';
let lastRoot=null;

function salesRoute(){return location.hash.replace(/^#/,'').split('?')[0]==='sales';}
function branchId(){const n=Number(document.getElementById('branchSelect')?.value||0);return Number.isInteger(n)&&n>0?n:null;}
function text(v){return String(v??'').trim();}
function key(v){return text(v).toLowerCase();}
function rows(payload){return Array.isArray(payload)?payload:(payload?.data||payload?.products||[]);}
function productId(row){return text(row?.id??row?.product_id);}
function categoryName(row){
  return text(row?.category_name??row?.category?.name??row?.category??row?.categoryName??row?.category_title);
}
async function loadCatalogue(){
  if(loading)return loading;
  loading=(async()=>{
    const u=new URL('/api/products',location.origin);
    u.searchParams.set('limit','1000');
    u.searchParams.set('fallback_product_stock','true');
    const b=branchId(); if(b)u.searchParams.set('branch_id',String(b));
    const token=localStorage.getItem('uniquepos.token')||'';
    const headers={Accept:'application/json'}; if(token)headers.Authorization='Bearer '+token;
    const r=await nativeFetch(u.toString(),{cache:'no-store',headers});
    if(!r.ok)throw new Error('Products catalogue unavailable');
    const list=rows(await r.json());
    productCategories=new Map();
    for(const row of list){const id=productId(row),cat=categoryName(row);if(id)productCategories.set(id,cat||'Uncategorised');}
  })().finally(()=>{loading=null;});
  return loading;
}
function visibleCards(root){return [...root.querySelectorAll('.product-card[data-id]')];}
function categoriesForCards(cards){
  const names=[]; const seen=new Set();
  for(const card of cards){const cat=productCategories.get(text(card.dataset.id))||'Uncategorised';const k=key(cat);if(!seen.has(k)){seen.add(k);names.push(cat);}}
  return names.sort((a,b)=>a.localeCompare(b));
}
function applyFilter(root){
  const cards=visibleCards(root);
  for(const card of cards){
    const cat=productCategories.get(text(card.dataset.id))||'Uncategorised';
    card.hidden=active!=='__all__'&&key(cat)!==key(active);
  }
  let empty=root.querySelector('#cleanCategoryEmpty');
  const shown=cards.some(c=>!c.hidden);
  if(!shown&&cards.length){if(!empty){empty=document.createElement('div');empty.id='cleanCategoryEmpty';empty.className='empty-state';empty.textContent='No products in this category.';const panel=root.querySelector('.pos-products-panel');if(panel)panel.appendChild(empty);}}else if(empty)empty.remove();
}
function renderCategories(root){
  const panel=root.querySelector('.pos-categories-panel'); if(!panel)return;
  const cards=visibleCards(root); const cats=categoriesForCards(cards);
  if(active!=='__all__'&&!cats.some(c=>key(c)===key(active)))active='__all__';
  panel.innerHTML='<div class="filter-chips" id="cleanSalesCategories"></div>';
  const wrap=panel.firstElementChild;
  const make=(label,value)=>{const b=document.createElement('button');b.type='button';b.className='chip'+(value===active?' active':'');b.dataset.cleanCategory=value;b.textContent=label;wrap.appendChild(b);};
  make('All Products','__all__'); cats.forEach(c=>make(c,c));
  applyFilter(root);
}
async function mount(){
  if(!salesRoute())return;
  const root=document.getElementById('viewRoot');if(!root)return;
  lastRoot=root;
  try{await loadCatalogue();if(salesRoute()&&root===document.getElementById('viewRoot'))renderCategories(root);}catch(_){/* leave app.js products visible if API is temporarily unavailable */}
}
function reset(){active='__all__';productCategories=new Map();}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-clean-category]');if(!button)return;
  e.preventDefault();e.stopImmediatePropagation();
  active=button.dataset.cleanCategory||'__all__';
  const root=document.getElementById('viewRoot');if(root){renderCategories(root);}
},true);
document.addEventListener('change',e=>{if(e.target?.id==='branchSelect'){reset();setTimeout(mount,0);}},true);
window.addEventListener('hashchange',()=>setTimeout(mount,0));
new MutationObserver(()=>{
  if(!salesRoute())return;
  const root=document.getElementById('viewRoot');
  if(root&&root===lastRoot&&root.querySelector('.pos-categories-panel')&&!root.querySelector('#cleanSalesCategories'))setTimeout(mount,0);
  else if(root&&root!==lastRoot){lastRoot=root;setTimeout(mount,0);}
}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(mount,0);
})();
