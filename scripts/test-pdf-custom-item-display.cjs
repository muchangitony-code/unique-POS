"use strict";

const assert = require("node:assert/strict");
const { adaptDocumentPayload } = require("../server/pdf/document-adapter.cjs");

const adapted = adaptDocumentPayload({
  type: "quotation",
  quotation: {
    quotation_number: "QTN-TEST",
    items: [
      { product_id: null, product_name: "Unknown", description: "48volts", quantity: 1, unit_price: 90000, vat_rate: 0 },
      { product_id: null, product_name: "Unknown", name: "Lithium battery 10kwh", quantity: 1, unit_price: 180000, vat_rate: 0 },
      { product_id: null, product_name: "Custom fabrication", description: "Custom fabrication description", quantity: 2, unit_price: 1000, vat_rate: 16 },
    ],
  },
});

assert.equal(adapted.type, "quotation");
assert.equal(adapted.doc.items[0].description, "48volts");
assert.equal(adapted.doc.items[1].description, "Lithium battery 10kwh");
assert.equal(adapted.doc.items[2].description, "Custom fabrication description");
assert.ok(!adapted.doc.items.some((item) => item.description.toLowerCase() === "unknown"));

console.log("[test-pdf-custom-item-display] Placeholder names are replaced by human-entered item text.");
