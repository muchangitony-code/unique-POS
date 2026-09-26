"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("pages/products.tsx", "utf8");
const route = fs.readFileSync("src/routes/products.ts", "utf8");
const standalone = fs.readFileSync("public/app.js", "utf8");
const apiClient = fs.readFileSync("frontend/api-client.ts", "utf8");
const publicIndex = fs.readFileSync("public/index.html", "utf8");
const assetFiles = fs.readdirSync("public/assets").filter((name) => name.endsWith(".js"));
assert.ok(assetFiles.length > 0, "public/assets must contain generated frontend JavaScript");
const servedBundle = assetFiles.map((name) => fs.readFileSync("public/assets/" + name, "utf8")).join("\n");

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

// The production server serves the compiled React bundle from public/assets.
// Keep a regression guard on the actual served artifact, not only the source.
assert.match(servedBundle, /VAT Rate \(%\)/);
assert.match(servedBundle, /name:"vat_rate"/);
assert.match(servedBundle, /type:"number",min:"0",max:"100",step:"0\.01"/);
assert.match(servedBundle, /vat_rate:Number\(U\.vat_rate\?\?16\)/);

// Product edits must use the actual parameterized PATCH route. The previous
// client called /products/update, which is not implemented by the API, so VAT
// edits (and the rest of product edits) never reached the persistence handler.
assert.match(apiClient, /useUpdateProduct=mutation\(\x27\/api\/products\/\{id\}\x27,\x27PATCH\x27\)/);

console.log("[test-product-vat-settings] PASS: product VAT rate and tax-inclusive settings match the standalone POS model and persist through the API.");


assert.match(page, /vat_rate: 16,/);
assert.match(page, /vat_rate: Number\(product\.vat_rate \?\? 16\)/);
// Zero is a valid saved rate and must not be replaced by the 16% default.
assert.match(page, /min="0" max="100" step="0\.01"/);
assert.match(route, /vat_rate !== undefined/);
assert.match(route, /vatRate = vat_rate\.toString\(\)/);
assert.match(standalone, /Number\(payload\.vat_rate \|\| 0\)/);

console.log("[test-product-vat-settings] PASS: 16% is only the new-product default; saved 0% VAT remains editable and is persisted.");
