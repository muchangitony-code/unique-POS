# PDF engine rebuild — root cause and QA

## Original root cause

The POS document PDF pipeline was generated with PDFKit directly inside the bundled server. The renderer relied on built-in Helvetica/Helvetica-Bold for dynamic customer/product text and manually positioned table cells while repeatedly allowing PDFKit's mutable `doc.y` cursor to change between columns. The HTML preview and PDF renderer were also separate implementations. This combination explains the reported black/garbled glyphs and the overlapping, stair-stepped, clipped table output.

## Replacement

`server/pdf-engine.cjs` is the single server-side generator for receipts and A4 invoices, using `pdf-lib` with `fontkit` and an embedded DejaVu Sans TTF supplied by Fontsource. `server/pdf-formatters.cjs` owns Unicode sanitisation and fixed two-decimal currency formatting. `server/pdf-fonts.cjs` owns explicit TTF loading and embedding.

The normal `app.js` startup now loads the existing POS bundle through `scripts/load-patched-index.cjs`, which replaces only the legacy document-PDF function in memory with the new engine. The original PDFKit table-cursor patch is no longer loaded. The new engine also exports `renderZReportPdf()` for daily/Z-report generation.

## QA

The repository contains deterministic stress samples with 64 line items, long product descriptions, Unicode customer/company text, a zero-total variant, and large KES amounts. `tests/pdf-qa.cjs` renders every PDF page using the exact `pdftoppm -jpeg -r 150` command and extracts text with `pdftotext`; it also rejects blank/no-text PDFs and reports every rendered page. The sample generator is independent of live orders so the PDF layer receives already-computed totals and never recalculates tax, discount, or grand total.

CI execution is intentionally not part of the deployment path. The current GitHub Actions environment is failing all new runs before any job step starts, so no CI result is represented as PDF QA evidence. The PDF samples and raster QA scripts remain available for execution in the repository's Node 22 environment.
