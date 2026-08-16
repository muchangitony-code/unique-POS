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

function registerFonts(doc) {
  assertFonts();
  doc.registerFont('body', REGULAR);
  doc.registerFont('bold', BOLD);
  return doc;
}

module.exports = { FONT_DIR, REGULAR, BOLD, registerFonts, assertFonts };
