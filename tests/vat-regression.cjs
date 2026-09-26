"use strict";

const assert = require("node:assert/strict");

function totals(price, rate, taxInclusive) {
  const gross = Number(price);
  const tax = taxInclusive && rate > 0
    ? gross - gross / (1 + rate / 100)
    : gross * rate / 100;
  const net = gross - tax;
  return { net: Math.round(net * 100) / 100, tax: Math.round(tax * 100) / 100, total: Math.round(gross * 100) / 100 };
}

assert.deepEqual(totals(100, 16, false), { net: 100, tax: 16, total: 100 });
assert.deepEqual(totals(116, 16, true), { net: 100, tax: 16, total: 116 });
assert.deepEqual(totals(100, 0, false), { net: 100, tax: 0, total: 100 });
assert.deepEqual(totals(100, 0, true), { net: 100, tax: 0, total: 100 });

console.log("[vat-regression] PASS");
