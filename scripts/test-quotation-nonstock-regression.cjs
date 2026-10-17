"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const totalsPath = path.resolve(__dirname, "../src/lib/document-totals.ts");
const totalsSource = fs.readFileSync(totalsPath, "utf8");
const totalsCompiled = ts.transpileModule(totalsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const totalsModule = new Module(totalsPath, module);
totalsModule.filename = totalsPath;
totalsModule.paths = Module._nodeModulePaths(path.dirname(totalsPath));
totalsModule._compile(totalsCompiled, totalsPath);
const { computeDocumentTotals } = totalsModule.exports;
const { adaptDocumentPayload } = require("../server/pdf/document-adapter.cjs");

// 1) A non-stock quotation line is a normal commercial line for pricing.
const items = [
  { product_id: null, description: "48V Lithium Battery 10kWh", unit: "pcs", quantity: 2, unit_price: 90000, discount: 10, vat_rate: 0 },
  { product_id: 123, description: "Catalogue cable", unit: "m", quantity: 10, unit_price: 240, discount: 0, vat_rate: 16 },
];
const totals = computeDocumentTotals(items, 1000);
assert.equal(totals.subtotal, 164400);
assert.equal(totals.taxAmount, 384);
assert.equal(totals.discountAmount, 19000);
assert.equal(totals.total, 163784);

// 2) Server PDF adapter must prefer the saved human-entered description over
// the internal catalogue placeholder "Unknown".
const adapted = adaptDocumentPayload({
  type: "quotation",
  quotation: {
    quotation_number: "QTN-NONSTOCK-001",
    items: [
      { product_id: null, product_name: "Unknown", description: "48V Lithium Battery 10kWh", quantity: 2, unit_price: 90000, vat_rate: 0 },
      { product_id: null, product_name: "Unknown", description: "Custom installation service", quantity: 1, unit_price: 15000, vat_rate: 16 },
    ],
  },
});
assert.equal(adapted.doc.items[0].description, "48V Lithium Battery 10kWh");
assert.equal(adapted.doc.items[1].description, "Custom installation service");
assert.ok(!adapted.doc.items.some((item) => item.description.toLowerCase() === "unknown"));

// 3) The production UI/build path must expose the custom-line flow and the
// quotation page must normalize placeholders before print/preview.
const wizardScript = fs.readFileSync("scripts/quotation-custom-item-ui.cjs", "utf8");
assert.match(wizardScript, /Non-stock \/ Custom Item/);
assert.match(wizardScript, /product_id: null/);
assert.match(wizardScript, /Add to Quotation/);
assert.match(wizardScript, /navigation validation/);

const quotationPage = fs.readFileSync("pages/quotations.tsx", "utf8");
assert.match(quotationPage, /function quotationItemName\(it: any\)/);
assert.match(quotationPage, /product_name: quotationItemName\(it\)/);
assert.match(quotationPage, /\{quotationItemName\(it\)\}/);

console.log("[test-quotation-nonstock-regression] PASS: non-stock line pricing, persistence/display fallback, PDF adaptation, and UI guardrails are covered.");
