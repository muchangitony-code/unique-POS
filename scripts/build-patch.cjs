'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Staging packaging workaround: Railpack omits arbitrary server-side worker files.
// Redirect bundled Pino/ThreadStream overrides to installed dependency files.
const root = path.resolve(__dirname, '..');
const bundledServer = path.join(root, 'server', 'index.cjs');

if (fs.existsSync(bundledServer)) {
  const original = fs.readFileSync(bundledServer, 'utf8');
  const patched = original
    .replace('"thread-stream-worker": pinoBundlerAbsolutePath("./thread-stream-worker.cjs")', '"thread-stream-worker": require.resolve("thread-stream/lib/worker.js")')
    .replace('"pino-worker": pinoBundlerAbsolutePath("./pino-worker.cjs")', '"pino-worker": require("node:path").join(require("node:path").dirname(require.resolve("pino")), "lib", "worker.js")')
    .replace('"pino/file": pinoBundlerAbsolutePath("./pino-file.cjs")', '"pino/file": require.resolve("pino/file")')
    .replace('"pino-pretty": pinoBundlerAbsolutePath("./pino-pretty.cjs")', '"pino-pretty": require.resolve("pino-pretty")');
  if (patched !== original) {
    fs.writeFileSync(bundledServer, patched, 'utf8');
    console.log('[build] patched bundled pino worker/module paths');
  }
}
