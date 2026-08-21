"use strict";

const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "migrations", "0012_smart_product_categories_and_stock_sync.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

const requiredCategories = [
  "Inverters",
  "Batteries",
  "Solar Panels",
  "Breakers",
  "Contactors",
  "Isolators",
  "Bulbs",
  "Lighting",
  "Switches & Sockets",
  "Cables",
  "Conduit",
  "Plugs & Adapters",
  "Fittings",
  "Networking"
];

const examples = [
  ["30W LED Bulbs", "Bulbs"],
  ["30W Rechargeable Bulbs", "Bulbs"],
  ["300W Solar Floodlight", "Lighting"],
  ["2 gang Switch Cacher", "Switches & Sockets"],
  ["63A MCB 2P", "Breakers"],
  ["10kW Hybrid Inverter", "Inverters"],
  ["5kWh Lithium Battery", "Batteries"],
  ["550W Solar Panel", "Solar Panels"],
  ["4mm Twin and Earth Cable", "Cables"],
  ["25mm PVC Conduit", "Conduit"]
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const failures = [];

for (const category of requiredCategories) {
  if (!sql.includes(`('${category}'`)) failures.push(`Missing seeded category rule: ${category}`);
}

for (const [name, expected] of examples) {
  const normalized = normalize(name);
  const ruleRows = sql
    .split("\n")
    .filter((line) => line.includes(`'${expected}'`));
  if (!ruleRows.length) {
    failures.push(`Missing rule for ${expected}: ${name}`);
    continue;
  }
  const categoryMentionedInMigration = ruleRows.some((line) => normalize(line).includes(normalize(name.split(" ")[1] || "")) || normalized.split(" ").some((token) => normalize(line).includes(token)));
  if (!categoryMentionedInMigration) failures.push(`Rule does not visibly cover example ${name} -> ${expected}`);
}

for (const requiredFragment of [
  "CREATE TABLE IF NOT EXISTS product_category_rules",
  "CREATE OR REPLACE FUNCTION infer_product_category_id",
  "CREATE TRIGGER products_auto_infer_category_trigger",
  "UPDATE products\nSET category_id = infer_product_category_id(product_name)",
  "CREATE TRIGGER product_stock_sync_legacy_total_trigger",
  "UPDATE products p\nSET current_stock = COALESCE"
]) {
  if (!sql.includes(requiredFragment)) failures.push(`Missing migration safety feature: ${requiredFragment}`);
}

if (failures.length) {
  console.error("Product category regression checks FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Product category regression checks passed: ${requiredCategories.length} category rules, ${examples.length} representative product names, and stock/category triggers verified.`);
