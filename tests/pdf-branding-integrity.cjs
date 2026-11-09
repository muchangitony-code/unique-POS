'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BRAND = require('../server/document-branding.cjs');

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

const html = read('dist/index.html');
assert.doesNotMatch(html, /receipt-logo-fix\.js|receipt-print-payment-fix\.js/);
assert.match(html, /assets\/index-[^\"']+\.js/);

const rendererFacade = read('server/pdf/a4-renderer.cjs');
assert.match(rendererFacade, /professional-a4-renderer\.cjs/);
const renderer = read('server/pdf/professional-a4-renderer.cjs');
assert.match(renderer, /loadLogo\(c\.logoUrl\|\|c\.logo\|\|d\.logoUrl\)/);
assert.match(renderer, /drawLogo\(pdf,logo/);
const adapter = read('server/pdf/document-adapter.cjs');
assert.match(adapter, /logoUrl: first\(company\.logoUrl/);

const receipt = read('server/pdf/receipt.cjs');
assert.match(receipt, /require\('\.\.\/document-branding\.cjs'\)/);
assert.match(receipt, /company\?\.logoUrl/);
assert.match(receipt, /BRAND\.thermalLogo/);
assert.match(receipt, /refusing to generate an unbranded receipt/);

const build = read('scripts/build.cjs');
assert.match(build, /authoritative PDF engine/);
assert.match(build, /prebuilt frontend bundle verified/);
assert.match(build, /stale document workaround still exists/);
assert.doesNotMatch(build, /public\/invoice-workspace\.js/);

console.log('[pdf-branding-integrity] PASS: shared branding, settings-logo propagation, and stale workaround guards are enforced');
