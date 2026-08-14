(function () {
  "use strict";

  function isQuotationDocument(root) {
    if (!root) return false;
    var text = (root.textContent || "").toLowerCase();
    return /\bquotation\b|quote no\.?|quotation no\.?|valid until/.test(text);
  }

  function normalizeQuotation(root) {
    if (!root || !isQuotationDocument(root)) return;

    root.classList.add("professional-quotation-document");

    var tables = root.querySelectorAll("table");
    tables.forEach(function (table) {
      table.style.height = "auto";
      table.style.minHeight = "0";
      table.style.display = "table";
      table.style.borderCollapse = "collapse";
      table.style.borderSpacing = "0";
      table.querySelectorAll("tr").forEach(function (row) {
        row.style.height = "auto";
        row.style.minHeight = "0";
        row.style.display = "table-row";
      });
      table.querySelectorAll("th, td").forEach(function (cell) {
        cell.style.height = "auto";
        cell.style.minHeight = "0";
        cell.style.display = "table-cell";
        cell.style.verticalAlign = "top";
      });
    });

    /* Remove fixed row heights/min-heights that caused the large blank spaces. */
    root.querySelectorAll("[style]").forEach(function (el) {
      var style = el.getAttribute("style") || "";
      if (/height\s*:/i.test(style) || /min-height\s*:/i.test(style)) {
        el.style.height = "auto";
        el.style.minHeight = "0";
      }
    });
  }

  function scan() {
    var candidates = [];
    var modalBody = document.getElementById("modalBody");
    if (modalBody) candidates.push(modalBody);
    document.querySelectorAll("[id*='quotation'], [class*='quotation'], [class*='document-preview']").forEach(function (el) {
      candidates.push(el);
    });
    candidates.forEach(normalizeQuotation);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  var observer = new MutationObserver(function () { scan(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("beforeprint", scan);
})();
