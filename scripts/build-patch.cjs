'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Copy pino/thread-stream worker files to server directory for Railpack packaging
const root = path.resolve(__dirname, '..');
const workerFiles = ['thread-stream-worker.cjs', 'pino-worker.cjs', 'pino-file.cjs', 'pino-pretty.cjs'];

for (const file of workerFiles) {
  const src = path.join(root, file);
  const dst = path.join(root, 'server', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[build] copied ${file} to server/`);
  } else {
    console.warn(`[build] warning: ${file} not found at root`);
  }
}
