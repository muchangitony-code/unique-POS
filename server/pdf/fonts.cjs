'use strict';

const path = require('node:path');
const fs = require('node:fs');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

function assertFonts() {
  for (const file of [REGULAR, BOLD]) {
    if (!fs.existsSync(file)) throw new Error(`Missing PDF font: ${file}`);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid PDF font: ${file}`);
  }
}

// Use PDFKit's built-in standard fonts for the production renderer.
// This deliberately avoids fontkit/TTF parsing in Railway, which was the
// source of the runtime `...reading 'offsets'` failure. The aliases keep the
// renderer API unchanged while eliminating the fragile embedded-font path.
function registerFonts(doc) {
  assertFonts();
  doc.registerFont('body', 'Helvetica');
  doc.registerFont('bold', 'Helvetica-Bold');
  return doc;
}

module.exports = { FONT_DIR, REGULAR, BOLD, registerFonts, assertFonts };
