"use strict";

const fs = require("node:fs");

const file = "components/documents/DocumentWizard.tsx";
const source = fs.readFileSync(file, "utf8");

const required = [
  "allowNonStock={isQuote}",
  "Non-stock / Custom Item",
  "product_id: null",
  "NON-STOCK",
  "Add to Quotation",
];

for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(`[verify-quotation-custom-item-ui] Missing marker: ${marker}`);
  }
}

console.log("[verify-quotation-custom-item-ui] Persisted quotation custom-item UI verified.");
