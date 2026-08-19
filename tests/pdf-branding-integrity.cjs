'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BRAND = require('../document-branding.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

assert.equal(BRAND.logo, '/assets/branding/logo.svg');
assert.equal(BRAND.thermalLogo, '/assets/branding/logo-monochrome.svg');
for (const asset of ['public/assets/branding/logo.svg', 'public/assets/branding/logo-monochrome.svg']) {
  const source = read(asset);
  assert.match(source, /^\s*<svg[\s>]/i, `${asset} is not a valid SVG logo`);
}

for (const stale of [
  'scripts/build-safe.cjs',
  'scripts/build-guard.cjs',
  'server/branding.config.cjs',
  'scripts/README-invoice-fix.txt',
  'public/invoice-workspace.js',
  'public/receipt-logo-fix.js',
  'public/receipt-print-payment-fix.js'
]) assert.equal(exists(stale), false, `stale document workaround still exists: ${stale}`);

const html = read('public/index.html');
assert.doesNotMatch(html, /receipt-logo-fix\.js|receipt-print-payment-fix\.js/);
assert.match(html, /invoices\.js/);

const renderer = read('server/pdf/a4-renderer.cjs');
assert.match(renderer, /require\('\.\.\/document-branding\.cjs'\)/);
assert.match(renderer, /const C = BRAND\.colors/);
assert.match(renderer, /loadLogo\(BRAND\.logo\)/);
assert.match(renderer, /refusing to generate an unbranded customer document/);

const receipt = read('server/pdf/receipt.cjs');
assert.match(receipt, /require\('\.\.\/document-branding\.cjs'\)/);
assert.match(receipt, /company\?\.logoUrl/);
assert.match(receipt, /BRAND\.thermalLogo/);
assert.match(receipt, /refusing to generate an unbranded receipt/);

const build = read('scripts/build.cjs');
assert.match(build, /authoritative PDF engine/);
assert.match(build, /public\/invoices\.js/);
assert.match(build, /stale document workaround still exists/);
assert.doesNotMatch(build, /public\/invoice-workspace\.js/);

console.log('[pdf-branding-integrity] PASS: shared branding, settings-logo propagation, and stale workaround guards are enforced');
