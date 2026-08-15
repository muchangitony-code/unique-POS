'use strict';
const fs = require('node:fs');
const fontkit = require('@pdf-lib/fontkit');

// Fontsource ships the actual DejaVu Sans TTF with the application. We embed the TTF bytes
// into every generated PDF; the PDF never relies on viewer-installed fonts.
const FONT_PATH = require.resolve('@fontsource/dejavu-sans/files/latin-400-normal.ttf');

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const bytes = fs.readFileSync(FONT_PATH);
  const regular = await pdfDoc.embedFont(bytes, { subset: true });
  const bold = regular;
  return { regular, bold };
}

module.exports = { FONT_PATH, loadFonts };
