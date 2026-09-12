"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "server/pdf/document-adapter.cjs");
let source = fs.readFileSync(file, "utf8");

const old = "  const items = itemList.map((item) => ({ description: first(item.description, item.product_name, item.productName, item.itemName, item.name, item.title, 'Item'), sub: first(item.sub, item.sku, item.product_code, item.productCode, item.code, item.unit, item.category), qty: number(first(item.qty, item.quantity, item.count, item.units), 0), unitPrice: money(first(item.unitPrice, item.unit_price, item.selling_price, item.sellingPrice, item.price, item.rate, 0)), taxRate: number(first(item.taxRate, item.vatRate, item.vat_rate, item.tax_rate, item.taxPercent, 0), 0), discount: money(first(item.discount, item.discount_amount, item.discountAmount, 0)) }));";
const next = "  const humanText = (...values) => { for (const value of values) { const text = String(value ?? '').trim(); if (text && !['unknown', 'undefined', 'null', 'item'].includes(text.toLowerCase())) return text; } return ''; };\n  const items = itemList.map((item) => ({ description: humanText(item.description, item.product_name, item.productName, item.itemName, item.name, item.title, item.sub, item.category) || 'Non-stock item', sub: first(item.sub, item.sku, item.product_code, item.productCode, item.code, item.unit, item.category), qty: number(first(item.qty, item.quantity, item.count, item.units), 0), unitPrice: money(first(item.unitPrice, item.unit_price, item.selling_price, item.sellingPrice, item.price, item.rate, 0)), taxRate: number(first(item.taxRate, item.vatRate, item.vat_rate, item.tax_rate, item.taxPercent, 0), 0), discount: money(first(item.discount, item.discount_amount, item.discountAmount, 0)) }));";

if (source.includes(next)) {
  console.log("[pdf-custom-item-display] PDF adapter already hardened.");
  process.exit(0);
}
if (!source.includes(old)) {
  throw new Error("[pdf-custom-item-display] Expected quotation item adapter mapping not found");
}
source = source.replace(old, next);
fs.writeFileSync(file, source, "utf8");
console.log("[pdf-custom-item-display] PDF adapter now ignores placeholder names and preserves human-entered item text.");
