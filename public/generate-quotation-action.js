(function () {
  function firstPositive() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = Number(arguments[i]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 1;
  }

  function firstFinite() {
    for (var i = 0; i < arguments.length; i += 1) {
      var raw = arguments[i];
      if (typeof raw === 'string') raw = raw.replace(/,/g, '').trim();
      var value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function normalizeQuotationPayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;

    var payload = Object.assign({}, input);
    var sourceItems = Array.isArray(payload.items) ? payload.items
      : Array.isArray(payload.lines) ? payload.lines
      : Array.isArray(payload.cart) ? payload.cart
      : Array.isArray(payload.basket) ? payload.basket
      : [];

    if (sourceItems.length) {
      payload.items = sourceItems.map(function (item, index) {
        var row = Object.assign({}, item || {});
        var quantity = firstPositive(
          row.qty,
          row.quantity,
          row.qtyOrdered,
          row.quantityOrdered,
          row.count,
          row.amount
        );
        var unitPrice = firstFinite(
          row.unit_price,
          row.unitPrice,
          row.price,
          row.selling_price,
          row.sellingPrice,
          row.rate
        );

        row.qty = quantity;
        row.quantity = quantity;
        row.unit_price = unitPrice;
        row.unitPrice = unitPrice;
        row.description = String(
          row.description || row.product_name || row.productName || row.name || row.title || ('Custom line ' + (index + 1))
        ).trim();
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
      var isQuotationWrite = (method === 'POST' || method === 'PUT') && /\/api\/quotations(?:\/\d+)?(?:\?|$)/.test(url);

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
