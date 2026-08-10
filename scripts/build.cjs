"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const requiredFiles = [
  "app.js",
  "index.cjs",
  "product-bulk.cjs",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/assets/unique-solar-kenya-logo.svg",
  "scripts/bootstrap-db.cjs",
  "scripts/database-url.cjs",
  "scripts/run-migrations.cjs",
  "scripts/schema-config.cjs",
  "scripts/sql-utils.cjs",
  "scripts/validate-startup-env.cjs"
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required runtime file: ${relativePath}`);
  }
}

const syntaxCheckedFiles = requiredFiles.filter((relativePath) =>
  relativePath.endsWith(".js") || relativePath.endsWith(".cjs")
);

for (const relativePath of syntaxCheckedFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const result = spawnSync(process.execPath, ["--check", absolutePath], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("[build] Runtime bundle and startup scripts validated.");
