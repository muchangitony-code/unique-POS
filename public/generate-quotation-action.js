(function () {
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

      /*
       * Do not call Save Sale, Complete Sale, Print, or any checkout action.
       * The POS already has a dedicated quotation action in app.js:
       *   suspend-sale -> createQuotationFromBasket()
       * That path creates a quotation directly and must not validate amount_paid.
       */
      var quotationButton = document.querySelector('[data-action="suspend-sale"]');
      if (!quotationButton) {
        window.alert('The quotation action is not available. Please reload the POS.');
        return;
      }
      quotationButton.click();
    });

    preview.parentNode.insertBefore(button, preview.nextSibling);
  }

  var observer = new MutationObserver(addGenerateQuotationButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addGenerateQuotationButton);
  } else {
    addGenerateQuotationButton();
  }
})();
