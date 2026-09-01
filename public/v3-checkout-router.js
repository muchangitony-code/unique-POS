/* Checkout cutover: Inventory V3 is the stock authority; the existing POS endpoint remains the transaction authority. */
(()=>{
  'use strict';
  const previousFetch=window.fetch.bind(window);
  const branchId=()=>{const n=Number(document.getElementById('branchSelect')?.value);return Number.isFinite(n)&&n>0?n:1;};
  const urlOf=input=>new URL(input instanceof Request?input.url:(typeof input==='string'?input:input.url),location.origin);
  const methodOf=(input,init)=>String(init?.method||(input instanceof Request&&input.method)||'GET').toUpperCase();
  const parseBody=async(input,init)=>{
    const raw=init?.body!==undefined?init.body:(input instanceof Request?await input.clone().text():null);
    if(!raw)return null;
    if(typeof raw==='string')try{return JSON.parse(raw);}catch(_){return null;}
    if(raw instanceof URLSearchParams)return Object.fromEntries(raw.entries());
    return null;
  };
  const linesOf=body=>{
    const src=body?.items||body?.cart||body?.lines||body?.products||[];
    return Array.isArray(src)?src.map(x=>({product_id:x.product_id??x.productId??x.id,quantity:Number(x.quantity??x.qty??x.count??0)})).filter(x=>x.product_id!=null&&Number.isFinite(x.quantity)&&x.quantity>0):[];
  };
  const authHeaders=(init,input)=>{
    const h=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)||{});
    if(!h.has('content-type'))h.set('content-type','application/json');
    return h;
  };
  const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  const v3=async(path,payload,headers)=>{
    const r=await previousFetch(path,{method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload)});
    let d=null;try{d=await r.clone().json();}catch(_){}
    return {r,d};
  };
  window.fetch=async function(input,init){
    const u=urlOf(input),method=methodOf(input,init);
    if(u.origin!==location.origin||method!=='POST'||u.pathname!=='/api/pos/sale')return previousFetch(input,init);
    const body=await parseBody(input,init);
    const items=linesOf(body);
    if(!items.length)return previousFetch(input,init);
    const headers=authHeaders(init,input);
    const stockPayload={branchId:body?.branchId??body?.branch_id??branchId(),items,source:'pos_checkout'};
    let stockApplied=false;
    try{
      const stock=await v3('/api/v3/inventory/sale',stockPayload,headers);
      if(!stock.r.ok)return json({success:false,error:stock.d?.error||stock.d?.message||'Unable to deduct stock from authoritative inventory.'},stock.r.status);
      stockApplied=true;
      const sale=await previousFetch(input,init);
      if(sale.ok)return sale;
      const restorePayload={branchId:stockPayload.branchId,items,source:'pos_checkout_failed'};
      await v3('/api/v3/inventory/sale-reversal',restorePayload,headers).catch(()=>{});
      stockApplied=false;
      return sale;
    }catch(err){
      if(stockApplied)await v3('/api/v3/inventory/sale-reversal',{branchId:stockPayload.branchId,items,source:'pos_checkout_exception'},headers).catch(()=>{});
      return json({success:false,error:err?.message||'Checkout could not be completed.'},500);
    }
  };
})();
