"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const requiredFiles = [
  "app.js",
  "index.cjs",
  "public/index.html",
  "public/app.js",
  "scripts/bootstrap-db.cjs",
  "scripts/run-migrations.cjs"
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required runtime file: ${relativePath}`);
  }
}

for (const relativePath of ["app.js", "index.cjs", "scripts/bootstrap-db.cjs", "scripts/run-migrations.cjs"]) {
  const absolutePath = path.join(repoRoot, relativePath);
  const result = spawnSync(process.execPath, ["--check", absolutePath], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("[build] Runtime bundle and startup scripts validated.");
