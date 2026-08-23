'use strict';

const fs = require('node:fs');
const path = require('node:path');

function patchRuntimeBundle() {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'index.runtime.cjs');
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('[inventory-v3] isolated inventory API mounted')) return;

  const listen = source.match(/\b([A-Za-z_$][\w$]*)\.listen\s*\(/);
  if (!listen) throw new Error('Inventory v3 patch: Express listen point not found');
  const appName = listen[1];
  const injection = `\nrequire('./server/inventory-v3.cjs').mountInventoryV3(${appName});\n`;
  source = source.slice(0, listen.index) + injection + source.slice(listen.index);
  fs.writeFileSync(file, source, 'utf8');
  console.log('[inventory-v3-patch] isolated inventory API mounted');
}

module.exports = { patchRuntimeBundle };
