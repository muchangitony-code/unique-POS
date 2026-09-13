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
  "line.product_name.trim().toLowerCase() !== 'unknown'",
  "line.description?.trim() || 'Non-stock item'",
];

for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(`[verify-quotation-custom-item-ui] Missing marker: ${marker}`);
  }
}

const quotationPage = fs.readFileSync("pages/quotations.tsx", "utf8");
const quotationRequired = [
  "function quotationItemName(it: any)",
  "it?.description",
  "!['unknown', 'undefined', 'null', 'item'].includes(text.toLowerCase())",
  "product_name: quotationItemName(it)",
  "{quotationItemName(it)}",
];

for (const marker of quotationRequired) {
  if (!quotationPage.includes(marker)) {
    throw new Error(`[verify-quotation-custom-item-ui] Missing quotation display marker: ${marker}`);
  }
}

console.log("[verify-quotation-custom-item-ui] Persisted quotation custom-item UI and print/preview description fallback verified.");
