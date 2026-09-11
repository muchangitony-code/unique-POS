'use strict';

// PDFKit's built-in Type1 fonts are intentionally used here.
// The previous implementation registered local TTF files through fontkit.
// Production logs showed fontkit failing with `Cannot read properties of undefined
// (reading 'offsets')` while PDFKit measured text. Built-in Helvetica fonts avoid
// fontkit parsing entirely and are stable on Railway/Linux containers.
const FONT_DIR = null;
const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

function assertFonts() {
  return true;
}

function registerFonts(doc) {
  // The authoritative A4 renderer already uses PDFKit's built-in Helvetica
  // fonts and historically invoked this helper before creating its document.
  // Keep that call backward-compatible while still wrapping aliases when a
  // concrete PDFKit document is supplied (as the receipt renderer does).
  if (!doc) return null;
  if (typeof doc.font !== 'function') throw new TypeError('PDF document is required');

  const originalFont = doc.font.bind(doc);
  doc.font = function stableFont(name, size, options) {
    const mapped = name === 'body' ? 'Helvetica' : name === 'bold' ? 'Helvetica-Bold' : name;
    return originalFont(mapped, size, options);
  };

  return doc;
}

module.exports = { FONT_DIR, REGULAR, BOLD, registerFonts, assertFonts };
