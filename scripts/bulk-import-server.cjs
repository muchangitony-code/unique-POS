'use strict';

// Bulk Import V2 is mounted by the runtime loader after the generated bundle
// has been compiled. Keeping this build hook as a no-op prevents source-string
// injection from corrupting the generated runtime bundle.
function patchBulkImportRoutes(source) {
  return source;
}

module.exports = { patchBulkImportRoutes };
