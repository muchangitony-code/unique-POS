"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "public", "app.js");
let source = fs.readFileSync(file, "utf8");

// The live frontend currently starts Cash Received at 0. The checkout guard then
// rejects a normal sale before the API is called. Make zero mean "pay the current
// grand total" for non-credit sales, while still rejecting a deliberately entered
// amount that is below the total.
function patchCheckoutFunction(functionName) {
  const start = source.indexOf(`async function ${functionName}()`);
  if (start < 0) throw new Error(`Checkout function not found: ${functionName}`);
  const next = source.indexOf("\n  async function ", start + 10);
  const end = next >= 0 ? next : source.length;
  let block = source.slice(start, end);

  const old = `    const totals = calculatePosTotals();\n    if (state.pos.payment_method !== "credit" && firstNumber(state.pos.amount_paid, 0) < totals.total) {\n      showToast("Amount paid is less than the grand total.", "error");\n      return;\n    }\n    const payload = {`;
  const replacement = `    const totals = calculatePosTotals();\n    const enteredAmount = Math.round(firstNumber(state.pos.amount_paid, 0) * 100) / 100;\n    const grandTotal = Math.round(firstNumber(totals.total, 0) * 100) / 100;\n    // A normal sale defaults to full payment. If the cashier enters a positive\n    // amount, that amount is respected so change/underpayment validation still works.\n    const amountPaid = state.pos.payment_method === "credit" ? 0 : (enteredAmount > 0 ? enteredAmount : grandTotal);\n    if (state.pos.payment_method !== "credit" && amountPaid + 0.005 < grandTotal) {\n      showToast("Amount received " + money(amountPaid) + " is less than the sale total " + money(grandTotal) + ".", "error");\n      return;\n    }\n    const payload = {`;
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

fs.writeFileSync(file, source);
console.log("UniquePOS checkout fixed: zero Cash Received now defaults to the live grand total for non-credit sales; manually entered amounts remain validated for underpayment.");
