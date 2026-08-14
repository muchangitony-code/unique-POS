"use strict";

// Targeted runtime compatibility fix for the bundled PDFKit renderer.
// The A4 renderer writes table cells with explicit x/y coordinates while PDFKit
// also advances doc.y. Preserve the cursor only during the item-table sequence.
const PDFDocument = require("pdfkit");
const proto = PDFDocument.prototype;

if (!proto.__uniquePosA4TableFixApplied) {
  const originalText = proto.text;
  proto.text = function patchedPdfKitText(text, x, y, options) {
    const value = String(text ?? "").trim();

    // In the document-information panel, a full ownership/warranty clause is
    // not a payment term and wraps into the Currency row. Keep the display
    // value concise; the full clause remains in Commercial Terms & Conditions.
    let displayText = text;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      x > 250 &&
      y > 150 &&
      y < 285 &&
      value.toLowerCase().startsWith("goods remain the property of the seller")
    ) {
      displayText = "As agreed";
    }

    if (value === "Item Code") this.__uniquePosA4TableMode = true;

    const tableMode = this.__uniquePosA4TableMode === true;
    const explicitPosition = typeof x === "number" && typeof y === "number";
    const preserveY = tableMode && explicitPosition;
    const previousY = this.y;

    const result = originalText.call(this, displayText, x, y, options);

    if (preserveY) this.y = previousY;
    if (value === "NOTES") this.__uniquePosA4TableMode = false;
    return result;
  };

  proto.__uniquePosA4TableFixApplied = true;
}
