(function () {
  'use strict';
  const ROOT_ID = 'branding-recovery-root';
  function authHeaders(extra) {
    const t = localStorage.getItem('token') || '';
    return Object.assign({}, extra || {}, t ? { Authorization: 'Bearer ' + t } : {});
  }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isBrandingRoute() { return new URL(location.href).searchParams.get('tab') === 'branding'; }
  function host() {
    const root = document.getElementById('root');
    if (!root) return null;
    let box = document.getElementById(ROOT_ID);
    if (box) return box;
    const panel = Array.from(document.querySelectorAll('[role="tabpanel"],main,section,div')).find(function (el) {
      const text = (el.textContent || '').trim();
      return /company branding/i.test(text) && el.children.length < 12;
    });
    box = document.createElement('div'); box.id = ROOT_ID;
    if (panel) panel.replaceChildren(box); else root.replaceChildren(box);
    return box;
  }
  function renderLoading(box) { box.innerHTML = '<div style="min-height:100vh;padding:32px;box-sizing:border-box;background:#f8fafc;color:#172033;font-family:Inter,Arial,sans-serif"><div style="max-width:1050px;margin:0 auto;background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:28px"><h1 style="margin:0 0 8px">Company Branding</h1><p style="color:#64748b">Loading company branding settings…</p></div></div>'; }
  function input(label,name,value,type) { return '<label style="display:block;margin-bottom:16px;font-weight:600">'+esc(label)+'<input name="'+esc(name)+'" type="'+(type||'text')+'" value="'+esc(value)+'" style="display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:11px 12px;border:1px solid #94a3b8;border-radius:7px;background:#fff;color:#172033;font:inherit"></label>'; }
  async function install() {
    if (!isBrandingRoute()) { const stale=document.getElementById(ROOT_ID); if (stale) stale.remove(); return; }
    const box = host(); if (!box || box.dataset.loaded === '1') return;
    box.dataset.loaded = '1'; renderLoading(box);
    try {
      const r = await fetch('/api/settings/branding', { credentials:'same-origin', headers:authHeaders() });
      if (!r.ok) throw new Error('Unable to load company branding (' + r.status + ')');
      const b = await r.json();
      box.innerHTML = '<div style="min-height:100vh;padding:32px;box-sizing:border-box;background:#f8fafc;color:#172033;font-family:Inter,Arial,sans-serif"><div style="max-width:1050px;margin:0 auto;background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:28px"><h1 style="margin:0 0 8px">Company Branding</h1><p style="margin:0 0 24px;color:#64748b">Manage your logo, stamp, signature, colours, typography and document identity.</p><div id="brandingStatus" style="margin-bottom:14px;color:#64748b"></div><form id="brandingForm"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0 20px">'+input('Tagline','tagline',b.tagline)+input('Website','website',b.website)+input('VAT Number','vat_number',b.vat_number)+input('Alternative Phone','business_phone2',b.business_phone2)+input('Primary Colour','primary_color',b.primary_color || '#1B4DA5','color')+input('Secondary Colour','secondary_color',b.secondary_color || '#F5A500','color')+input('Body Font','body_font',b.body_font || 'Inter')+input('Heading Font','heading_font',b.heading_font || 'Inter')+input('Logo URL','logo_url',b.logo_url || '/logo.jpg')+input('Company Stamp URL','stamp_url',b.stamp_url)+input('Signature URL','signature_url',b.signature_url)+'</div><label style="display:block;margin-bottom:16px;font-weight:600">Document Footer<textarea name="document_footer" style="display:block;width:100%;min-height:90px;box-sizing:border-box;margin-top:7px;padding:11px 12px;border:1px solid #94a3b8;border-radius:7px;background:#fff;color:#172033;font:inherit">'+esc(b.document_footer)+'</textarea></label><button type="submit" style="padding:12px 20px;border:0;border-radius:7px;background:#1B4DA5;color:#fff;font-weight:700;cursor:pointer">Save Company Branding</button></form></div></div>';
      box.querySelector('#brandingForm').addEventListener('submit', async function (e) {
        e.preventDefault(); const status=box.querySelector('#brandingStatus'); const data={}; new FormData(e.currentTarget).forEach((v,k)=>data[k]=v); status.textContent='Saving…';
        const res=await fetch('/api/settings/branding',{method:'PATCH',credentials:'same-origin',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(data)});
        if (!res.ok) { status.textContent='Save failed ('+res.status+').'; status.style.color='#b42318'; return; }
        status.textContent='Company branding saved successfully.'; status.style.color='#15803d';
      });
    } catch (e) { box.innerHTML='<div style="min-height:100vh;padding:32px;background:#f8fafc;color:#172033;font-family:Inter,Arial,sans-serif"><div style="max-width:1050px;margin:0 auto;background:#fff;border:1px solid #fecaca;border-radius:14px;padding:28px"><h1>Company Branding</h1><p style="color:#b42318">'+esc(e.message || 'Unable to load company branding.')+'</p></div></div>'; }
  }
  setInterval(install, 400);
  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('popstate', install);
  install();
})();
