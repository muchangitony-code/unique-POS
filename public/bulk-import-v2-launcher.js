(() => {
  'use strict';
  function install() {
    const appShell=document.getElementById('appShell');
    const topbar=document.querySelector('.topbar__right');
    const modal=document.getElementById('modalOverlay');
    const body=document.getElementById('modalBody');
    const title=document.getElementById('modalTitle');
    if(!appShell||!topbar||!modal||!body||!title)return;
    if(document.getElementById('bulkImportV2Button'))return;
    const button=document.createElement('button');button.id='bulkImportV2Button';button.type='button';button.className='btn btn-primary';button.innerHTML='<i class="fa-solid fa-file-import"></i> Bulk Import';
    button.addEventListener('click',()=>{
      title.textContent='Bulk Import Products';
      const branchId=document.getElementById('branchSelect')?.value||'';
      body.innerHTML='<div id="bulkImportV2Mount"></div>';
      modal.classList.remove('hidden');
      if(window.UniquePOSBulkImportV2)window.UniquePOSBulkImportV2.mount(document.getElementById('bulkImportV2Mount'),branchId);
      else body.innerHTML='<div class="inline-message">Bulk Import module is still loading. Please try again.</div>';
    });
    topbar.insertBefore(button,topbar.firstChild);
  }
  const observer=new MutationObserver(install);observer.observe(document.documentElement,{childList:true,subtree:true});install();
})();
