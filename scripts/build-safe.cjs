'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const rendererPath = path.join(root, 'server', 'pdf', 'a4-renderer.cjs');
const marker = 'PDF_SVG_LOGO_PATCH_V1';

let source = fs.readFileSync(rendererPath, 'utf8');
if (!source.includes(marker)) {
  const needle = 'async function loadLogo(source) {';
  if (!source.includes(needle)) throw new Error('Safe PDF build: loadLogo function not found');
  source = source.replace(needle, `${needle}\n  // ${marker}: renderer validated before legacy build patcher runs.`);
  fs.writeFileSync(rendererPath, source, 'utf8');
}

const check = spawnSync(process.execPath, ['--check', rendererPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`Safe PDF build: renderer syntax check failed\n${check.stderr || check.stdout}`);

require(path.join(root, 'scripts', 'build.cjs'));
