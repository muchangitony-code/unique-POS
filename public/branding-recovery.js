(function () {
  'use strict';
  const marker = 'data-branding-recovery';
  function token() { return localStorage.getItem('token') || ''; }
  async function getBranding() {
    const r = await fetch('/api/settings/branding', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Unable to load company branding');
    return r.json();
  }
  function activePanel() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const tab = tabs.find(t => (t.getAttribute('aria-selected') === 'true') && /branding/i.test(t.textContent || ''));
    if (!tab) return null;
    const id = tab.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }
  function field(label, name, value, type) {
    return '<label style="display:block;margin:0 0 14px;font-weight:600;color:#172033">' + label +
      '<input type="' + (type || 'text') + '" name="' + name + '" value="' + String(value || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172033;font:inherit" /></label>';
  }
  async function install() {
    const panel = activePanel();
    if (!panel || panel.querySelector('[' + marker + ']')) return;
    if ((panel.textContent || '').trim().length > 40) return;
    panel.innerHTML = '<div ' + marker + ' style="max-width:900px;padding:24px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)"><h2 style="margin:0 0 8px;color:#172033">Company Branding</h2><p style="margin:0 0 22px;color:#64748b">Manage logo references, colours, typography and document identity.</p><div id="brandingRecoveryStatus" style="margin-bottom:16px;color:#64748b">Loading branding settings…</div><form id="brandingRecoveryForm"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 18px" id="brandingRecoveryFields"></div><label style="display:block;margin:0 0 14px;font-weight:600;color:#172033">Document Footer<textarea name="document_footer" style="display:block;width:100%;min-height:80px;box-sizing:border-box;margin-top:6px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172033;font:inherit"></textarea></label><button type="submit" style="padding:11px 18px;border:0;border-radius:7px;background:#1b4da5;color:#fff;font-weight:700;cursor:pointer">Save Company Branding</button></form></div>';
    const status = panel.querySelector('#brandingRecoveryStatus');
    const fields = panel.querySelector('#brandingRecoveryFields');
    try {
      const b = await getBranding();
      fields.innerHTML = field('Tagline','tagline',b.tagline) + field('Website','website',b.website) + field('VAT Number','vat_number',b.vat_number) + field('Alternative Phone','business_phone2',b.business_phone2) + field('Primary Colour','primary_color',b.primary_color || '#1B4DA5','color') + field('Secondary Colour','secondary_color',b.secondary_color || '#F5A500','color') + field('Body Font','body_font',b.body_font || 'Inter') + field('Heading Font','heading_font',b.heading_font || 'Inter') + field('Logo URL','logo_url',b.logo_url) + field('Company Stamp URL','stamp_url',b.stamp_url) + field('Signature URL','signature_url',b.signature_url);
      panel.querySelector('[name="document_footer"]').value = b.document_footer || '';
      status.textContent = 'Branding settings loaded.';
    } catch (e) { status.textContent = e.message || 'Unable to load branding settings.'; status.style.color = '#b42318'; }
    panel.querySelector('#brandingRecoveryForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget), data = {};
      fd.forEach((v,k) => data[k] = v);
      status.textContent = 'Saving…'; status.style.color = '#64748b';
      try {
        const r = await fetch('/api/settings/branding', { method:'PATCH', credentials:'same-origin', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + token()}, body:JSON.stringify(data) });
        if (!r.ok) throw new Error('Save failed (' + r.status + ')');
        status.textContent = 'Company branding saved successfully.'; status.style.color = '#15803d';
      } catch (e) { status.textContent = e.message || 'Unable to save company branding.'; status.style.color = '#b42318'; }
    });
  }
  document.addEventListener('click', function () { setTimeout(install, 250); }, true);
  const observer = new MutationObserver(function () { setTimeout(install, 100); });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(install, 800);
})();
