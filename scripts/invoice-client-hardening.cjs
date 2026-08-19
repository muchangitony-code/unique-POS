'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const client = path.join(root, 'public', 'app.js');

let source = fs.readFileSync(client, 'utf8');

const oldFunction = `  async function loadInvoicesData() {
    const invoices = await apiJson("/api/invoices?limit=120").catch(function () { return { data: [] }; });
    state.cache.invoices = { invoices: normalizeList(invoices) };
  }`;

const newFunction = `  async function loadInvoicesData() {
    // Invoice navigation must never block the browser on an unbounded request.
    // The server also caps this endpoint at 50 summary rows and avoids loading items.
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 10000) : null;
    try {
      const invoices = await apiJson("/api/invoices?limit=30", {
        signal: controller ? controller.signal : undefined
      }).catch(function () { return { data: [] }; });
      state.cache.invoices = { invoices: normalizeList(invoices).slice(0, 50) };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }`;

if (source.includes(newFunction)) {
  console.log('[build] Invoice client hardening already applied');
  process.exit(0);
}
if (!source.includes(oldFunction)) {
  throw new Error('Invoice client hardening: loadInvoicesData function not found');
}

source = source.replace(oldFunction, newFunction);
fs.writeFileSync(client, source, 'utf8');
console.log('[build] Invoice client hardened: bounded request, timeout and client-side row cap');
