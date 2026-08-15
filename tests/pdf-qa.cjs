'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '..', 'samples');
const renderDir = path.join(out, 'rendered');
fs.rmSync(renderDir, { recursive: true, force: true });
fs.mkdirSync(renderDir, { recursive: true });

for (const file of fs.readdirSync(out).filter((f) => f.endsWith('.pdf')).sort()) {
  const pdf = path.join(out, file);
  const prefix = path.join(renderDir, file.replace(/\.pdf$/i, ''));
  execFileSync('pdfinfo', [pdf], { stdio: 'pipe' });
  execFileSync('pdftotext', [pdf, `${prefix}.txt`]);
  const text = fs.readFileSync(`${prefix}.txt`, 'utf8');
  if (!text.trim()) throw new Error(`${file}: blank/no text extracted`);
  execFileSync('pdftoppm', ['-jpeg', '-r', '150', pdf, prefix], { stdio: 'pipe' });
  const images = fs.readdirSync(renderDir).filter((f) => f.startsWith(path.basename(prefix) + '-') && f.endsWith('.jpg'));
  if (!images.length) throw new Error(`${file}: no rendered pages produced`);
  console.log(`${file}: ${images.length} page image(s), ${text.length} extracted text characters`);
}
