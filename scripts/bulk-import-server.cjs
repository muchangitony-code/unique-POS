'use strict';

// Bulk Import V2 is mounted by server/pdf/bundle-loader.cjs after the generated
// runtime has been syntax-checked. Do not inject JavaScript into the generated
// bundle here: source-string insertion was the cause of the runtime truncation.
function patchBulkImportRoutes(source) {
  if (source.includes('BULK_IMPORT_V2_PATCH')) return source;
  return `${source}\n// BULK_IMPORT_V2_PATCH: mounted by runtime loader; /api/healthz is registered there.\n`;
}

module.exports = { patchBulkImportRoutes };
