'use strict';

const assert = require('node:assert/strict');
const { parseCsv, detectMapping, normalizeRow, validateRow, buildPreview } = require('../server/bulk-import-v2.cjs');
const {
  AUTHORIZED_IMPORT_ROLES,
  normalizedRole,
  isAuthorizedImportUser,
  authorizeBulkImport,
  registerBulkImportV2Routes
} = require('../server/bulk-import-v2-router.cjs');

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

for (const role of ['administrator', 'ADMINISTRATOR', ' admin ', 'super_admin', 'business_owner', 'branch_manager', 'inventory_manager']) {
  assert.ok(AUTHORIZED_IMPORT_ROLES.has(role.trim().toLowerCase()), `Expected ${role} to be an authorized import role`);
  assert.equal(normalizedRole({ user: { role } }), role.trim().toLowerCase());
  assert.equal(isAuthorizedImportUser({ user: { role } }), true);
}
assert.equal(isAuthorizedImportUser({ user: { role: 'sales_cashier' } }), false);

function responseStub() {
  const out = { statusCode: 200, body: null };
  return {
    out,
    status(code) { out.statusCode = code; return this; },
    json(body) { out.body = body; return this; }
  };
}
let called = 0;
const next = () => { called += 1; };
const adminRes = responseStub();
authorizeBulkImport({ user: { role: 'administrator' } }, adminRes, next);
assert.equal(adminRes.out.statusCode, 200);
assert.equal(called, 1);
const deniedRes = responseStub();
authorizeBulkImport({ user: { role: 'sales_cashier' } }, deniedRes, next);
assert.equal(deniedRes.out.statusCode, 403);
assert.equal(deniedRes.out.body.error, 'Bulk import is restricted to authorized inventory users.');

const registered = [];
const app = {
  post(path, ...handlers) { registered.push({ path, handlers }); },
  __bulkImportV2Mounted: false
};
const requireAuth = (req, res, nextMiddleware) => { req.user = { role: 'administrator', id: 7 }; nextMiddleware(); };
registerBulkImportV2Routes({ app, pool: {}, requireAuth });
registerBulkImportV2Routes({ app, pool: {}, requireAuth });
assert.equal(registered.length, 2, 'Bulk Import V2 routes must only be mounted once');
assert.equal(registered[0].handlers[0], requireAuth);
assert.equal(typeof registered[0].handlers[1], 'function');

console.log('[bulk-import-v2] PASS');
