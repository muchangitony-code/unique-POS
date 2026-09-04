(function () {
  function addGenerateQuotationButton() {
    var preview = document.querySelector('[data-action="preview-quotation-before-sale"]');
    if (!preview || document.querySelector('[data-action="generate-quotation-before-sale"]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.setAttribute('data-action', 'generate-quotation-before-sale');
    button.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i>Generate Quotation';
    button.addEventListener('click', function () {
      var existing = document.querySelector('[data-action="suspend-sale"]');
      if (existing) {
        existing.click();
      } else {
        window.alert('Quotation generation is not available yet.');
      }
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
