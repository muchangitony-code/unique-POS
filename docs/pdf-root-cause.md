# Invoice and quotation PDF font root cause

The original breakage came from resolving a supposed DejaVu TTF through `@fontsource/dejavu-sans/files/latin-400-normal.ttf`. That package/file does not provide the required TTF asset, and runtime resolution through `node_modules` is unsafe for production bundles and pruned installs. When the TTF is unavailable, PDFKit can fall back to built-in fonts with incomplete glyph coverage, producing mangled accents or missing-glyph boxes.

The invariant is now: **PDF text uses only the two committed DejaVu Sans TTF files under `assets/fonts/`.** `server/pdf/fonts.cjs` resolves them from `__dirname`, never from `process.cwd()` or `node_modules`, validates them at startup, and registers the `body` and `bold` font names before PDF text is drawn. The build also verifies and stages the same files with the bundle. There is no Fontsource dependency and no built-in-font fallback.
