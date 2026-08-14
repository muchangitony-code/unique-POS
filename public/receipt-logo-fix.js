/* Unique POS — receipt preview logo fallback
   Keeps receipt/thermal-preview logos working even when a document renderer
   supplies a stale or relative logo URL. The canonical brand asset is served
   from the public assets directory and is available in the deployed app.
*/
(() => {
  const CANONICAL_LOGO = '/assets/unique-solar-kenya-logo.svg';
  const LOGO_ALTS = new Set(['logo', 'unique solar kenya', 'unique solar &general supplies limited']);

  const fixLogo = (img) => {
    if (!(img instanceof HTMLImageElement)) return;
    const alt = String(img.getAttribute('alt') || '').trim().toLowerCase();
    const src = String(img.getAttribute('src') || '').trim();
    const isBrandLogo = LOGO_ALTS.has(alt) || /logo/i.test(alt) || img.classList.contains('receipt-logo');
    if (!isBrandLogo) return;

    // If the renderer already points at the canonical asset, leave it alone.
    if (src === CANONICAL_LOGO || src.endsWith('/assets/unique-solar-kenya-logo.svg')) return;
    img.dataset.logoFallbackApplied = 'true';
    img.src = CANONICAL_LOGO;
  };

  const scan = (root = document) => {
    root.querySelectorAll?.('img').forEach(fixLogo);
  };

  document.addEventListener('DOMContentLoaded', () => {
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('img')) fixLogo(node);
          scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Capture failed image loads, including images created dynamically by previews.
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) fixLogo(event.target);
  }, true);
})();
