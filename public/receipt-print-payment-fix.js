/* Unique POS — receipt print payment default.
 *
 * Receipt printing from the live Counter is an immediate checkout action. When
 * Cash Received is left blank, the cashier intends to receive the displayed
 * Grand Total, just as the invoice/quotation print actions work without a
 * separate payment entry. Populate the live payment field immediately before
 * the existing print action runs. This does NOT change complete-sale validation
 * for Save Sale or deliberately entered underpayments.
 */
(function () {
  "use strict";

  function isCreditSale() {
    var active = document.querySelector(".payment-chip.active");
    return !!active && /credit/i.test(active.textContent || "");
  }

  function readGrandTotal() {
    var candidates = document.querySelectorAll(".pos-summary-row.total strong, .pos-summary-row.total, .pos-summary-row.grand-total strong");
    for (var i = candidates.length - 1; i >= 0; i -= 1) {
      var text = String(candidates[i].textContent || "").replace(/,/g, "");
      var match = text.match(/(?:KES|KSh|\u005c$)?\s*(-?\d+(?:\.\d+)?)/i);
      if (match) {
        var value = Number(match[1]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
    }
    return null;
  }

  function syncAmountBeforeReceiptPrint() {
    if (isCreditSale()) return;
    var input = document.getElementById("posAmountPaidInput");
    if (!input) return;
    var total = readGrandTotal();
    if (total == null) return;

    var current = Number(String(input.value || "").replace(/,/g, ""));
    if (Number.isFinite(current) && current >= total && current > 0) return;

    input.value = total.toFixed(2);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function isReceiptPrintButton(button) {
    if (!button) return false;
    var action = String(button.getAttribute("data-action") || "").toLowerCase();
    var label = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (action.includes("print") && action.includes("receipt")) return true;
    if (/^print\s+receipt\b/.test(label)) return true;
    return label === "print" && !!document.getElementById("posAmountPaidInput");
  }

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-action], button") : null;
    if (isReceiptPrintButton(button)) syncAmountBeforeReceiptPrint();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "F8") syncAmountBeforeReceiptPrint();
  }, true);
})();
