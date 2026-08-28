(()=>{
'use strict';
/* Product-driven sales categories. No duplicate catalogue and no stock overrides. */
const fetch0=window.fetch.bind(window);
let active=''; let catalogue=[]; let busy=null;
const norm=v=>String(v??'').trim().toLowerCase();
const txt=v=>String(v??'').trim();
function sales(){return location.hash.replace(/^#/,'').split('?')[0]==='sales';}
function branch(){const v=Number(document.getElementById('branchSelect')?.value||0);return Number.isInteger(v)&&v>0?v:null;}
function list(x){return Array.isArray(x)?x:(x?.products||x?.data||[]);}
function category(p){const c=p?.category_name??p?.category?.name??p?.category??p?.categoryName??'';return txt(c)||'Uncategorised';}
function cardName(c){return txt(c.dataset.name)||txt(c.querySelector('.product-name,h3,h4,strong')?.textContent);}
function cardSku(c){return txt(c.dataset.sku)||txt(c.querySelector('[data-sku]')?.dataset.sku);}
function cardId(c){return txt(c.dataset.id||c.dataset.productId||c.dataset.product_id);}
function findProduct(c){const id=cardId(c), name=norm(cardName(c)), sku=norm(cardSku(c));return catalogue.find(p=>id&&String(p.id??p.product_id)===id)||catalogue.find(p=>sku&&norm(p.sku)===sku)||catalogue.find(p=>name&&norm(p.name??p.product_name)===name)||null;}
async function load(){if(busy)return busy;busy=(async()=>{const u=new URL('/api/products',location.origin);u.searchParams.set('limit','1000');const b=branch();if(b)u.searchParams.set('branch_id',b);const h={Accept:'application/json'};const t=localStorage.getItem('uniquepos.token');if(t)h.Authorization='Bearer '+t;const r=await fetch0(u,{headers:h,cache:'no-store'});if(!r.ok)throw Error('Unable to load products');catalogue=list(await r.json());})().finally(()=>busy=null);return busy;}
function cards(root){return [...root.querySelectorAll('.product-card')];}
function draw(root){const panel=root.querySelector('.pos-categories-panel');if(!panel)return false;const cs=cards(root);const cats=[...new Set(catalogue.map(category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));if(active&&!cats.some(c=>norm(c)===norm(active)))active='';panel.innerHTML='<div class="filter-chips" id="productDrivenCategories"></div>';const wrap=panel.firstElementChild;const add=(label,val)=>{const b=document.createElement('button');b.type='button';b.className='chip'+(val===active?' active':'');b.dataset.productCategory=val;b.textContent=label;wrap.appendChild(b);};add('All Products','');cats.forEach(c=>add(c,c));for(const c of cs){const p=findProduct(c);const show=!active||(p&&norm(category(p))===norm(active));c.hidden=!show;}return true;}
async function mount(){if(!sales())return;const root=document.getElementById('viewRoot');if(!root)return;try{await load();draw(root);}catch(e){console.warn(e);}}
function schedule(){setTimeout(mount,0);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-product-category]');if(!b)return;e.preventDefault();active=b.dataset.productCategory||'';const root=document.getElementById('viewRoot');if(root)draw(root);},true);
document.addEventListener('change',e=>{if(e.target?.id==='branchSelect'){active='';catalogue=[];schedule();}},true);
window.addEventListener('hashchange',schedule);
new MutationObserver(()=>{if(sales()){const r=document.getElementById('viewRoot');if(r&&r.querySelector('.pos-categories-panel')&&!r.querySelector('#productDrivenCategories'))schedule();}}).observe(document.documentElement,{childList:true,subtree:true});
schedule();
})();