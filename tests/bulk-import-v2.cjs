'use strict';

const assert = require('node:assert/strict');
const { parseCsv, detectMapping, normalizeRow, validateRow, buildPreview } = require('../server/bulk-import-v2.cjs');

const matrix = parseCsv('SKU,Product Name,Cost Price,Selling Price,VAT,Opening Stock\nEL-001,LED Bulb,50,80,16,12\nEL-002,Socket,100,150,16,4');
assert.equal(matrix.length, 3);
const preview = buildPreview(matrix);
assert.equal(preview.total, 2);
assert.equal(preview.valid, 2);
assert.equal(preview.invalid, 0);
assert.equal(preview.mapping.product_code, 'SKU');
assert.equal(preview.mapping.product_name, 'Product Name');
const normalized = normalizeRow(preview.rows[0].raw, preview.mapping);
assert.equal(normalized.product_code, 'EL-001');
assert.equal(normalized.selling_price, 80);
assert.equal(normalized.opening_stock, 12);
assert.deepEqual(validateRow(normalized, 2), []);
const bad = normalizeRow({ SKU: '', 'Product Name': '', 'Selling Price': 'abc' }, detectMapping(['SKU','Product Name','Selling Price']));
assert.ok(validateRow(bad, 2).length >= 2);
console.log('[bulk-import-v2] PASS');
