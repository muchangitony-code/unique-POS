'use strict';

let cached;
function getFonts() {
  if (cached) return cached;
  let embedded;
  try { embedded = require('./fonts.generated.cjs'); } catch (err) { throw new Error('PDF font bundle is missing. Run `node scripts/build.cjs` before starting unique-POS. The PDF renderer refuses runtime font-path fallbacks.', { cause: err }); }
  const regular = Buffer.from(embedded.regular, 'base64');
  const bold = Buffer.from(embedded.bold, 'base64');
  if (!regular.length || !bold.length) throw new Error('Embedded DejaVu Sans font buffers are empty');
  cached = { regular, bold };
  return cached;
}
function registerFonts(doc) {
  const fonts = getFonts();
  try {
    doc.registerFont('body', fonts.regular);
    doc.registerFont('bodyBold', fonts.bold);
  } catch (err) {
    throw new Error('Failed to register embedded DejaVu Sans PDF fonts; refusing built-in font fallback.', { cause: err });
  }
  return fonts;
}
module.exports = { getFonts, registerFonts };
