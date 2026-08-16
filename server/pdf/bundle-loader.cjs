'use strict';
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { renderLegacyPdf } = require('./legacy.cjs');

function loadIndex() {
  const filename = path.join(__dirname, '..', '..', 'index.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const startMarker = 'async function renderPdfBuffer(payload, paper) {';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Bundled index.cjs does not expose the legacy PDF renderer marker');
  const markers = ['router17.get(\\"/documents/:type/:id/preview\\"', 'router17.get("/documents/:type/:id/preview"'];
  const end = markers.map((m) => source.indexOf(m, start)).find((n) => n >= 0);
  if (end == null) throw new Error('Bundled index.cjs does not expose the document preview route marker');
  let transformed = source.slice(0, start) + 'async function renderPdfBuffer(payload, paper) {\n  return await renderLegacyPdf(payload, paper);\n}\n' + source.slice(end);
  transformed = transformed.replace('const fileBase = `${type}-${payload.documentNumber || id}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");\n    const disposition = String(req.query.disposition || "").toLowerCase() === "attachment" || String(req.query.download || "") === "1" ? "attachment" : "inline";\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `${disposition}; filename="${fileBase}.pdf"`);', 'const fileBase = String(payload.documentNumber || id).replace(/[^a-zA-Z0-9._-]+/g, "-");\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `inline; filename="${fileBase}.pdf"`);');
  transformed = transformed.replace('console.error("[documents.pdf] Failed to generate PDF", error40);\n    res.status(500).json({ error: "Unable to generate document PDF." });', 'logger.error({ err: error40 }, "[documents.pdf] Failed to generate PDF");\n    if (error40?.statusCode === 400 || error40?.status === 400) res.status(400).json({ error: error40.message });\n    else res.status(500).json({ error: "Unable to generate document PDF." });');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transformed, filename);
  return mod.exports;
}
module.exports = { loadIndex };
