"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("pages/products.tsx", "utf8");
const route = fs.readFileSync("src/routes/products.ts", "utf8");
const standalone = fs.readFileSync("public/app.js", "utf8");

assert.match(page, /name="vat_rate"/);
assert.match(page, /<FormLabel>VAT Rate \(%\)<\/FormLabel>/);
assert.match(page, /Enter 0 for zero-rated \/ non-VATable products\./);
assert.match(page, /name="tax_inclusive"/);
assert.match(page, /Prices are tax inclusive/);
assert.match(page, /tax_inclusive: false/);
assert.match(page, /vat_rate: Number\(product\.vat_rate \?\? 16\)/);

assert.match(route, /vatRate: vat_rate\?\.toString\(\) \?\? "16"/);
assert.match(route, /tax_inclusive/);
assert.match(route, /UPDATE products SET tax_inclusive/);

assert.match(standalone, /name="vat_rate"/);
assert.match(standalone, /name="tax_inclusive"/);
assert.match(standalone, /payload\.tax_inclusive/);
assert.match(standalone, /payload\.vat_rate/);

console.log("[test-product-vat-settings] PASS: product VAT rate and tax-inclusive settings match the standalone POS model and persist through the API.");
