"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "public", "app.js");
let source = fs.readFileSync(file, "utf8");

const CHECKOUT_MARKER = "const amountPaid = state.pos.payment_method === \"credit\" ? 0 : (enteredAmount > 0 ? enteredAmount : grandTotal);";
const UI_MARKER = "/* UNIQUEPOS AUTO PAYMENT SYNC */";

// Patch the checkout validation once. This is intentionally idempotent because
// Railway can execute this script during both build and startup.
if (!source.includes(CHECKOUT_MARKER)) {
  function patchCheckoutFunction(functionName) {
    const start = source.indexOf(`async function ${functionName}()`);
    if (start < 0) throw new Error(`Checkout function not found: ${functionName}`);
    const next = source.indexOf("\n  async function ", start + 10);
    const end = next >= 0 ? next : source.length;
    let block = source.slice(start, end);

    const old = `    const totals = calculatePosTotals();\n    if (state.pos.payment_method !== "credit" && firstNumber(state.pos.amount_paid, 0) < totals.total) {\n      showToast("Amount paid is less than the grand total.", "error");\n      return;\n    }\n    const payload = {`;
    const replacement = `    const totals = calculatePosTotals();\n    const enteredAmount = Math.round(firstNumber(state.pos.amount_paid, 0) * 100) / 100;\n    const grandTotal = Math.round(firstNumber(totals.total, 0) * 100) / 100;\n    // Normal sales are automatically treated as fully paid. A positive amount\n    // entered by the cashier is still respected for change/underpayment checks.\n    const amountPaid = state.pos.payment_method === "credit" ? 0 : (enteredAmount > 0 ? enteredAmount : grandTotal);\n    if (state.pos.payment_method !== "credit" && amountPaid + 0.005 < grandTotal) {\n      showToast("Amount received " + money(amountPaid) + " is less than the sale total " + money(grandTotal) + ".", "error");\n      return;\n    }\n    const payload = {`;
    if (!block.includes(old)) throw new Error(`Checkout validation block not found: ${functionName}`);
    block = block.replace(old, replacement);

    const oldPayload = `      amount_paid: state.pos.payment_method === "credit" ? 0 : firstNumber(state.pos.amount_paid, 0),`;
    const newPayload = `      amount_paid: amountPaid,`;
    if (!block.includes(oldPayload)) throw new Error(`Checkout payment payload not found: ${functionName}`);
    block = block.replace(oldPayload, newPayload);

    source = source.slice(0, start) + block + source.slice(end);
  }

  patchCheckoutFunction("completeSale");
  patchCheckoutFunction("completeSaleAndThen");
}

// The checkout must also be visually automatic: when items are in the basket,
// Cash Received is populated with the live Grand Total. This prevents a cashier
// from having to type the sale amount just to complete a normal full-payment sale.
// A cashier can still type a different positive amount to calculate change or
// deliberately test an underpayment; that manual value is not overwritten.
if (!source.includes(UI_MARKER)) {
  const injection = `\n  ${UI_MARKER}\n  (function installAutomaticBasketPayment() {\n    let scheduled = false;\n\n    function syncPaymentField() {\n      scheduled = false;\n      try {\n        if (!state || !state.pos || state.pos.payment_method === "credit") return;\n        const items = Array.isArray(state.pos.items) ? state.pos.items : [];\n        if (!items.length || typeof calculatePosTotals !== "function") return;\n        const input = document.getElementById("posAmountPaidInput");\n        if (!input || input.dataset.manual === "true") return;\n\n        const totals = calculatePosTotals();\n        const grandTotal = Math.round(Number(totals.total || 0) * 100) / 100;\n        state.pos.amount_paid = grandTotal;\n        input.value = grandTotal.toFixed(2);\n      } catch (_error) {}\n    }\n\n    function scheduleSync() {\n      if (scheduled) return;\n      scheduled = true;\n      window.requestAnimationFrame(function () {\n        syncPaymentField();\n        window.setTimeout(syncPaymentField, 50);\n      });\n    }\n\n    document.addEventListener("input", function (event) {\n      const target = event.target;\n      if (target && target.id === "posAmountPaidInput") {\n        target.dataset.manual = "true";\n      }\n    }, true);\n\n    const observer = new MutationObserver(scheduleSync);\n    if (document.body) observer.observe(document.body, { childList: true, subtree: true });\n    window.setInterval(syncPaymentField, 500);\n    scheduleSync();\n  })();\n`;
  const closing = "\n})();";
  const closingIndex = source.lastIndexOf(closing);
  if (closingIndex < 0) throw new Error("Unable to locate application closing marker for automatic payment sync.");
  source = source.slice(0, closingIndex) + injection + source.slice(closingIndex);
}

fs.writeFileSync(file, source);
console.log("UniquePOS checkout repaired: basket sales now automatically populate Cash Received with the live Grand Total; manual positive amounts remain respected and credit sales remain zero-paid.");
