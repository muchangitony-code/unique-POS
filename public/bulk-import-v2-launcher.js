(() => {
  'use strict';
  const MODULE_SRC='/bulk-import-v2.js?v=20260826-2';
  let loadPromise=null;
  function loadModule(){
    if(window.UniquePOSBulkImportV2?.mount)return Promise.resolve(true);
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-bulk-import-v2-loader]');
      if(existing){
        existing.addEventListener('load',()=>resolve(!!window.UniquePOSBulkImportV2?.mount),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Bulk Import module failed to load.')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src=MODULE_SRC;
      script.defer=true;
      script.dataset.bulkImportV2Loader='true';
      script.onload=()=>resolve(!!window.UniquePOSBulkImportV2?.mount);
      script.onerror=()=>reject(new Error('Bulk Import module failed to load.'));
      document.head.appendChild(script);
    });
    return loadPromise;
  }
  async function openBulkImport(){
    const modal=document.getElementById('modalOverlay');
    const body=document.getElementById('modalBody');
    const title=document.getElementById('modalTitle');
    if(!modal||!body||!title)return;
    title.textContent='Bulk Import Products';
    body.innerHTML='<div id="bulkImportV2Mount"><div class="inline-message">Loading Bulk Import…</div></div>';
    modal.classList.remove('hidden');
    try{
      const loaded=await loadModule();
      if(!loaded)throw new Error('Bulk Import module could not be initialized.');
      const mount=document.getElementById('bulkImportV2Mount');
      if(!mount)throw new Error('Bulk Import window was closed while loading.');
      const branchId=document.getElementById('branchSelect')?.value||'';
      window.UniquePOSBulkImportV2.mount(mount,branchId);
    }catch(error){
      body.innerHTML=`<div class="inline-message">${String(error.message||error)}</div>`;
    }
  }
  function install(){
    const appShell=document.getElementById('appShell');
    const topbar=document.querySelector('.topbar__right');
    if(!appShell||!topbar)return;
    if(document.getElementById('bulkImportV2Button'))return;
    const button=document.createElement('button');
    button.id='bulkImportV2Button';button.type='button';button.className='btn btn-primary';
    button.innerHTML='<i class="fa-solid fa-file-import"></i> Bulk Import';
    button.addEventListener('click',openBulkImport);
    topbar.insertBefore(button,topbar.firstChild);
  }
  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
