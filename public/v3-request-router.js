/* Inventory V3 routing with an explicit legacy-product escape hatch for the inventory register. */
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const branchId=()=>{const el=document.getElementById('branchSelect');const n=Number(el&&el.value);return Number.isFinite(n)&&n>0?n:1;};
  const toUrl=input=>{if(input instanceof Request)return new URL(input.url,location.origin);return new URL(typeof input==='string'?input:input.url,location.origin);};
  const requestHeaders=(input,init)=>{const headers=new Headers((init&&init.headers)||((input instanceof Request)&&input.headers)||undefined);if(!headers.has('Authorization')){const token=localStorage.getItem('uniquepos.token');if(token)headers.set('Authorization','Bearer '+token);}return headers;};
  const asJsonResponse=(payload,source)=>new Response(JSON.stringify(payload),{status:source.status||200,statusText:source.statusText||'OK',headers:{'content-type':'application/json','cache-control':'no-store'}});
  window.fetch=async function(input,init){
    const u=toUrl(input),method=((init&&init.method)||((input instanceof Request)&&input.method)||'GET').toUpperCase();
    /* Explicit bypass: the inventory register may read the established product catalogue when V3 has no migrated rows. */
    if(method==='GET'&&u.origin===location.origin&&u.pathname==='/api/products'&&u.searchParams.get('inventoryFallback')==='1')return nativeFetch(input,init);
    if(method==='GET'&&u.origin===location.origin&&u.pathname==='/api/products'){
      const q=u.searchParams.get('q')||u.searchParams.get('search')||'';const target=new URL('/api/v3/inventory/products',location.origin);target.searchParams.set('branchId',String(branchId()));if(q)target.searchParams.set('q',q);
      const r=await nativeFetch(target.toString(),{headers:requestHeaders(input,init),credentials:'same-origin',cache:'no-store'});if(!r.ok)return r;
      const data=await r.json();const products=(data.products||[]).map(p=>({...p,stock:Number(p.quantity_on_hand||0),quantity:Number(p.quantity_on_hand||0),current_stock:Number(p.quantity_on_hand||0),product_id:p.id}));return asJsonResponse(products,r);
    }
    if(method==='GET'&&u.origin===location.origin&&u.pathname==='/api/inventory/stock-count'){
      const target=new URL('/api/v3/inventory/dashboard',location.origin);target.searchParams.set('branchId',String(branchId()));const r=await nativeFetch(target.toString(),{headers:requestHeaders(input,init),credentials:'same-origin',cache:'no-store'});if(!r.ok)return r;const d=await r.json();return asJsonResponse({stock_lines:Number(d.total_products||0),low_stock:Number(d.low_stock_items||0),out_of_stock:Number(d.out_of_stock_items||0),stock_value:Number(d.inventory_cost_value||0)},r);
    }
    return nativeFetch(input,init);
  };
  window.addEventListener('change',e=>{if(e.target&&e.target.id==='branchSelect')window.dispatchEvent(new CustomEvent('inventory-v3-branch-changed'));});
})();