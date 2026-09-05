(function () {
  function normalizeQuotationPayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    var payload = Object.assign({}, input);
    if (Array.isArray(payload.items)) {
      payload.items = payload.items.map(function (item) {
        var row = Object.assign({}, item);
        /* The POS basket uses `quantity`; Quotations V2 expects `qty`.
           Preserve both for compatibility, while ensuring qty is always a
           positive numeric value when a quotation is generated. */
        if (row.qty === undefined || row.qty === null || row.qty === '') {
          row.qty = row.quantity;
        }
        var numericQty = Number(row.qty);
        if (Number.isFinite(numericQty) && numericQty > 0) {
          row.qty = numericQty;
          row.quantity = numericQty;
        }
        return row;
      });
    }
    return payload;
  }

  function installQuotationRequestBridge() {
    if (window.__uniqueQuotationFetchBridgeInstalled) return;
    window.__uniqueQuotationFetchBridgeInstalled = true;

    var originalFetch = window.fetch;
    window.fetch = function (resource, options) {
      var url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
      var method = (options && options.method || 'GET').toUpperCase();
      var isQuotationWrite = method === 'POST' && /\/api\/quotations(?:\?|$)/.test(url);

      if (isQuotationWrite && options && typeof options.body === 'string') {
        try {
          var payload = JSON.parse(options.body);
          var normalized = normalizeQuotationPayload(payload);
          options = Object.assign({}, options, { body: JSON.stringify(normalized) });
        } catch (_error) {
          /* Leave non-JSON requests untouched. */
        }
      }
      return originalFetch.call(this, resource, options);
    };
  }

  function addGenerateQuotationButton() {
    var preview = document.querySelector('[data-action="preview-quotation-before-sale"]');
    if (!preview || document.querySelector('[data-action="generate-quotation-before-sale"]')) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.setAttribute('data-action', 'generate-quotation-before-sale');
    button.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i>Generate Quotation';

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      /* A quotation is not a sale and must not pass payment validation. */
      var quotationButton = document.querySelector('[data-action="suspend-sale"]');
      if (!quotationButton) {
        window.alert('The quotation action is not available. Please reload the POS.');
        return;
      }
      quotationButton.click();
    });

    preview.parentNode.insertBefore(button, preview.nextSibling);
  }

  installQuotationRequestBridge();
  var observer = new MutationObserver(addGenerateQuotationButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addGenerateQuotationButton);
  } else {
    addGenerateQuotationButton();
  }
})();
