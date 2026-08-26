(() => {
  'use strict';
  const MODULE_URL='/bulk-import-v2.js?v=20260826-2';
  let loadPromise=null;

  function loadModule(){
    if(window.UniquePOSBulkImportV2?.mount)return Promise.resolve(window.UniquePOSBulkImportV2);
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-bulk-import-v2]');
      if(existing)existing.remove();
      const script=document.createElement('script');
      script.src=MODULE_URL+'&t='+Date.now();
      script.async=false;
      script.dataset.bulkImportV2='1';
      script.onload=()=>{
        if(window.UniquePOSBulkImportV2?.mount)resolve(window.UniquePOSBulkImportV2);
        else reject(new Error('Bulk Import module loaded but did not initialize.'));
      };
      script.onerror=()=>reject(new Error('Bulk Import module failed to load.'));
      document.head.appendChild(script);
    }).finally(()=>{loadPromise=null;});
    return loadPromise;
  }

  function install(){
    const appShell=document.getElementById('appShell');
    const topbar=document.querySelector('.topbar__right');
    const modal=document.getElementById('modalOverlay');
    const body=document.getElementById('modalBody');
    const title=document.getElementById('modalTitle');
    if(!appShell||!topbar||!modal||!body||!title)return;
    if(document.getElementById('bulkImportV2Button'))return;
    const button=document.createElement('button');
    button.id='bulkImportV2Button';button.type='button';button.className='btn btn-primary';
    button.innerHTML='<i class="fa-solid fa-file-import"></i> Bulk Import';
    button.addEventListener('click',async()=>{
      title.textContent='Bulk Import Products';
      const branchId=document.getElementById('branchSelect')?.value||'';
      body.innerHTML='<div class="inline-message">Loading Bulk Import…</div>';
      modal.classList.remove('hidden');
      try{
        const api=await loadModule();
        body.innerHTML='<div id="bulkImportV2Mount"></div>';
        api.mount(document.getElementById('bulkImportV2Mount'),branchId);
      }catch(error){
        console.error('[bulk-import-v2] module initialization failed',error);
        body.innerHTML='<div class="inline-message">Bulk Import could not be initialized. Please refresh the page and try again.</div>';
      }
    });
    topbar.insertBefore(button,topbar.firstChild);
  }

  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
