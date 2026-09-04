'use strict';

const PDFDocument = require('pdfkit');
const BRAND = require('../document-branding.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');
const { formatMoney, formatNumber, moneyFromInput, mulCents, taxCents } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const PAGE = { width: 595.28, height: 841.89, margin: 40, footer: 32 };
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - PAGE.footer;

function money(value, currency) { return formatMoney(value || 0, currency || 'KES'); }
function lineTotal(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty || 0);
  const discount = moneyFromInput(item.discount || 0);
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function calculate(items) {
  return items.reduce((sum, item) => {
    const row = lineTotal(item);
    sum.subtotal += row.gross; sum.discount += row.discount; sum.tax += row.tax; sum.total += row.total;
    return sum;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}

function renderPdfBuffer(payload, paper = 'a4') {
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type !== 'quotation') throw new Error('quotation-renderer only supports quotations');

  const doc = adapted.doc || {};
  const company = adapted.company || {};
  const currency = doc.currency || 'KES';
  const items = Array.isArray(doc.items) ? doc.items : [];
  const totals = calculate(items);

  registerFonts();
  const pdf = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
  const chunks = [];
  pdf.on('data', chunk => chunks.push(chunk));

  const usableWidth = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;

  function write(value, x, top, width, opts = {}) {
    pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || 9)
      .fillColor(opts.color || '#111827')
      .text(String(value ?? ''), x, top, { width, align: opts.align || 'left', lineGap: opts.lineGap || 1 });
  }
  function measure(value, width, opts = {}) {
    pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9);
    return pdf.heightOfString(String(value ?? ''), { width, lineGap: opts.lineGap || 1 });
  }
  function addPage() { pdf.addPage(); y = PAGE.margin; }
  function ensure(needed) { if (y + needed > CONTENT_BOTTOM) addPage(); }
  function block(title, body) {
    if (!body) return;
    const bodyH = measure(body, usableWidth, { size: 8.2 });
    const h = 13 + bodyH + 10;
    ensure(h);
    write(title, PAGE.margin, y, usableWidth, { bold: true, size: 8, color: '#475569' });
    y += 13;
    write(body, PAGE.margin, y, usableWidth, { size: 8.2, color: '#334155' });
    y += bodyH + 10;
  }

  function drawHeader() {
    const right = PAGE.width - PAGE.margin;
    const leftW = 320;
    const rightW = 180;
    const companyLines = [company.address, company.phone, company.email, company.website, company.taxId ? `KRA PIN: ${company.taxId}` : ''].filter(Boolean);
    let leftY = y;
    write(company.name || BRAND.legalName || 'Company', PAGE.margin, leftY, leftW, { bold: true, size: 15 });
    leftY += 22;
    for (const value of companyLines) { const h = measure(value, leftW, { size: 8.5 }); write(value, PAGE.margin, leftY, leftW, { size: 8.5, color: '#475569' }); leftY += h + 2; }
    write('QUOTATION', right - rightW, y, rightW, { bold: true, size: 20, align: 'right' });
    write(`Quote No. ${doc.number || '—'}`, right - rightW, y + 28, rightW, { size: 8.5, align: 'right' });
    write(`Date: ${doc.date || '—'}`, right - rightW, y + 42, rightW, { size: 8.5, align: 'right' });
    write(`Valid Until: ${doc.validUntil || '—'}`, right - rightW, y + 56, rightW, { size: 8.5, align: 'right' });
    y = Math.max(leftY, y + 72) + 10;
    pdf.strokeColor('#111827').lineWidth(1).moveTo(PAGE.margin, y).lineTo(right, y).stroke();
    y += 14;
  }

  const widths = [32, 245, 45, 55, 98, 40];
  function drawTableHeader() {
    ensure(26);
    const labels = ['#', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total'];
    let x = PAGE.margin;
    pdf.fillColor('#f1f5f9').rect(x, y, usableWidth, 22).fill();
    labels.forEach((label, i) => { write(label, x + 3, y + 6, widths[i] - 6, { bold: true, size: 7.5, align: i >= 2 ? 'right' : 'left' }); x += widths[i]; });
    y += 26;
  }

  drawHeader();
  ensure(80);
  write('BILL TO', PAGE.margin, y, 240, { bold: true, size: 7.5, color: '#64748b' });
  write('DOCUMENT INFORMATION', 320, y, 235, { bold: true, size: 7.5, color: '#64748b' });
  y += 14;
  const customerName = doc.customer?.name || 'Walk-in Customer';
  const customerLines = [doc.customer?.address, doc.customer?.phone, doc.customer?.email].filter(Boolean);
  const infoLines = [`Reference: ${doc.orderReference || doc.number || '—'}`, `Payment Terms: ${doc.terms || 'Quotation valid for 30 days from the date of issue.'}`, `Currency: ${currency}`];
  let customerH = measure(customerName, 240, { bold: true, size: 10.5 }) + 3;
  customerH += customerLines.reduce((sum, value) => sum + measure(value, 240, { size: 8.5 }) + 2, 0);
  const infoH = infoLines.reduce((sum, value) => sum + measure(value, 235, { size: 8.5 }) + 3, 0);
  ensure(Math.max(customerH, infoH) + 14);
  let cy = y; write(customerName, PAGE.margin, cy, 240, { bold: true, size: 10.5 }); cy += measure(customerName, 240, { bold: true, size: 10.5 }) + 3;
  for (const value of customerLines) { write(value, PAGE.margin, cy, 240, { size: 8.5, color: '#475569' }); cy += measure(value, 240, { size: 8.5 }) + 2; }
  let iy = y; for (const value of infoLines) { write(value, 320, iy, 235, { size: 8.5 }); iy += measure(value, 235, { size: 8.5 }) + 3; }
  y = Math.max(cy, iy) + 14;

  drawTableHeader();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const description = [item.description || 'Item', item.sub].filter(Boolean).join('\n');
    const rowH = Math.max(30, measure(description, widths[1] - 8, { bold: true, size: 8.7 }) + 12);
    if (y + rowH > CONTENT_BOTTOM) { addPage(); drawTableHeader(); }
    const values = [String(i + 1), description, formatNumber(item.qty || 0), item.sub || item.unit || 'pcs', money(item.unitPrice, currency), money(lineTotal(item).total, currency)];
    let x = PAGE.margin;
    values.forEach((value, col) => { write(value, x + 3, y + 6, widths[col] - 6, { bold: col === 1, size: col === 1 ? 8.7 : 8, align: col >= 2 ? 'right' : 'left', color: col === 1 ? '#111827' : '#334155' }); x += widths[col]; });
    pdf.strokeColor('#e2e8f0').lineWidth(.5).moveTo(PAGE.margin, y + rowH).lineTo(PAGE.width - PAGE.margin, y + rowH).stroke();
    y += rowH;
  }

  const summaryRows = [['Subtotal', money(totals.subtotal, currency)], ...(totals.discount ? [['Discount', money(totals.discount, currency)]] : []), ['VAT', money(totals.tax, currency)], ['GRAND TOTAL', money(totals.total, currency)]];
  const summaryH = 12 + summaryRows.reduce((sum, row) => sum + (row[0] === 'GRAND TOTAL' ? 24 : 17), 0);
  ensure(summaryH);
  y += 12;
  for (const [label, value] of summaryRows) { const grand = label === 'GRAND TOTAL'; write(label, 345, y, 90, { bold: grand, size: grand ? 10 : 8.5 }); write(value, 435, y, 120, { bold: grand, size: grand ? 10 : 8.5, align: 'right' }); y += grand ? 24 : 17; }

  block('NOTES', doc.notes);
  block('TERMS & CONDITIONS', doc.terms);
  block('WARRANTY', doc.warranty || 'All products are covered by the manufacturer’s warranty where applicable.');
  block('RETURN POLICY', doc.returnPolicy || 'Returns are subject to the company’s applicable return policy and product condition.');

  const signatureH = 64;
  ensure(signatureH);
  const sigW = (usableWidth - 24) / 3;
  ['Prepared By', 'Customer Acceptance', 'Approved By'].forEach((label, i) => {
    const x = PAGE.margin + i * (sigW + 12);
    write(label, x, y, sigW, { bold: true, size: 8 });
    pdf.strokeColor('#94a3b8').lineWidth(.6).moveTo(x, y + 42).lineTo(x + sigW, y + 42).stroke();
    write('Signature / Date', x, y + 46, sigW, { size: 7.2, color: '#64748b' });
  });
  y += signatureH;

  const payment = doc.paymentDetails || {};
  const paymentLines = [
    payment.paybill ? `M-PESA Paybill: ${payment.paybill}` : '',
    payment.till ? `M-PESA Till: ${payment.till}` : '',
    payment.account ? `Account No.: ${payment.account}` : '',
    payment.bank ? `Bank: ${payment.bank}` : ''
  ].filter(Boolean);
  if (paymentLines.length) {
    const paymentH = 14 + paymentLines.reduce((sum, value) => sum + measure(value, usableWidth, { size: 8.2 }) + 2, 0);
    ensure(paymentH);
    write('HOW TO PAY', PAGE.margin, y, usableWidth, { bold: true, size: 8, color: '#475569' }); y += 14;
    for (const value of paymentLines) { write(value, PAGE.margin, y, usableWidth, { size: 8.2 }); y += measure(value, usableWidth, { size: 8.2 }) + 2; }
  }

  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    pdf.switchToPage(i);
    write(`Page ${i + 1} of ${range.count}`, PAGE.margin, PAGE.height - 24, usableWidth, { size: 7, color: '#64748b', align: 'center' });
  }
  pdf.end();
  return new Promise((resolve, reject) => { pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
}

module.exports = { renderPdfBuffer };
