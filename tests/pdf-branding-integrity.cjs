'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BRAND = require('../document-branding.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(BRAND.legalName, 'Uniques Solar & General Supplies Limited');
assert.equal(BRAND.tagline, 'Solar Energy & General Supplies');
assert.equal(BRAND.website, 'https://uniquesolarltd.co.ke');
assert.equal(BRAND.address, 'Kamakis Corner Square, Ruiru, Kenya');
assert.equal(BRAND.phone, '0733 573 089');
assert.equal(BRAND.logo, '/assets/branding/logo.svg');
assert.equal(BRAND.thermalLogo, '/assets/branding/logo-monochrome.svg');

for (const asset of ['public/assets/branding/logo.svg', 'public/assets/branding/logo-monochrome.svg']) {
  const source = read(asset);
  assert.match(source, /^\s*<svg[\s>]/i, `${asset} is not a valid SVG logo`);
}

for (const stale of [
  'scripts/build-safe.cjs',
  'scripts/build-guard.cjs',
  'server/branding.config.cjs'
]) {
  assert.equal(fs.existsSync(path.join(root, stale)), false, `stale build/branding file still exists: ${stale}`);
}

const renderer = read('server/pdf/a4-renderer.cjs');
assert.match(renderer, /require\('\.\.\/document-branding\.cjs'\)/);
assert.match(renderer, /const C = BRAND\.colors/);
assert.match(renderer, /loadLogo\(BRAND\.logo\)/);
assert.match(renderer, /refusing to generate an unbranded customer document/);

const receipt = read('server/pdf/receipt.cjs');
assert.match(receipt, /require\('\.\.\/document-branding\.cjs'\)/);
assert.match(receipt, /BRAND\.thermalLogo/);
assert.match(receipt, /Thermal branding logo could not be loaded/);

const build = read('scripts/build.cjs');
assert.match(build, /server\/pdf\/index\.cjs/);
assert.match(build, /server\/pdf\/a4-renderer\.cjs/);
assert.match(build, /server\/document-branding\.cjs/);
assert.match(build, /build-safe\.cjs/);
assert.match(build, /renderLegacyDocumentPdf/);

console.log('[pdf-branding-integrity] PASS: one canonical branding source, canonical logos, and stale PDF builders are blocked');
