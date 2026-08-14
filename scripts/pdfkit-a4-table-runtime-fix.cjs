"use strict";

// The A4 renderer in index.cjs writes table cells with explicit x/y coordinates.
// PDFKit advances doc.y after each text() call, so using doc.y again for the next
// cell causes the cells to staircase vertically. Lock the cursor only while the
// A4 item table is being drawn; all other document layout remains untouched.
const PDFDocument = require("pdfkit");
const proto = PDFDocument.prototype;
if (proto.__uniquePosA4TableFixApplied) return;

const originalText = proto.text;
proto.text = function patchedPdfKitText(text, x, y, options) {
  const value = String(text ?? "").trim();
  if (value === "Item Code") this.__uniquePosA4TableMode = true;

  const tableMode = this.__uniquePosA4TableMode === true;
  const explicitPosition = typeof x === "number" && typeof y === "number";
  const preserveY = tableMode && explicitPosition;
  const previousY = this.y;

  const result = originalText.call(this, text, x, y, options);

  if (preserveY) this.y = previousY;
  if (value === "NOTES") this.__uniquePosA4TableMode = false;
  return result;
};

proto.__uniquePosA4TableFixApplied = true;
