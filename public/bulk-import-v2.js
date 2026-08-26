(() => {
  'use strict';

  const FIELDS = [
    ['product_code','Product Code / SKU'], ['barcode','Barcode'], ['product_name','Product Name'],
    ['category','Category'], ['brand','Brand'], ['unit','Unit'], ['cost_price','Cost Price'],
    ['selling_price','Selling Price'], ['vat_rate','VAT'], ['reorder_level','Reorder Level'],
    ['opening_stock','Opening Stock'], ['supplier','Supplier'], ['location','Location'],
    ['description','Description'], ['image_url','Image URL']
  ];
  const ALIASES = {
    product_code:['productcode','productcodesku','sku','code','itemcode'], barcode:['barcode','ean','upc'],
    product_name:['productname','name','itemname'], category:['category','categoryname'], brand:['brand','brandname'],
    unit:['unit','uom'], cost_price:['costprice','cost','buyprice','purchaseprice'], selling_price:['sellingprice','saleprice','price','retailprice'],
    vat_rate:['vat','vatrate','tax','taxrate'], reorder_level:['reorderlevel','minimumstock','minstock'],
    opening_stock:['openingstock','stock','currentstock','qty','quantity'], supplier:['supplier','suppliername'],
    location:['location','branch','branchcode','branchname'], description:['description','details','notes'], image_url:['imageurl','image','photourl']
  };

  const state = { file:null, rows:[], headers:[], mapping:{}, branchId:'' };
  const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function parseCsv(text) {
    const lines = text.replace(/\r\n?/g,'\n').split('\n').filter(Boolean);
    if (!lines.length) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    return lines.map(line => { const out=[]; let cell='', quoted=false; for(let i=0;i<line.length;i++){const c=line[i],n=line[i+1]; if(c==='"'){if(quoted&&n==='"'){cell+='"';i++;}else quoted=!quoted;} else if(c===delimiter&&!quoted){out.push(cell.trim());cell='';} else cell+=c;} out.push(cell.trim()); return out; });
  }
  function mapHeaders(headers) {
    const map={};
    FIELDS.forEach(([field]) => { const aliases=ALIASES[field]||[]; const match=headers.find(h=>aliases.includes(norm(h))); if(match) map[field]=match; });
    return map;
  }
  function parseRows(matrix) {
    if(!matrix.length) return [];
    const headers=matrix[0].map((v,i)=>String(v||`Column ${i+1}`).trim());
    state.headers=headers; state.mapping=mapHeaders(headers);
    return matrix.slice(1).map((cells,i)=>{const raw={};headers.forEach((h,j)=>raw[h]=cells[j]??'');return {rowNumber:i+2,raw};}).filter(r=>Object.values(r.raw).some(v=>String(v).trim()));
  }
  function val(raw,field){return String(raw[state.mapping[field]]??'').trim();}
  function validate(row){const errors=[]; const name=val(row.raw,'product_name'), sku=val(row.raw,'product_code'), barcode=val(row.raw,'barcode'), sell=val(row.raw,'selling_price'); if(!name)errors.push('Product Name'); if(!sku&&!barcode)errors.push('SKU or Barcode'); if(sell===''||Number.isNaN(Number(sell)))errors.push('Selling Price'); return errors;}
  function render(){
    const root=document.getElementById('bulkImportV2'); if(!root)return;
    const valid=state.rows.filter(r=>!validate(r).length).length, invalid=state.rows.length-valid;
    root.innerHTML=`<div class="section-card"><div class="section-card__header"><div><h3>Bulk Import Products</h3><p>Upload a new catalogue, map columns, validate, then import.</p></div></div><div class="stack-form"><label><span>Product catalogue (CSV or Excel)</span><input id="bulkV2File" type="file" accept=".csv,.xlsx,.xls" /></label><div id="bulkV2Summary" class="inline-message">${state.file?`${esc(state.file.name)} — ${state.rows.length} rows, ${valid} valid, ${invalid} invalid.`:'Choose a CSV or Excel file to begin.'}</div><div id="bulkV2Mapping"></div><div class="modal-actions"><button id="bulkV2Import" class="btn btn-primary" ${state.rows.length&&valid?'':'disabled'}>Import ${valid} products</button></div></div></div>`;
    const file=document.getElementById('bulkV2File'); file.onchange=async()=>{state.file=file.files[0]||null;if(!state.file){state.rows=[];render();return;} const buffer=await state.file.arrayBuffer(); const ext=state.file.name.toLowerCase().split('.').pop(); if(ext==='csv'){state.rows=parseRows(parseCsv(new TextDecoder().decode(buffer)));}else{showToast('Excel mapping is handled by the server preview. Upload the file to continue.','info');state.rows=[];} render();};
    document.getElementById('bulkV2Import').onclick=importRows;
    if(state.rows.length){document.getElementById('bulkV2Mapping').innerHTML='<div class="table-wrap"><table><thead><tr><th>Field</th><th>Mapped column</th></tr></thead><tbody>'+FIELDS.map(([f,label])=>`<tr><td>${esc(label)}</td><td><select data-bulk-map="${f}"><option value="">— Not mapped —</option>${state.headers.map(h=>`<option ${state.mapping[f]===h?'selected':''} value="${esc(h)}">${esc(h)}</option>`).join('')}</select></td></tr>`).join('')+'</tbody></table></div>'; document.querySelectorAll('[data-bulk-map]').forEach(el=>el.onchange=()=>{state.mapping[el.dataset.bulkMap]=el.value;render();});}
  }
  async function importRows(){
    const rows=state.rows.filter(r=>!validate(r).length).map(r=>{const n={};FIELDS.forEach(([f])=>{const v=val(r,f); n[f]=v;}); return {rowNumber:r.rowNumber,normalized:n};});
    if(!rows.length){showToast('There are no valid rows to import.','error');return;}
    try{const response=await fetch('/api/v2/products/bulk-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({branch_id:state.branchId,rows})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Import failed');showToast(`Import complete: ${data.created} created, ${data.updated} updated.`,'success');state.rows=[];state.file=null;render();}catch(error){showToast(error.message,'error');}
  }
  window.UniquePOSBulkImportV2={mount(root,branchId){root.id='bulkImportV2';state.branchId=branchId||'';render();}};
})();
