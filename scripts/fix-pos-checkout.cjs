"use strict";

// Retained for diagnostics/manual use only. Production checkout logic is
// deployed directly in public/app.js. Railway must not rewrite application
// source during build or startup because legacy function names can differ
// between application versions.
console.log("[checkout-fix] No source rewrite required; using deployed public/app.js.");
