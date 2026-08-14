"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "public", "app.js");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Checkout patch target not found: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`      amount_paid: 0,\n      notes: "",`,
`      amount_paid: 0,\n      // True means the tender amount follows the current grand total automatically.\n      // Once the cashier edits Cash Received, it becomes manual so overpayment/change is preserved.\n      amount_paid_auto: true,\n      notes: "",`,
"POS state"
);

replaceOnce(
`      if (target.id === "posAmountPaidInput") {\n        state.pos.amount_paid = clampMoney(target.value);\n        renderCurrentRoute();\n      }`,
`      if (target.id === "posAmountPaidInput") {\n        state.pos.amount_paid = clampMoney(target.value);\n        state.pos.amount_paid_auto = false;\n        renderCurrentRoute();\n      }`,
"amount-paid input handler"
);

replaceOnce(
`      case "pos-payment":\n        state.pos.payment_method = button.dataset.value || "cash";\n        renderCurrentRoute();\n        return;`,
`      case "pos-payment":\n        state.pos.payment_method = button.dataset.value || "cash";\n        state.pos.amount_paid_auto = true;\n        state.pos.amount_paid = state.pos.payment_method === "credit" ? 0 : calculatePosTotals().total;\n        renderCurrentRoute();\n        return;`,
"payment method handler"
);

replaceOnce(
`  function renderSales() {\n    const products = filterPosProducts();\n    const totals = calculatePosTotals();`,
`  function renderSales() {\n    const products = filterPosProducts();\n    const totals = calculatePosTotals();\n    // Cash/M-Pesa/card/bank sales are full-payment transactions by default.\n    // Keep Cash Received synchronized with the live grand total until the cashier edits it.\n    if (state.pos.payment_method === "credit") {\n      state.pos.amount_paid = 0;\n      state.pos.amount_paid_auto = true;\n    } else if (state.pos.amount_paid_auto) {\n      state.pos.amount_paid = totals.total;\n    }`,
"sales render synchronization"
);

replaceOnce(
`    state.pos.amount_paid = 0;\n    state.pos.notes = "";`,
`    state.pos.amount_paid = 0;\n    state.pos.amount_paid_auto = true;\n    state.pos.notes = "";`,
"basket reset"
);

replaceOnce(
`    state.pos.shipping_amount = firstNumber(held.shipping_amount, 0);\n    state.pos.notes = held.notes || "";`,
`    state.pos.shipping_amount = firstNumber(held.shipping_amount, 0);\n    state.pos.amount_paid = 0;\n    state.pos.amount_paid_auto = true;\n    state.pos.notes = held.notes || "";`,
"held-sale recall"
);

const oldCompleteGuard = `    const totals = calculatePosTotals();\n    if (state.pos.payment_method !== "credit" && firstNumber(state.pos.amount_paid, 0) < totals.total) {\n      showToast("Amount paid is less than the grand total.", "error");\n      return;\n    }\n    const payload = {`;
const newCompleteGuard = `    const totals = calculatePosTotals();\n    const amountPaid = Math.round(firstNumber(state.pos.amount_paid, 0) * 100) / 100;\n    const grandTotal = Math.round(firstNumber(totals.total, 0) * 100) / 100;\n    if (state.pos.payment_method !== "credit" && amountPaid + 0.005 < grandTotal) {\n      showToast("Amount received " + money(amountPaid) + " is less than the sale total " + money(grandTotal) + ".", "error");\n      return;\n    }\n    const payload = {`;
replaceOnce(oldCompleteGuard, newCompleteGuard, "complete sale validation");

replaceOnce(
`      amount_paid: state.pos.payment_method === "credit" ? 0 : firstNumber(state.pos.amount_paid, 0),\n      payment_method: state.pos.payment_method,`,
`      amount_paid: state.pos.payment_method === "credit" ? 0 : amountPaid,\n      payment_method: state.pos.payment_method,`,
"complete sale amount payload"
);

const oldCompleteAndThenGuard = oldCompleteGuard;
const newCompleteAndThenGuard = newCompleteGuard;
replaceOnce(oldCompleteAndThenGuard, newCompleteAndThenGuard, "complete-and-print validation");

// The second payload uses the same variable names and should use amountPaid too.
replaceOnce(
`      amount_paid: state.pos.payment_method === "credit" ? 0 : firstNumber(state.pos.amount_paid, 0),\n      payment_method: state.pos.payment_method,`,
`      amount_paid: state.pos.payment_method === "credit" ? 0 : amountPaid,\n      payment_method: state.pos.payment_method,`,
"complete-and-print amount payload"
);

fs.writeFileSync(file, source);
console.log("UniquePOS checkout payment handling repaired: non-credit sales default to the current grand total, manual tender is preserved, credit remains zero-paid, and money comparisons use cents to avoid floating-point false failures.");
