'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fontDir = path.join(root, 'assets', 'fonts');
const regular = path.join(fontDir, 'DejaVuSans.ttf');
const bold = path.join(fontDir, 'DejaVuSans-Bold.ttf');

for (const file of [regular, bold]) {
  if (!fs.existsSync(file)) throw new Error(`Missing PDF font: ${file}`);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Invalid PDF font: ${file}`);
}

// The runtime resolves fonts from the repository-relative assets/fonts directory.
// Keep the same directory in any assembled bundle output so deployment artifacts
// cannot omit the font files.
const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/styles.css', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/legacy.cjs', 'server/pdf/bundle-loader.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`[build] Vendored PDF fonts verified and copied to ${bundleAssets}`);
