# Stable POS document audit

## Findings

The production PDF shown during the audit was being produced by the legacy bundled document renderer. It had two visible layout defects: company identity text could collide with the contact block when the business name wrapped, and the item table header could be left at the bottom of one page while the rows continued on the next page.

The browser also contained an unnecessary PDF generation dependency. Document downloads already have a server endpoint, so generating a second PDF in the browser created two competing document paths.

## Remediation

- Invoice and quotation PDF requests are routed by the build step to `server/pdf/stable.cjs`.
- Receipt PDF requests are routed to `server/pdf/receipt.cjs`.
- The old bundled renderer remains as an unreachable fallback for unknown document types only; normal invoice, quotation, receipt and sale requests do not use it.
- Legacy payloads are normalized in `server/pdf/legacy-adapter.cjs` before schema validation.
- PDF fonts remain vendored and registered before drawing.
- Amounts are calculated with integer cents through `server/pdf/format.js`.
- A4 rows have fixed widths and measured heights; descriptions wrap and rows are not intentionally split.
- Table headers are drawn on every generated page.
- Totals are moved to a fresh page when the remaining space is insufficient.
- Thermal receipts use a dedicated 58mm/80mm renderer.
- Browser-side `html2pdf` is no longer loaded by the POS entry page.

## Invariants

1. The active invoice/quotation/receipt PDF path is server-side only.
2. No PDF renderer may use a runtime font path from `node_modules`.
3. No document amount is summed with floating-point arithmetic.
4. A successful PDF response must contain a non-empty PDF body.
5. PDF generation must not be coupled to payment completion validation.
6. CI fixture generation must import the same stable renderer used by production.
