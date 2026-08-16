# Invoice and quotation PDF root cause and runtime invariant

The original breakage came from resolving a supposed DejaVu TTF through `@fontsource/dejavu-sans/files/latin-400-normal.ttf`. That package/file does not provide the required TTF asset, and runtime resolution through `node_modules` is unsafe for production bundles and pruned installs. When the TTF is unavailable, PDFKit can fall back to built-in fonts with incomplete glyph coverage, producing mangled accents or missing-glyph boxes.

The invariant is now: **PDF text uses only the two committed DejaVu Sans TTF files under `assets/fonts/`.** `server/pdf/fonts.cjs` resolves them from `__dirname`, never from `process.cwd()` or `node_modules`, validates them at startup, and registers the `body` and `bold` font names before PDF text is drawn. The build verifies and stages the same files with the deployment artifact. There is no Fontsource dependency and no built-in-font fallback.

The second stability invariant is: **invoice and quotation PDF generation is server-side only.** The POS no longer loads `html2pdf` or browser-side PDF patch scripts. The application bundle is adapted once during `npm run build` into the generated `index.runtime.cjs`; startup only requires that generated bundle and never rewrites application source in memory. This removes MutationObserver-based PDF/download patches and prevents the browser from selecting a competing PDF implementation.

The health invariant is: `/api/healthz` must return HTTP 200 with `db_ok: true` before the regression suite is allowed to run. The CI startup check validates both conditions.
