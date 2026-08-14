const fs = require('node:fs');

const file = 'index.cjs';
let source = fs.readFileSync(file, 'utf8');

const oldPanel = `      doc.roundedRect(left, panelY, panelW, 126, 18).fillAndStroke("#FFFFFF", "#D7E4F1");
      doc.roundedRect(left + panelW + 18, panelY, panelW, 126, 18).fillAndStroke("#FFFFFF", "#D7E4F1");`;
const newPanel = `      // The document-information panel contains four label/value rows. Keep enough vertical space for wrapped payment terms.
      const infoPanelH = 150;
      doc.roundedRect(left, panelY, panelW, infoPanelH, 18).fillAndStroke("#FFFFFF", "#D7E4F1");
      doc.roundedRect(left + panelW + 18, panelY, panelW, infoPanelH, 18).fillAndStroke("#FFFFFF", "#D7E4F1");`;
if (!source.includes(oldPanel)) throw new Error('A4 information panel block not found');
source = source.replace(oldPanel, newPanel);

const oldCols = `      const colWidths = [64, 176, 34, 42, 68, 54, 38, 66];`;
const newCols = `      // Exact A4 content width: 539pt with the current 28pt page margins. Do not let columns overflow the table.
      const colWidths = [90, 158, 34, 40, 68, 48, 38, 63];`;
if (!source.includes(oldCols)) throw new Error('A4 column-width block not found');
source = source.replace(oldCols, newCols);

const oldTableY = `      const tableY = panelY + 146;`;
const newTableY = `      const tableY = panelY + infoPanelH + 20;`;
if (!source.includes(oldTableY)) throw new Error('A4 table Y block not found');
source = source.replace(oldTableY, newTableY);

const oldHeader = `      function drawTableHeader() {
        let x = tableX;
        const headers = ["Item Code", "Description", "Qty", "Unit", "Unit Price", "Discount", "VAT", "Total"];
        doc.fillColor(data.primary).rect(tableX, doc.y, width, 24).fill();
        headers.forEach((label, index) => {
          doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(label, x + 4, doc.y + 7, { width: colWidths[index] - 8, align: index < 2 ? "left" : "right" });
          x += colWidths[index];
        });
        doc.y += 24;
      }`;
const newHeader = `      function drawTableHeader() {
        let x = tableX;
        const headerY = doc.y;
        const headers = ["Item Code", "Description", "Qty", "Unit", "Unit Price", "Discount", "VAT", "Total"];
        doc.fillColor(data.primary).rect(tableX, headerY, width, 24).fill();
        headers.forEach((label, index) => {
          doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(label, x + 4, headerY + 7, { width: colWidths[index] - 8, align: index < 2 ? "left" : "right" });
          x += colWidths[index];
        });
        // PDFKit can update doc.y after text() even when x/y are explicitly supplied. Keep the row cursor independent.
        doc.y = headerY + 24;
      }`;
if (!source.includes(oldHeader)) throw new Error('A4 table-header block not found');
source = source.replace(oldHeader, newHeader);

const oldRows = `      data.rows.forEach((row, index) => {
        const descHeight = doc.heightOfString(row.description, { width: colWidths[1] - 10, align: "left" });
        const rowHeight = Math.max(24, descHeight + 12);
        ensurePageSpace(rowHeight + 8, drawTableHeader);
        if (index % 2 === 1) {
          doc.fillColor("#F8FBFF").rect(tableX, doc.y, width, rowHeight).fill();
        }
        let x = tableX;
        const values = [
          row.itemCode,
          row.description,
          String(safeNum(row.quantity)),
          row.unit,
          fmtCurrency2(row.unitPrice, data.currency),
          fmtCurrency2(row.discount, data.currency),
          `${safeNum(row.vatRate).toLocaleString()}%`,
          fmtCurrency2(row.total, data.currency)
        ];
        values.forEach((value, cellIndex) => {
          doc.fillColor("#0F172A").font(cellIndex === 1 || cellIndex === 7 ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(String(value || "—"), x + 4, doc.y + 6, { width: colWidths[cellIndex] - 8, align: cellIndex < 2 ? "left" : "right" });
          x += colWidths[cellIndex];
        });
        doc.strokeColor("#E5EDF5").moveTo(tableX, doc.y + rowHeight).lineTo(tableX + width, doc.y + rowHeight).stroke();
        doc.y += rowHeight;
      });`;
const newRows = `      data.rows.forEach((row, index) => {
        const descHeight = doc.heightOfString(row.description, { width: colWidths[1] - 10, align: "left" });
        const rowHeight = Math.max(24, descHeight + 12);
        ensurePageSpace(rowHeight + 8, drawTableHeader);
        const rowY = doc.y;
        if (index % 2 === 1) {
          doc.fillColor("#F8FBFF").rect(tableX, rowY, width, rowHeight).fill();
        }
        let x = tableX;
        const values = [
          row.itemCode,
          row.description,
          String(safeNum(row.quantity)),
          row.unit,
          fmtCurrency2(row.unitPrice, data.currency),
          fmtCurrency2(row.discount, data.currency),
          `${safeNum(row.vatRate).toLocaleString()}%`,
          fmtCurrency2(row.total, data.currency)
        ];
        // Use one fixed Y coordinate for every cell. Previously each PDFKit text() call mutated doc.y,
        // causing the columns to staircase vertically and producing the broken PDF shown by the user.
        values.forEach((value, cellIndex) => {
          doc.fillColor("#0F172A").font(cellIndex === 1 || cellIndex === 7 ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(String(value || "—"), x + 4, rowY + 6, { width: colWidths[cellIndex] - 8, align: cellIndex < 2 ? "left" : "right" });
          x += colWidths[cellIndex];
        });
        doc.strokeColor("#E5EDF5").moveTo(tableX, rowY + rowHeight).lineTo(tableX + width, rowY + rowHeight).stroke();
        doc.y = rowY + rowHeight;
      });`;
if (!source.includes(oldRows)) throw new Error('A4 table-row block not found');
source = source.replace(oldRows, newRows);

fs.writeFileSync(file, source);
console.log('A4 PDF layout fixed: stable table Y coordinates, correct header alignment, non-overlapping document information panel, and exact column widths.');
