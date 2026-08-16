'use strict';

const path = require('node:path');

function loadIndex() {
  const filename = path.join(__dirname, '..', '..', 'index.runtime.cjs');
  return require(filename);
}

module.exports = { loadIndex };
