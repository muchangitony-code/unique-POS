(()=>{
'use strict';
/* Canonical sales stock bridge.
 * The core sales renderer remains in app.js. This bridge only makes its existing
 * /api/products sales request branch-scoped before app.js consumes the response.
 * It intentionally creates no product cards, observers, polling loops, or DOM overrides.
 */
const nativeFetch=window.fetch.bind(window);
const tokenKey='uniquepos.token';
function currentBranch(){
  const el=document.getElementById('branchSelect');
  const n=Number(el?.value||0);
  return Number.isInteger(n)&&n>0?n:0;
}
function isSalesProductRequest(input){
  try{
    const raw=typeof input==='string'?input:(input&&input.url);
    const u=new URL(raw,location.origin);
    return u.origin===location.origin&&u.pathname==='/api/products'&&u.searchParams.get('in_stock_only')==='true';
  }catch(_){return false;}
}
window.fetch=async function(input,init){
  if(!isSalesProductRequest(input))return nativeFetch(input,init);
  const branchId=currentBranch();
  if(!branchId)return nativeFetch(input,init);
  const raw=typeof input==='string'?input:input.url;
  const u=new URL(raw,location.origin);
  u.searchParams.set('branch_id',String(branchId));
  u.searchParams.set('fallback_product_stock','true');
  const headers=new Headers((init&&init.headers)||(typeof input==='object'&&input.headers)||{});
  if(!headers.has('Accept'))headers.set('Accept','application/json');
  const token=localStorage.getItem(tokenKey)||'';
  if(token&&!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
  return nativeFetch(u.toString(),Object.assign({},init||{},{cache:'no-store',headers}));
};
})();
