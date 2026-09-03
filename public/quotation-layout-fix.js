(function () {
  'use strict';

  const FIX_ID = 'unique-pos-document-layout-fix';
  const CSS = `
html,body{overflow-x:hidden!important}
*,*::before,*::after{box-sizing:border-box!important}
.page{padding:18px!important}
.sheet,.sheet--a4{height:auto!important;min-height:0!important;overflow:visible!important}
.sheet--a4{width:210mm!important;max-width:100%!important}
.body{height:auto!important;min-height:0!important;overflow:visible!important}
.hdr{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(210px,260px)!important;align-items:start!important;gap:18px!important;min-height:0!important}
.brand{display:grid!important;grid-template-columns:68px minmax(0,1fr)!important;align-items:start!important;gap:12px!important;min-width:0!important}
.brand>div,.brand-meta{min-width:0!important}
.brand h1{font-size:18px!important;line-height:1.2!important;white-space:normal!important;overflow-wrap:anywhere!important;margin:0 0 4px!important}
.brand-meta{font-size:11px!important;line-height:1.55!important;overflow-wrap:anywhere!important}
.tc{width:auto!important;min-width:210px!important;max-width:260px!important;height:auto!important;overflow:visible!important}
.tc h2,.tc .dn,.tc .ig{position:static!important;transform:none!important}
.mg{display:grid!important;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)!important;align-items:start!important;gap:12px!important;margin:0 0 18px!important}
.panel{height:auto!important;min-height:0!important;overflow:visible!important;align-self:start!important}
.panel h3,.panel .pn,.panel p,.panel strong,.panel span{position:static!important;float:none!important;max-width:none!important}
.panel p{overflow-wrap:anywhere!important}
.ig2{grid-template-columns:1fr!important;height:auto!important;gap:6px!important}
.items{clear:both!important;position:relative!important;z-index:1!important;margin-top:0!important;page-break-before:auto!important;break-before:auto!important}
.sg,.psec,.tsec,.sigs,.ftr{clear:both!important;position:relative!important;height:auto!important;overflow:visible!important}
@media screen and (max-width:900px){.sheet--a4{width:100%!important}.hdr,.mg{grid-template-columns:1fr!important}.tc{max-width:none!important}.page{padding:10px!important}.body{padding:16px!important}}
@media print{.sheet,.sheet--a4,.body,.panel,.mg,.hdr{height:auto!important;overflow:visible!important}.panel,.items,.tp,.pc,.tsec,.sigs{break-inside:avoid!important;page-break-inside:avoid!important}}
`;

  function applyFix(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head) return;
      let style = doc.getElementById(FIX_ID);
      if (!style) {
        style = doc.createElement('style');
        style.id = FIX_ID;
        doc.head.appendChild(style);
      }
      style.textContent = CSS;
    } catch (_) {}
  }

  function watch(root) {
    (root || document).querySelectorAll('iframe.modal-frame--document,iframe.modal-frame').forEach(function (frame) {
      if (frame.dataset.uniqueLayoutFixBound) return;
      frame.dataset.uniqueLayoutFixBound = '1';
      frame.addEventListener('load', function () { applyFix(frame); });
      applyFix(frame);
    });
  }

  const observer = new MutationObserver(function () { watch(document); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () { watch(document); });
  watch(document);
})();
