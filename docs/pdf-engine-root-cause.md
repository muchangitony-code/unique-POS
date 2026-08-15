# PDF engine rebuild — root cause and QA

## Original root cause

The POS document PDF pipeline was generated with PDFKit directly inside the bundled server. The renderer relied on built-in Helvetica/Helvetica-Bold for dynamic customer/product text and manually positioned table cells while repeatedly allowing PDFKit's mutable `doc.y` cursor to change between columns. The HTML preview and PDF renderer were also separate implementations. This combination explains the reported black/garbled glyphs and the overlapping, stair-stepped, clipped table output.

## Replacement

`server/pdf-engine.cjs` is now the single server-side generator for receipts and A4 invoices, using `pdf-lib` with `@pdf-lib/fontkit` and an embedded DejaVu Sans TTF supplied by Fontsource. `server/pdf-formatters.cjs` owns Unicode sanitisation and fixed two-decimal currency formatting. `server/pdf-fonts.cjs` owns explicit TTF loading and embedding.

The bundled server PDF entrypoint delegates document PDF generation to this module. A Z-report PDF endpoint is also added at `/api/reports/z-report.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD`.

## QA

The repository contains deterministic stress samples with 64 line items, long product descriptions, Unicode customer/company text, a zero-total variant, and large KES amounts. QA renders every PDF page using the exact `pdftoppm -jpeg -r 150` command, extracts text with `pdftotext`, checks that pages are not blank, and rejects suspicious mostly-black raster pages. The generated PDFs and JPEGs are retained as CI artifacts.

The sample generator is independent of live orders so the PDF layer receives already-computed totals and never recalculates tax, discount, or grand total.
