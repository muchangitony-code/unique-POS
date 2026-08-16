'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fontDir = path.join(root, 'assets', 'fonts');
const regular = path.join(fontDir, 'DejaVuSans.ttf');
const bold = path.join(fontDir, 'DejaVuSans-Bold.ttf');
const sourceBundle = path.join(root, 'index.cjs');
const runtimeBundle = path.join(root, 'index.runtime.cjs');

for (const file of [regular, bold]) {
  if (!fs.existsSync(file)) throw new Error(`Missing PDF font: ${file}`);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Invalid PDF font: ${file}`);
}

if (!fs.existsSync(sourceBundle)) throw new Error(`Missing application bundle: ${sourceBundle}`);

const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));

function buildRuntimeBundle() {
  const source = fs.readFileSync(sourceBundle, 'utf8');
  const startMarker = 'async function renderPdfBuffer(payload, paper) {';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Bundled index.cjs does not expose the PDF renderer marker');

  const endMarkers = [
    'router17.get(\\"/documents/:type/:id/preview\\"',
    'router17.get("/documents/:type/:id/preview"'
  ];
  const end = endMarkers.map((marker) => source.indexOf(marker, start)).find((index) => index >= 0);
  if (end == null) throw new Error('Bundled index.cjs does not expose the document preview route marker');

  let transformed = source.slice(0, start) +
    'async function renderPdfBuffer(payload, paper) {\n' +
    '  return await require("./server/pdf/index.cjs").renderPdfBuffer(payload, paper);\n' +
    '}\n' +
    source.slice(end);

  const oldHeaders = 'const fileBase = `${type}-${payload.documentNumber || id}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");\n    const disposition = String(req.query.disposition || "").toLowerCase() === "attachment" || String(req.query.download || "") === "1" ? "attachment" : "inline";\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `${disposition}; filename="${fileBase}.pdf"`);';
  const newHeaders = 'const fileBase = String(payload.documentNumber || id).replace(/[^a-zA-Z0-9._-]+/g, "-");\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `inline; filename="${fileBase}.pdf"`);';
  transformed = transformed.replace(oldHeaders, newHeaders);

  const oldError = 'console.error("[documents.pdf] Failed to generate PDF", error40);\n    res.status(500).json({ error: "Unable to generate document PDF." });';
  const newError = 'logger.error({ err: error40 }, "[documents.pdf] Failed to generate PDF");\n    if (error40?.statusCode === 400 || error40?.status === 400) res.status(400).json({ error: error40.message });\n    else res.status(500).json({ error: "Unable to generate document PDF." });';
  transformed = transformed.replace(oldError, newError);

  fs.writeFileSync(runtimeBundle, transformed, 'utf8');
}

buildRuntimeBundle();

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/styles.css', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/bundle-loader.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt', 'index.runtime.cjs'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`[build] PDF fonts verified; deterministic runtime bundle generated at ${runtimeBundle}`);
