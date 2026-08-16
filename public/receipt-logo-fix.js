/* Unique POS — receipt logo fallback.
   Uses the canonical public asset only when a receipt/document image fails.
   No DOM polling or MutationObserver is required. */
(() => {
  'use strict';

  const CANONICAL_LOGO = '/assets/unique-solar-kenya-logo.svg';

  function fixLogo(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const alt = String(img.getAttribute('alt') || '').trim().toLowerCase();
    const isBrandLogo = img.classList.contains('receipt-logo') || /logo|unique solar/i.test(alt);
    if (!isBrandLogo) return;
    const src = String(img.getAttribute('src') || '').trim();
    if (src === CANONICAL_LOGO || src.endsWith('/assets/unique-solar-kenya-logo.svg')) return;
    img.src = CANONICAL_LOGO;
  }

  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) fixLogo(event.target);
  }, true);
})();
