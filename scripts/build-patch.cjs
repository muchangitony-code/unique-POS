'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Staging packaging workaround: Railpack omits arbitrary server-side worker files
// from the runtime layer. Redirect the bundled pino/thread-stream overrides to
// modules that are guaranteed to be present in node_modules at runtime.
const root = path.resolve(__dirname, '..');
const bundledServer = path.join(root, 'server', 'index.cjs');

if (fs.existsSync(bundledServer)) {
  const original = fs.readFileSync(bundledServer, 'utf8');
  const patched = original
    .replace('"thread-stream-worker": pinoBundlerAbsolutePath("./thread-stream-worker.cjs")', '"thread-stream-worker": require.resolve("thread-stream/lib/worker.js")')
    .replace('"pino-worker": pinoBundlerAbsolutePath("./pino-worker.cjs")', '"pino-worker": require.resolve("pino/lib/worker.js")')
    .replace('"pino/file": pinoBundlerAbsolutePath("./pino-file.cjs")', '"pino/file": require.resolve("pino/file")')
    .replace('"pino-pretty": pinoBundlerAbsolutePath("./pino-pretty.cjs")', '"pino-pretty": require.resolve("pino-pretty")');
  if (patched !== original) {
    fs.writeFileSync(bundledServer, patched, 'utf8');
    console.log('[build] patched bundled pino worker/module paths');
  }
}
