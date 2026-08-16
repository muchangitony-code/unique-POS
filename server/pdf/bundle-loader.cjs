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
  const replacement = 'async function renderPdfBuffer(payload, paper) {\n  return await renderLegacyPdf(payload, paper);\n}\n';
  const transformed = source.slice(0, start) + replacement + source.slice(end);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transformed, filename);
  return mod.exports;
}
module.exports = { loadIndex };
