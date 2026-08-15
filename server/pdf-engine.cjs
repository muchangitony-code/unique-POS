'use strict';

const { PDFDocument, rgb } = require('pdf-lib');
const { loadFonts } = require('./pdf-fonts.cjs');
const { sanitizeText, numberValue, formatCurrency2, wrapText } = require('./pdf-formatters.cjs');

const A4 = [595.28, 841.89];
const THERMAL = { '58mm': 164, '80mm': 227 };
const COLORS = {
  text: rgb(15 / 255, 23 / 255, 42 / 255),
  muted: rgb(71 / 255, 85 / 255, 105 / 255),
  line: rgb(226 / 255, 232 / 255, 240 / 255),
  soft: rgb(248 / 255, 250 / 255, 252 / 255),
  white: rgb(1, 1, 1)
};

function hexColor(value, fallback) {
  const m = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(m)) return fallback;
  return rgb(parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255);
}
function first(...values) {
  for (const value of values) if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  return '';
}
function drawText(page, font, text, x, y, size, color = COLORS.text) { page.drawText(sanitizeText(text), { x, y, size, font, color }); }
function drawRight(page, font, text, rightX, y, size, color = COLORS.text) { const v = sanitizeText(text); page.drawText(v, { x: rightX - font.widthOfTextAtSize(v, size), y, size, font, color }); }
function drawCentered(page, font, text, centerX, y, size, color = COLORS.text) { const v = sanitizeText(text); page.drawText(v, { x: centerX - font.widthOfTextAtSize(v, size) / 2, y, size, font, color }); }
function rect(page, x, y, width, height, color, borderColor, borderWidth = 0) { page.drawRectangle({ x, y, width, height, color, borderColor, borderWidth }); }
function line(page, x1, y1, x2, y2, color = COLORS.line, width = 0.7) { page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness: width }); }
function drawWrapped(page, font, text, x, y, size, width, lineGap = 2, color = COLORS.text) {
  const lines = wrapText(text, font, size, width);
  lines.forEach((l, i) => drawText(page, font, l, x, y - i * (size + lineGap), size, color));
  return lines.length * (size + lineGap);
}

function normalizeData(payload, paper) {
  if (!payload || !payload.totals || !Array.isArray(payload.rows)) throw new Error('Missing or invalid order data for PDF generation');
  const settings = payload.settings || {};
  const company = payload.company || {};
  const currency = sanitizeText(first(payload.currency, settings.currency, 'KES')).toUpperCase();
  return {
    paper, isReceipt: paper === '58mm' || paper === '80mm', currency,
    primary: hexColor(first(company.primaryColor, settings.primaryColor), rgb(8 / 255, 61 / 255, 109 / 255)),
    companyName: sanitizeText(first(company.name, company.businessName, settings.businessName, 'Unique Solar Kenya Ltd')),
    companyAddress: sanitizeText(first(company.address, company.businessAddress, settings.businessAddress)),
    companyPhone: sanitizeText(first(company.phone, company.businessPhone, settings.businessPhone)),
    companyEmail: sanitizeText(first(company.email, company.businessEmail, settings.businessEmail)),
    website: sanitizeText(first(company.website, settings.website)),
    taxPin: sanitizeText(first(company.taxPin, settings.taxNumber, settings.taxPin)),
    branchName: sanitizeText(first(payload.branchName, payload.branch?.name)),
    documentTitle: sanitizeText(first(payload.documentType, 'Document')),
    documentNumber: sanitizeText(first(payload.documentNumber, '—')),
    documentDate: sanitizeText(first(payload.documentDate, payload.date, new Date().toISOString().slice(0, 10))),
    dueDate: sanitizeText(first(payload.dueDate)), dueDateLabel: sanitizeText(first(payload.dueDateLabel, 'Due Date')),
    salesperson: sanitizeText(first(payload.salesperson, payload.cashierName, 'Sales Team')),
    customerName: sanitizeText(first(payload.customerName, payload.partyName, payload.customer?.name, 'Walk-in Customer')),
    customerCompany: sanitizeText(first(payload.customerCompany, payload.customer?.company)),
    customerAddress: sanitizeText(first(payload.customerAddress, payload.customer?.address)),
    customerPhone: sanitizeText(first(payload.customerPhone, payload.customer?.phone)),
    customerEmail: sanitizeText(first(payload.customerEmail, payload.customer?.email)),
    customerTaxNumber: sanitizeText(first(payload.customerTaxNumber, payload.customer?.taxNumber)),
    reference: sanitizeText(first(payload.reference)), paymentTerms: sanitizeText(first(payload.paymentTerms, 'Due on receipt')),
    paymentMethod: sanitizeText(first(payload.paymentMethod, payload.paymentMethodDisplay, 'Cash')),
    amountPaid: numberValue(first(payload.amountPaid, payload.payment?.amountPaid)), changeAmount: numberValue(first(payload.changeAmount, payload.payment?.change)),
    notes: Array.isArray(payload.notesSections) ? payload.notesSections : [],
    termsLines: Array.isArray(payload.termsLines) ? payload.termsLines.map(sanitizeText).filter(Boolean) : [],
    payment: payload.payment || {},
    rows: payload.rows.map((row) => ({
      itemCode: sanitizeText(first(row.itemCode, row.productCode, '—')), description: sanitizeText(first(row.description, row.productName, 'Item')),
      quantity: numberValue(row.quantity), unit: sanitizeText(first(row.unit, 'pcs')), unitPrice: numberValue(row.unitPrice), total: numberValue(row.total)
    })),
    totals: {
      subtotal: numberValue(payload.totals.subtotal), discount: numberValue(payload.totals.discount), tax: numberValue(first(payload.totals.tax, payload.totals.vat)),
      shipping: numberValue(payload.totals.shipping), total: numberValue(payload.totals.total)
    }
  };
}

function estimateRow(row, font, size, width) { return Math.max(24, wrapText(row.description, font, size, width).length * (size + 2) + 10); }
function paginateRows(rows, firstAvailable, normalAvailable, font) {
  const pages = []; let pageRows = []; let used = 0; let cap = firstAvailable;
  for (const row of rows) {
    const h = estimateRow(row, font, 8.3, 215);
    if (pageRows.length && used + h > cap) { pages.push(pageRows); pageRows = []; used = 0; cap = normalAvailable; }
    pageRows.push(row); used += h;
  }
  if (pageRows.length || !pages.length) pages.push(pageRows);
  return pages;
}
function drawA4Header(page, data, fonts, continuation) {
  const { regular, bold } = fonts; const margin = 36; const width = A4[0] - margin * 2;
  rect(page, 0, A4[1] - 7, A4[0], 7, data.primary);
  if (continuation) { drawText(page, bold, `${data.documentTitle} ${data.documentNumber}`, margin, A4[1] - 34, 11, data.primary); return A4[1] - 58; }
  let y = A4[1] - 35;
  drawText(page, bold, data.companyName, margin, y, 17, data.primary); y -= 20;
  if (data.companyAddress) y -= drawWrapped(page, regular, data.companyAddress, margin, y, 8.5, 260, 1, COLORS.muted);
  const contact = [data.companyPhone, data.companyEmail].filter(Boolean).join(' · '); if (contact) { drawText(page, regular, contact, margin, y, 8.5, COLORS.muted); y -= 12; }
  if (data.taxPin) { drawText(page, regular, `KRA PIN: ${data.taxPin}`, margin, y, 8.5, COLORS.muted); y -= 12; }
  if (data.branchName) drawText(page, regular, data.branchName, margin, y, 8.5, COLORS.muted);
  const cardW = 190, cardX = A4[0] - margin - cardW, cardY = A4[1] - 123;
  rect(page, cardX, cardY, cardW, 84, data.primary);
  drawText(page, bold, data.documentTitle.toUpperCase(), cardX + 12, cardY + 60, 15, COLORS.white);
  drawText(page, regular, data.documentNumber, cardX + 12, cardY + 44, 9, COLORS.white);
  drawText(page, regular, `Date: ${data.documentDate}`, cardX + 12, cardY + 28, 8.5, COLORS.white);
  if (data.dueDate) drawText(page, regular, `${data.dueDateLabel}: ${data.dueDate}`, cardX + 12, cardY + 14, 8.5, COLORS.white);
  const billY = A4[1] - 145;
  rect(page, margin, billY - 65, width, 65, COLORS.soft, COLORS.line, 0.7);
  drawText(page, bold, 'BILL TO', margin + 12, billY - 16, 8.5, data.primary);
  drawText(page, bold, data.customerName, margin + 12, billY - 32, 11);
  const customer = [data.customerCompany, data.customerAddress, data.customerPhone, data.customerEmail, data.customerTaxNumber ? `KRA PIN: ${data.customerTaxNumber}` : ''].filter(Boolean).join(' · ');
  drawWrapped(page, regular, customer, margin + 12, billY - 45, 7.8, width - 24, 1.2, COLORS.muted);
  return A4[1] - 230;
}
function tableHeader(page, fonts, data, y) {
  const { bold } = fonts; const x0 = 36; const cols = [55, 225, 42, 48, 75, 82]; const labels = ['Code', 'Description', 'Qty', 'Unit', 'Unit Price', 'Amount']; const h = 22;
  rect(page, x0, y - h + 3, cols.reduce((a, b) => a + b, 0), h, data.primary); let x = x0;
  labels.forEach((label, i) => { if (i >= 2) drawRight(page, bold, label, x + cols[i] - 5, y - 12, 7.5, COLORS.white); else drawText(page, bold, label, x + 5, y - 12, 7.5, COLORS.white); x += cols[i]; });
  return { cols, y: y - h };
}
function drawRow(page, fonts, data, row, y, index, cols) {
  const { regular, bold } = fonts; const x0 = 36; const size = 8.3; const h = estimateRow(row, regular, size, cols[1] - 10); const totalW = cols.reduce((a, b) => a + b, 0);
  if (index % 2) rect(page, x0, y - h + 3, totalW, h, COLORS.soft);
  let x = x0;
  drawWrapped(page, regular, row.itemCode, x + 5, y - 9, size, cols[0] - 10, 1, COLORS.muted); x += cols[0];
  drawWrapped(page, regular, row.description, x + 5, y - 9, size, cols[1] - 10); x += cols[1];
  drawRight(page, regular, String(row.quantity), x + cols[2] - 5, y - 9, size); x += cols[2];
  drawText(page, regular, row.unit, x + 5, y - 9, size); x += cols[3];
  drawRight(page, regular, formatCurrency2(row.unitPrice, data.currency), x + cols[4] - 5, y - 9, size); x += cols[4];
  drawRight(page, bold, formatCurrency2(row.total, data.currency), x + cols[5] - 5, y - 9, size);
  line(page, x0, y - h + 3, x0 + totalW, y - h + 3); return h;
}
function drawSummary(page, fonts, data, y) {
  const { regular, bold } = fonts; const rightX = A4[0] - 36; const w = 210; const x = rightX - w;
  const rows = [['Subtotal', data.totals.subtotal], ...(data.totals.discount ? [['Discount', -data.totals.discount]] : []), ['VAT', data.totals.tax], ...(data.totals.shipping ? [['Shipping', data.totals.shipping]] : [])];
  const h = 28 + rows.length * 20; rect(page, x, y - h, w, h, COLORS.white, COLORS.line, 0.8); let cy = y - 17;
  rows.forEach(([label, value]) => { drawText(page, regular, label, x + 12, cy, 8.5, COLORS.muted); drawRight(page, regular, formatCurrency2(value, data.currency), rightX - 12, cy, 8.5); line(page, x + 10, cy - 6, rightX - 10, cy - 6); cy -= 20; });
  rect(page, x, y - h, w, 28, data.primary); drawText(page, bold, 'GRAND TOTAL', x + 12, y - h + 9, 8.5, COLORS.white); drawRight(page, bold, formatCurrency2(data.totals.total, data.currency), rightX - 12, y - h + 8, 12, COLORS.white); return h;
}
function drawNotes(page, fonts, data, x, y, width) {
  const { regular, bold } = fonts; let cy = y;
  for (const [label, value] of data.notes) { const lines = wrapText(value, regular, 8, width - 20); const h = 22 + lines.length * 11; rect(page, x, cy - h, width, h, COLORS.soft, COLORS.line, 0.7); drawText(page, bold, label, x + 10, cy - 14, 8, data.primary); lines.forEach((l, i) => drawText(page, regular, l, x + 10, cy - 28 - i * 11, 8, COLORS.muted)); cy -= h + 8; }
}
function drawTerms(page, fonts, data, x, y, width) {
  if (!data.termsLines.length) return;
  const { regular, bold } = fonts; const lines = []; data.termsLines.forEach((t, i) => wrapText(`${i + 1}. ${t}`, regular, 7.7, width - 20).forEach((l) => lines.push(l))); const h = 24 + lines.length * 10;
  rect(page, x, y - h, width, h, COLORS.soft, COLORS.line, 0.7); drawText(page, bold, 'TERMS & CONDITIONS', x + 10, y - 14, 8, data.primary); lines.forEach((l, i) => drawText(page, regular, l, x + 10, y - 28 - i * 10, 7.7, COLORS.muted));
}
async function renderA4(data, pdfDoc, fonts) {
  const firstAvail = 841.89 - 230 - 34 - 190, normalAvail = 841.89 - 72 - 34;
  const pages = paginateRows(data.rows, firstAvail - 30, normalAvail - 30, fonts.regular);
  const totalPages = pages.length;
  pages.forEach((rows, pageIndex) => {
    const page = pdfDoc.addPage(A4); let y = drawA4Header(page, data, fonts, pageIndex > 0); const header = tableHeader(page, fonts, data, y); y = header.y - 2;
    rows.forEach((row, i) => { y -= drawRow(page, fonts, data, row, y, i, header.cols); });
    if (pageIndex === totalPages - 1) {
      y -= 12; const notesWidth = 245; drawSummary(page, fonts, data, y); drawNotes(page, fonts, data, 36, y, notesWidth); y -= 118; drawTerms(page, fonts, data, 36, y, A4[0] - 72);
    }
    drawRight(page, fonts.regular, `Page ${pageIndex + 1} of ${totalPages}`, A4[0] - 36, 20, 7.5, COLORS.muted);
  });
}
function thermalHeight(data, font, paper) {
  const width = THERMAL[paper]; const size = paper === '58mm' ? 8 : 9; const inner = width - (paper === '58mm' ? 20 : 24); let h = 150;
  for (const row of data.rows) h += Math.max(15, wrapText(row.description, font, size, inner - 74).length * 10 + 5);
  return h + 125;
}
function drawThermal(data, pdfDoc, fonts) {
  const width = THERMAL[data.paper], margin = data.paper === '58mm' ? 10 : 12, inner = width - margin * 2, size = data.paper === '58mm' ? 8 : 9; const height = thermalHeight(data, fonts.regular, data.paper);
  const page = pdfDoc.addPage([width, height]); let y = height - 17; rect(page, 0, height - 5, width, 5, data.primary);
  drawCentered(page, fonts.bold, data.companyName, width / 2, y, data.paper === '58mm' ? 12 : 14, data.primary); y -= 15;
  drawCentered(page, fonts.regular, [data.companyAddress, data.companyPhone, data.companyEmail].filter(Boolean).join(' · '), width / 2, y, size - 0.5, COLORS.muted); y -= 16; line(page, margin, y, width - margin, y); y -= 13;
  [['Receipt', data.documentNumber], ['Date', data.documentDate], ['Cashier', data.salesperson], ['Customer', data.customerName]].forEach(([label, value]) => { drawText(page, fonts.regular, label, margin, y, size, COLORS.muted); drawRight(page, fonts.bold, value, width - margin, y, size); y -= 12; });
  y -= 4; line(page, margin, y, width - margin, y); y -= 13;
  const qtyRight = width - margin - 74, priceRight = width - margin - 37, totalRight = width - margin;
  drawText(page, fonts.bold, 'Item', margin, y, size - .4); drawRight(page, fonts.bold, 'Qty', qtyRight, y, size - .4); drawRight(page, fonts.bold, 'Price', priceRight, y, size - .4); drawRight(page, fonts.bold, 'Total', totalRight, y, size - .4); y -= 9; line(page, margin, y, width - margin, y); y -= 12;
  data.rows.forEach((row) => { const lines = wrapText(row.description, fonts.regular, size, qtyRight - margin - 8); lines.forEach((l, i) => drawText(page, i === 0 ? fonts.bold : fonts.regular, l, margin, y - i * 10, size)); const h = Math.max(13, lines.length * 10); drawRight(page, fonts.regular, String(row.quantity), qtyRight, y, size); drawRight(page, fonts.regular, formatCurrency2(row.unitPrice, data.currency), priceRight, y, size - .4); drawRight(page, fonts.bold, formatCurrency2(row.total, data.currency), totalRight, y, size - .4); y -= h + 3; });
  line(page, margin, y, width - margin, y); y -= 13;
  [['Subtotal', data.totals.subtotal], ['Discount', -data.totals.discount], ['VAT', data.totals.tax], ['Cash', data.amountPaid], ['Change', Math.max(0, data.changeAmount)]].forEach(([label, value]) => { if (label === 'Discount' && value === 0) return; drawText(page, fonts.regular, label, margin, y, size); drawRight(page, fonts.regular, formatCurrency2(value, data.currency), width - margin, y, size); y -= 12; });
  rect(page, margin, y - 25, inner, 25, data.primary); drawText(page, fonts.bold, 'TOTAL', margin + 7, y - 16, data.paper === '58mm' ? 9 : 10, COLORS.white); drawRight(page, fonts.bold, formatCurrency2(data.totals.total, data.currency), width - margin - 7, y - 16, data.paper === '58mm' ? 9 : 10, COLORS.white); y -= 38;
  drawCentered(page, fonts.regular, data.paymentMethod, width / 2, y, size, COLORS.muted); y -= 14; line(page, margin, y, width - margin, y); y -= 14; drawCentered(page, fonts.bold, 'Thank you for your business!', width / 2, y, size, data.primary);
}
async function renderPdfBuffer(payload, paper = 'a4') {
  const normalizedPaper = paper === '58mm' || paper === '80mm' ? paper : 'a4'; const data = normalizeData(payload, normalizedPaper); const pdfDoc = await PDFDocument.create(); const fonts = await loadFonts(pdfDoc);
  if (data.isReceipt) drawThermal(data, pdfDoc, fonts); else await renderA4(data, pdfDoc, fonts);
  const bytes = await pdfDoc.save({ useObjectStreams: true }); const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('PDF generator produced an invalid header');
  if (!buffer.includes(Buffer.from('%%EOF'))) throw new Error('PDF generator produced an incomplete stream');
  return buffer;
}
async function renderZReportPdf(report) {
  const byMethod = Array.isArray(report.byPaymentMethod) ? report.byPaymentMethod : [];
  const rows = byMethod.map((m) => ({ itemCode: sanitizeText(m.method || 'Unknown'), description: `${numberValue(m.count)} transaction(s)`, quantity: numberValue(m.count), unit: 'sales', unitPrice: numberValue(m.amount), total: numberValue(m.amount) }));
  const daily = Array.isArray(report.dailyBreakdown) ? report.dailyBreakdown : [];
  daily.forEach((d) => rows.push({ itemCode: sanitizeText(d.date || ''), description: 'Daily sales total', quantity: numberValue(d.count), unit: 'sales', unitPrice: numberValue(d.total), total: numberValue(d.total) }));
  return renderPdfBuffer({
    documentType: 'Z Report', documentNumber: first(report.documentNumber, 'Z-REPORT'), documentDate: first(report.date, new Date().toISOString().slice(0, 10)),
    company: report.company || {}, settings: report.settings || {}, branchName: report.branchName, customerName: 'Daily Sales Summary', currency: first(report.currency, report.settings?.currency, 'KES'), rows,
    totals: { subtotal: numberValue(report.totalSales), discount: 0, tax: 0, shipping: 0, total: numberValue(report.totalSales) },
    paymentMethod: 'Daily Z Report', amountPaid: numberValue(report.totalSales), changeAmount: 0,
    notesSections: [['Transactions', String(numberValue(report.totalTransactions))], ['Average Order Value', formatCurrency2(report.averageOrderValue, first(report.currency, 'KES'))]], termsLines: [], payment: {}
  }, 'a4');
}
module.exports = { renderPdfBuffer, renderZReportPdf, normalizeData, constants: { A4, THERMAL } };
