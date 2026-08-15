'use strict';
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

function patchIndexSource(source) {
  const startMarker = 'async function renderPdfBuffer(payload, paper) {';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Legacy PDF renderer not found in index.cjs');
  const endMarker = 'router17.get("/documents/:type/:id/preview"';
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('Legacy PDF renderer end marker not found in index.cjs');
  const replacement = 'async function renderPdfBuffer(payload, paper) {\n  return await require("./server/pdf-engine.cjs").renderPdfBuffer(payload, paper);\n}\n';
  return source.slice(0, start) + replacement + source.slice(end);
}

function loadPatchedIndex() {
  const filename = path.join(__dirname, '..', 'index.cjs');
  const source = patchIndexSource(fs.readFileSync(filename, 'utf8'));
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(source, filename);
  return mod.exports;
}

module.exports = { patchIndexSource, loadPatchedIndex };
