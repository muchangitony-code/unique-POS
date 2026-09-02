(()=>{'use strict';
const nativeFetch=window.fetch.bind(window);
function normalizeProductNames(payload){
  const lists=[];
  if(Array.isArray(payload))lists.push(payload);
  if(payload&&typeof payload==='object'){
    ['data','products','items','rows'].forEach(k=>{if(Array.isArray(payload[k]))lists.push(payload[k]);});
  }
  lists.forEach(list=>list.forEach(item=>{
    if(!item||typeof item!=='object')return;
    const name=[item.product_name,item.name,item.productName,item.item_name,item.itemName,item.title,item.description].find(v=>typeof v==='string'&&v.trim());
    if(name){item.product_name=name.trim();if(!item.name)item.name=name.trim();}
  }));
  return payload;
}
window.fetch=async function(input,init){
  const response=await nativeFetch(input,init);
  const url=typeof input==='string'?input:(input&&input.url)||'';
  if(!/\/api\/products(?:\?|$)/.test(url)||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))return response;
  try{
    const payload=normalizeProductNames(await response.clone().json());
    const headers=new Headers(response.headers);headers.set('content-type','application/json');
    return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
  }catch(_){return response;}
};
const route=()=>String(location.hash||'').replace(/^#/,'').split('?')[0];const auth=()=>{const t=localStorage.getItem('uniquepos.token');return t?{Authorization:'Bearer '+t}:{}};const get=async u=>{const r=await fetch(u,{headers:auth(),cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};function zeroStockCards(){document.querySelectorAll('.kpi-card').forEach(c=>{const l=c.querySelector('.kpi-card__label')?.textContent?.trim().toLowerCase();if(!l)return;if(l==='low stock items'||l==='out of stock items'||l==='low stock'||l==='out of stock'){const v=c.querySelector('.kpi-card__value');if(v)v.textContent='0';}})}async function enforceDashboard(){if(route()!=='dashboard')return;const root=document.getElementById('viewRoot');if(!root?.querySelector('.kpi-card'))return;zeroStockCards();try{const b=Number(document.getElementById('branchSelect')?.value)||1;const d=await get('/api/v3/inventory/dashboard?branchId='+encodeURIComponent(b));document.querySelectorAll('.kpi-card').forEach(c=>{const l=c.querySelector('.kpi-card__label')?.textContent?.trim().toLowerCase(),v=c.querySelector('.kpi-card__value');if(!v)return;if(l==='low stock items'||l==='low stock')v.textContent=Number(d.low_stock_items||0).toLocaleString();if(l==='out of stock items'||l==='out of stock')v.textContent=Number(d.out_of_stock_items||0).toLocaleString();});}catch(_){zeroStockCards();}}function schedule(){setTimeout(enforceDashboard,0);setTimeout(enforceDashboard,80);setTimeout(enforceDashboard,300);}window.addEventListener('hashchange',schedule);window.addEventListener('load',schedule);document.getElementById('branchSelect')?.addEventListener('change',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});setInterval(enforceDashboard,1000);schedule();})();