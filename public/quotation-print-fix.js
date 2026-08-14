(function () {
  "use strict";

  var INVOICE_TERMS = [
    "Payment is due according to the payment terms stated on this invoice.",
    "Goods remain the property of the seller until payment is received in full.",
    "Warranty is provided in accordance with the manufacturer's warranty terms, where applicable.",
    "Returns or exchanges are subject to the company's return policy and proof of purchase.",
    "Any invoice discrepancy should be reported within 48 hours of receipt.",
    "Errors and Omissions Excepted (E.&O.E.)."
  ];

  var QUOTATION_TERMS = [
    "This quotation is valid for 30 days from the date of issue unless otherwise stated.",
    "Prices are subject to product availability and may change after the validity period.",
    "Delivery timelines are subject to stock availability and confirmed order requirements.",
    "Warranty is provided in accordance with the manufacturer's warranty terms, where applicable.",
    "Goods remain the property of the seller until payment is received in full.",
    "Returns are subject to the company's return policy and proof of purchase.",
    "Errors and Omissions Excepted (E.&O.E.)."
  ];

  function documentType(root) {
    var text = (root && root.textContent || "").toLowerCase();
    if (/\binvoice\b|invoice no\.?/.test(text)) return "invoice";
    if (/\bquotation\b|quote no\.?|quotation no\.?|valid until/.test(text)) return "quotation";
    return "";
  }

  function replaceDefaultTerms(root, type) {
    var section = root.querySelector(".tsec");
    if (!section) return;

    var heading = section.querySelector(".slabel");
    if (heading) heading.textContent = "Commercial Terms & Conditions";

    var list = section.querySelector(".tlist");
    if (!list) return;

    var source = type === "invoice" ? INVOICE_TERMS : QUOTATION_TERMS;
    var existing = Array.from(list.querySelectorAll("li")).map(function (item) {
      return (item.textContent || "").trim().toLowerCase();
    }).join(" | ");

    /* Replace the generic placeholder/default wording with real commercial terms. */
    if (!existing || /quotation valid for 30 days|goods remain the property|warranty applies where specified|returns are subject to our return policy|errors and omissions excepted/.test(existing)) {
      list.innerHTML = source.map(function (term, index) {
        return '<li><span class="term-num">' + String(index + 1).padStart(2, "0") + '</span><span class="term-text">' + escapeHtml(term) + '</span></li>';
      }).join("");
    } else {
      Array.from(list.querySelectorAll("li")).forEach(function (item, index) {
        if (!item.querySelector(".term-num")) {
          var text = item.textContent || "";
          item.innerHTML = '<span class="term-num">' + String(index + 1).padStart(2, "0") + '</span><span class="term-text">' + escapeHtml(text.trim()) + '</span>';
        }
      });
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeA4Document(root) {
    var type = documentType(root);
    if (!root || !type) return;

    root.classList.add("professional-a4-document");
    root.classList.add(type === "invoice" ? "professional-invoice-document" : "professional-quotation-document");

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

    root.querySelectorAll("[style]").forEach(function (el) {
      var style = el.getAttribute("style") || "";
      if (/height\s*:/i.test(style) || /min-height\s*:/i.test(style)) {
        el.style.height = "auto";
        el.style.minHeight = "0";
      }
    });

    replaceDefaultTerms(root, type);
  }

  function scan() {
    var candidates = [];
    var modalBody = document.getElementById("modalBody");
    if (modalBody) candidates.push(modalBody);
    document.querySelectorAll("[id*='quotation'], [id*='invoice'], [class*='quotation'], [class*='invoice'], [class*='document-preview']").forEach(function (el) {
      candidates.push(el);
    });
    candidates.forEach(normalizeA4Document);
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
