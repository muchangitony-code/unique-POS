'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = path.join(process.cwd(), 'out');
const rendered = path.join(out, 'rendered');
fs.rmSync(rendered, { recursive: true, force: true });
fs.mkdirSync(rendered, { recursive: true });
for (const file of fs.readdirSync(out).filter((name) => name.endsWith('.pdf'))) {
  const stem = path.basename(file, '.pdf');
  const prefix = path.join(rendered, stem + '-page');
  const r = spawnSync('pdftoppm', ['-jpeg', '-r', '150', path.join(out, file), prefix], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
console.log(`[pdf-visual-qa] Rasterized PDFs into ${rendered}`);
