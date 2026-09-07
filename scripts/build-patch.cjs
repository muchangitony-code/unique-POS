'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Staging packaging workaround: Railpack omits arbitrary server-side worker files
// from the runtime layer. Copy them for completeness, and patch the bundled
// pino override to use the installed thread-stream worker dependency directly.
const root = path.resolve(__dirname, '..');
const workerFiles = ['thread-stream-worker.cjs', 'pino-worker.cjs', 'pino-file.cjs', 'pino-pretty.cjs'];

for (const file of workerFiles) {
  const src = path.join(root, file);
  const dst = path.join(root, 'server', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[build] copied ${file} to server/`);
  }
}

const bundledServer = path.join(root, 'server', 'index.cjs');
if (fs.existsSync(bundledServer)) {
  const original = fs.readFileSync(bundledServer, 'utf8');
  const patched = original.replace(
    '"thread-stream-worker": pinoBundlerAbsolutePath("./thread-stream-worker.cjs")',
    '"thread-stream-worker": require.resolve("thread-stream/lib/worker.js")'
  );
  if (patched !== original) {
    fs.writeFileSync(bundledServer, patched, 'utf8');
    console.log('[build] patched bundled thread-stream worker path');
  }
}
