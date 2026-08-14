const fs = require('node:fs');

const file = 'index.cjs';
let source = fs.readFileSync(file, 'utf8');

const oldDefaults = `const termsText = settings.invoicePaymentTerms || "";
  const termsLines = termsText
    ? termsText.split(/\\n/).filter((l) => l.trim())
    : [
        \`Quotation valid for \${settings.quotationValidityDays || 30} days.\`,
        "Goods remain the property of the seller until paid in full.",
        "Warranty applies where specified.",
        "Returns are subject to our return policy.",
        "Errors and Omissions Excepted (E&OE)."
      ];`;

const newDefaults = `const termsText = settings.invoicePaymentTerms || "";
  const requestedDocumentType = String(opts.requestedType || opts.documentType || "").toLowerCase();
  const isInvoiceDocument = requestedDocumentType.includes("invoice");
  const defaultTerms = isInvoiceDocument
    ? [
        "Payment is due according to the payment terms stated on this invoice.",
        "Goods remain the property of the seller until payment is received in full.",
        "Warranty is provided in accordance with the manufacturer's warranty terms, where applicable.",
        "Returns or exchanges are subject to the company's return policy and proof of purchase.",
        "Any invoice discrepancy should be reported within 48 hours of receipt.",
        "Errors and Omissions Excepted (E.&O.E.)."
      ]
    : [
        \`This quotation is valid for \${settings.quotationValidityDays || 30} days from the date of issue unless otherwise stated.\`,
        "Prices are subject to product availability and may change after the validity period.",
        "Delivery timelines are subject to stock availability and confirmed order requirements.",
        "Warranty is provided in accordance with the manufacturer's warranty terms, where applicable.",
        "Goods remain the property of the seller until payment is received in full.",
        "Returns are subject to the company's return policy and proof of purchase.",
        "Errors and Omissions Excepted (E.&O.E.)."
      ];
  const termsLines = termsText
    ? termsText.split(/\\n/).map((l) => l.trim()).filter(Boolean)
    : defaultTerms;`;

if (!source.includes(oldDefaults)) throw new Error('Default terms block not found');
source = source.replace(oldDefaults, newDefaults);

const oldTermsMarkup = `const termsSection = !data.isReceipt && data.termsLines.length
    ? \`<div class="tsec"><h3 class="slabel">Terms &amp; Conditions</h3><ol class="tlist">\` +
      data.termsLines.map((l) => \`<li>\${htmlEscape2(l)}</li>\`).join("") +
      \`</ol></div>\`
    : "";`;
const newTermsMarkup = `const termsSection = !data.isReceipt && data.termsLines.length
    ? \`<div class="tsec"><h3 class="slabel">Commercial Terms &amp; Conditions</h3><ol class="tlist">\` +
      data.termsLines.map((l, idx) => \`<li><span class="term-num">\${String(idx + 1).padStart(2, "0")}</span><span class="term-text">\${htmlEscape2(l)}</span></li>\`).join("") +
      \`</ol></div>\`
    : "";`;
if (!source.includes(oldTermsMarkup)) throw new Error('HTML terms markup not found');
source = source.replace(oldTermsMarkup, newTermsMarkup);

const oldCss = `  .tsec { margin-bottom: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; }\n  .tlist { padding-left: 16px; color: #475569; }\n  .tlist li { font-size: 11px; line-height: 1.6; padding: 2px 0; }`;
const newCss = `  .tsec { margin: 14px 0 16px; padding: 13px 15px; border: 1px solid #dfe7ef; border-left: 3px solid ${'${data.secondary}'}; border-radius: 8px; background: #fbfcfe; page-break-inside: avoid; }\n  .tsec .slabel { margin-bottom: 9px; color: ${'${data.primary}'}; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }\n  .tlist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; row-gap: 5px; }\n  .tlist li { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 7px; align-items: start; margin: 0; padding: 3px 0; color: #475569; font-size: 10.5px; line-height: 1.45; }\n  .term-num { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; background: #eef4f9; color: ${'${data.primary}'}; font-size: 8.5px; font-weight: 800; }\n  .term-text { display: block; }`;
if (!source.includes(oldCss)) throw new Error('HTML terms CSS not found');
source = source.replace(oldCss, newCss);

const oldPdf = `doc.fillColor(data.primary).font("Helvetica-Bold").fontSize(9).text("TERMS & CONDITIONS", left, doc.y);\n        doc.moveDown(0.3);\n        const termsStartY = doc.y;\n        const termsCapped = Math.min(data.termsLines.length, 8);\n        const termsBoxH = termsCapped * 14 + 20;\n        doc.roundedRect(left, termsStartY, width, termsBoxH, 10).fillAndStroke("#F8FAFF", "#E2E8F0");\n        doc.y = termsStartY + 10;\n        data.termsLines.slice(0, termsCapped).forEach((line, idx) => {\n          doc.fillColor("#475569").font("Helvetica").fontSize(8.5).text(\`\${idx + 1}. \${line}\`, left + 12, doc.y, { width: width - 24 });\n          doc.moveDown(0.15);\n        });\n        doc.y = termsStartY + termsBoxH + 12;`;
const newPdf = `doc.fillColor(data.primary).font("Helvetica-Bold").fontSize(9).text("COMMERCIAL TERMS & CONDITIONS", left, doc.y);\n        doc.moveDown(0.3);\n        const termsStartY = doc.y;\n        const termsCapped = Math.min(data.termsLines.length, 8);\n        const termsRows = Math.ceil(termsCapped / 2);\n        const termsRowH = 18;\n        const termsBoxH = termsRows * termsRowH + 20;\n        doc.roundedRect(left, termsStartY, width, termsBoxH, 8).fillAndStroke("#FBFCFE", "#DFE7EF");\n        for (let idx = 0; idx < termsCapped; idx += 1) {\n          const column = idx < termsRows ? 0 : 1;\n          const row = idx % termsRows;\n          const colX = left + 12 + column * (width / 2);\n          const colW = width / 2 - 22;\n          const y = termsStartY + 10 + row * termsRowH;\n          doc.fillColor("#EEF4F9").roundedRect(colX, y - 1, 18, 16, 3).fill();\n          doc.fillColor(data.primary).font("Helvetica-Bold").fontSize(6.5).text(String(idx + 1).padStart(2, "0"), colX + 2, y + 4, { width: 14, align: "center" });\n          doc.fillColor("#475569").font("Helvetica").fontSize(7.5).text(data.termsLines[idx], colX + 23, y, { width: colW - 23, height: termsRowH - 2, ellipsis: false });\n        }\n        doc.y = termsStartY + termsBoxH + 12;`;
if (!source.includes(oldPdf)) throw new Error('PDF terms renderer block not found');
source = source.replace(oldPdf, newPdf);

fs.writeFileSync(file, source);
console.log('Modern A4 document terms applied successfully.');
