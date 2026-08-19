/* Unique POS — receipt logo fallback + receipt print-path fix. */
(() => {
  'use strict';

  const CANONICAL_LOGO = '/assets/branding/logo-monochrome.svg';

  function fixLogo(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const alt = String(img.getAttribute('alt') || '').trim().toLowerCase();
    const isBrandLogo = img.classList.contains('receipt-logo') || /logo|unique solar/i.test(alt);
    if (!isBrandLogo) return;
    const src = String(img.getAttribute('src') || '').trim();
    if (src === CANONICAL_LOGO || src.endsWith('/assets/branding/logo-monochrome.svg')) return;
    img.src = CANONICAL_LOGO;
  }

  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) fixLogo(event.target);
  }, true);

  function receiptPrintRequest(type, id, paper) {
    const token = localStorage.getItem('uniquepos.token') || '';
    const headers = new Headers({ Accept: 'text/html' });
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const branchRaw = localStorage.getItem('uniquepos.branchId') || '';
    const branchId = parseInt(branchRaw, 10);
    if (Number.isInteger(branchId) && branchId > 0) headers.set('x-branch-id', String(branchId));
    const url = '/api/documents/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '/preview?paper=' + encodeURIComponent(paper || '80mm');
    return fetch(url, { headers }).then(async (response) => {
      if (!response.ok) {
        let message = 'Unable to load the receipt for printing.';
        try { const body = await response.json(); if (body && body.error) message = String(body.error); } catch (_) {}
        throw new Error(message);
      }
      const body = await response.json();
      if (!body || !body.html) throw new Error('The server returned an empty receipt preview.');
      return body.html;
    });
  }

  function printReceiptFromPreview(type, id, paper) {
    receiptPrintRequest(type, id, paper).then((html) => {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;height:100vh;border:0;background:#fff;';
      frame.setAttribute('aria-hidden', 'true');
      let printed = false;
      frame.onload = () => {
        window.setTimeout(() => {
          try {
            if (!frame.contentWindow) throw new Error('Print frame unavailable');
            printed = true;
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (_) {
            window.alert('Unable to open the receipt print dialog. Please use the receipt Preview and print from the browser.');
          }
          window.setTimeout(() => frame.remove(), 1500);
        }, 250);
      };
      frame.onerror = () => { if (!printed) window.alert('Unable to load the receipt for printing.'); frame.remove(); };
      document.body.appendChild(frame);
      frame.srcdoc = html;
      window.setTimeout(() => { if (!printed && frame.isConnected) frame.remove(); }, 10000);
    }).catch((error) => {
      const message = error && error.message ? error.message : 'Unable to print receipt.';
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        window.setTimeout(() => toast.classList.add('hidden'), 4500);
      } else window.alert(message);
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-action="print-document"]');
    if (!button) return;
    if (String(button.getAttribute('data-type') || '').toLowerCase() !== 'receipt') return;
    const id = button.getAttribute('data-id');
    if (!id) return;
    const paper = button.getAttribute('data-paper') || '80mm';
    event.preventDefault();
    event.stopImmediatePropagation();
    printReceiptFromPreview('receipt', id, paper);
  }, true);
})();
