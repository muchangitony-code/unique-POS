(()=>{
'use strict';
const S={items:[],category:'__all__',query:'',loading:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const root=()=>document.getElementById('viewRoot');
const input=()=>document.getElementById('posProductSearch');
const isSales=()=>String(location.hash||'').replace(/^#/,'').split('?')[0]==='sales';
function area(){const i=input();let n=i;while(n&&n!==root()){if(/new sale/i.test(n.textContent||'')&&/browse by category/i.test(n.textContent||''))return n;n=n.parentElement}return root()}
function categories(){return [...new Map(S.items.map(p=>[norm(p.category),p.category]).filter(x=>x[0])).values()].sort((a,b)=>a.localeCompare(b))}
function authHeaders(){const t=localStorage.getItem('uniquepos.token')||'';return t?{Accept:'application/json',Authorization:'Bearer '+t}:{Accept:'application/json'}}
async function load(){
 if(S.loading||!isSales())return;
 const b=document.getElementById('branchSelect')?.value;
 if(!b){S.items=[];render();return}
 S.loading=true;
 try{
  const u=new URL('/api/v3/inventory/products',location.origin);u.searchParams.set('branchId',b);u.searchParams.set('limit','1000');
  const r=await fetch(u,{cache:'no-store',headers:authHeaders()});if(!r.ok)throw Error('Current inventory catalogue unavailable');
  const j=await r.json();const a=Array.isArray(j.products)?j.products:Array.isArray(j.data)?j.data:[];
  S.items=a.map(x=>({id:x.id,name:String(x.name??x.product_name??''),sku:String(x.sku??x.product_code??''),barcode:String(x.barcode??''),category:String(x.category_name??x.categoryName??(x.category&&typeof x.category==='object'?(x.category.name??x.category.label):x.category)??'Uncategorised').trim()||'Uncategorised',price:Number(x.selling_price??x.sellingPrice??x.price??0),stock:Number(x.quantity_on_hand??x.current_stock??x.stock??x.quantity??0)})).filter(x=>x.name);
  render();syncLegacy();
 }catch(e){showError(e.message)}finally{S.loading=false}
}
function filtered(){const q=norm(S.query);return S.items.filter(p=>(S.category==='__all__'||norm(p.category)===norm(S.category))&&(!q||norm([p.name,p.sku,p.barcode].join(' ')).includes(q)))}
function render(){
 if(!isSales())return;const a=area();if(!a)return;let box=document.getElementById('salesCatalogV5');
 if(!box){box=document.createElement('section');box.id='salesCatalogV5';const i=input();if(i)i.parentElement.insertAdjacentElement('afterend',box);else a.prepend(box)}
 const cats=categories(),rows=filtered();
 box.innerHTML=`<div class="sc5-head"><input id="sc5q" type="search" placeholder="Search current inventory by name, SKU or barcode" value="${esc(S.query)}"><button id="sc5refresh" type="button">↻</button></div><div class="sc5-cats"><button type="button" data-cat="__all__" class="${S.category==='__all__'?'on':''}">All Products</button>${cats.map(c=>`<button type="button" data-cat="${esc(c)}" class="${S.category===c?'on':''}">${esc(c)}</button>`).join('')}</div><div class="sc5-count">${rows.length} products · Current branch inventory</div><div class="sc5-list">${rows.map(p=>`<article data-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.sku||p.barcode||'')}</small><b>KES ${p.price.toLocaleString(undefined,{minimumFractionDigits:2})}</b><span>${p.stock>0?'In stock':'Out of stock'}</span><button type="button" data-add="${esc(p.id)}" ${p.stock<=0?'disabled':''}>+ Add</button></article>`).join('')||'<div class="sc5-empty">No matching products in current branch inventory.</div>'}</div>`;
 box.querySelector('#sc5q').oninput=e=>{S.query=e.target.value;render()};box.querySelector('#sc5refresh').onclick=()=>{S.loading=false;load()};box.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{S.category=b.dataset.cat;render()});box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));hideLegacy(a)
}
function syncLegacy(){
 if(!isSales()||!S.items.length)return;
 const a=area()||root();if(!a)return;
 const byKey=new Map();S.items.forEach(p=>{byKey.set(norm(p.id),p);byKey.set(norm(p.sku),p);byKey.set(norm(p.barcode),p);byKey.set(norm(p.name),p)});
 const cards=[...a.querySelectorAll('.product-card,article')].filter(c=>!c.closest('#salesCatalogV5'));
 cards.forEach(card=>{
  const id=card.dataset.productId||card.dataset.id||'';
  const text=norm(card.textContent||'');let p=byKey.get(norm(id));
  if(!p){for(const item of S.items){if((item.sku&&text.includes(norm(item.sku)))||(item.barcode&&text.includes(norm(item.barcode)))||text.includes(norm(item.name))){p=item;break}}}
  if(!p)return;
  const status=[...card.querySelectorAll('.stock-pill,.stock-status,span')].find(el=>/^(in stock|low stock|out of stock)$/i.test(el.textContent.trim()));
  if(status){status.textContent=p.stock>0?'In stock':'Out of stock';status.classList.remove('out','low','ok');status.classList.add(p.stock>0?'ok':'out')}
  const addBtn=[...card.querySelectorAll('button')].find(b=>/add/i.test(b.textContent||''));if(addBtn){addBtn.disabled=p.stock<=0;addBtn.setAttribute('aria-disabled',p.stock<=0?'true':'false')}
 })
}
function showError(m){const b=document.getElementById('salesCatalogV5');if(b)b.innerHTML=`<div class="sc5-empty">${esc(m)}</div>`}
function hideLegacy(a){if(!a)return;[...a.querySelectorAll('.filter-chips,.product-grid')].forEach(x=>{if(!x.closest('#salesCatalogV5'))x.style.display='none'})}
async function add(id){const p=S.items.find(x=>String(x.id)===String(id));if(!p||p.stock<=0)return;const i=input();if(!i)return;i.value=p.sku||p.barcode||p.name;i.dispatchEvent(new Event('input',{bubbles:true}));for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,50));const a=area();const selectors=[`[data-product-id="${CSS.escape(String(p.id))}"]`,`[data-id="${CSS.escape(String(p.id))}"]`];let card=null;for(const s of selectors){card=a&&a.querySelector(s);if(card)break}if(!card&&a){card=[...a.querySelectorAll('button')].map(b=>b.closest('article,.product-card,div')).find(c=>c&&norm(c.textContent).includes(norm(p.name)))}if(card){const b=card.matches('button')?card:card.querySelector('button[data-action*="add"],button');if(b&&!b.disabled){b.click();i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));return}}}alert('The selected inventory item could not be handed to the basket.')}
function install(){if(!document.getElementById('salesCatalogV5Style')){const s=document.createElement('style');s.id='salesCatalogV5Style';s.textContent='#salesCatalogV5{margin-top:12px;border-top:1px solid #e5e8ed;padding-top:12px}.sc5-head{display:flex;gap:8px}.sc5-head input{flex:1;min-width:0}.sc5-cats{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.sc5-cats button,.sc5-list button{padding:8px 12px;border:1px solid #d8dde5;border-radius:9px;background:#fff}.sc5-cats .on,.sc5-list button{background:#ff9418;color:#fff;border-color:#ff9418}.sc5-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-height:480px;overflow:auto;margin-top:9px}.sc5-list article{border:1px solid #e1e5ea;border-radius:10px;padding:10px;display:grid;gap:5px}.sc5-list b{color:#b76500}.sc5-list span{color:#486b48;font-size:.82rem}.sc5-list button:disabled{opacity:.45}.sc5-count{color:#667}.sc5-empty{padding:14px;border:1px solid #e1e5ea;border-radius:9px}@media(max-width:700px){.sc5-list{grid-template-columns:1fr}}';document.head.appendChild(s)}load();syncLegacy()}
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(()=>{if(isSales())install();else document.getElementById('salesCatalogV5')?.remove()},80)}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(install,100));window.addEventListener('DOMContentLoaded',()=>setTimeout(install,300));document.addEventListener('change',e=>{if(e.target?.id==='branchSelect'){S.items=[];S.category='__all__';setTimeout(load,50)}});setInterval(()=>{if(isSales()&&S.items.length)syncLegacy()},500);
})();
