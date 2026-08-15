'use strict';
const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('@pdf-lib/fontkit');

const FONT_DIR = path.join(__dirname, '..', 'fonts');
const FONT_PATH = path.join(FONT_DIR, 'DejaVuSans.ttf');

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const bytes = fs.readFileSync(FONT_PATH);
  const regular = await pdfDoc.embedFont(bytes, { subset: true });
  const bold = regular;
  return { regular, bold };
}

module.exports = { FONT_PATH, loadFonts };
