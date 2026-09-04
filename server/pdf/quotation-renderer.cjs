'use strict';

const PDFDocument = require('pdfkit');
const BRAND = require('../document-branding.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');
const { formatMoney, formatNumber, moneyFromInput, mulCents, taxCents } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const BOTTOM = PAGE.height - 40;

function money(value, currency) {
  return formatMoney(value || 0, currency || 'KES');
}

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
    sum.subtotal += row.gross;
    sum.discount += row.discount;
    sum.tax += row.tax;
    sum.total += row.total;
    return sum;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}

function renderPdfBuffer(payload, paper = 'a4') {
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type !== 'quotation') throw new Error('quotation-renderer only supports quotations');

  const { doc } = adapted;
  const company = doc.company || {};
  const currency = doc.currency || 'KES';
  const items = Array.isArray(doc.items) ? doc.items : [];
  const totals = calculate(items);

  registerFonts();
  const pdf = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
  const chunks = [];
  pdf.on('data', chunk => chunks.push(chunk));

  const text = (value, x, y, width, opts = {}) => {
    pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || 9)
      .fillColor(opts.color || '#111827')
      .text(String(value ?? ''), x, y, { width, align: opts.align || 'left', lineGap: opts.lineGap || 1 });
  };
  const height = (value, width, opts = {}) => {
    pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9);
    return pdf.heightOfString(String(value ?? ''), { width, lineGap: opts.lineGap || 1 });
  };

  let y = PAGE.margin;
  const addPage = () => { pdf.addPage(); y = PAGE.margin; };
  const ensure = needed => { if (y + needed > BOTTOM) addPage(); };

  const drawHeader = () => {
    const right = PAGE.width - PAGE.margin;
    text(company.name || BRAND.legalName || 'Company', PAGE.margin, y, 320, { bold: true, size: 15 });
    y += 21;
    for (const value of [company.address, company.phone, company.email, company.website, company.taxId ? `KRA PIN: ${company.taxId}` : ''].filter(Boolean)) {
      text(value, PAGE.margin, y, 320, { size: 8.5, color: '#475569' });
      y += height(value, 320, { size: 8.5 }) + 2;
    }
    text('QUOTATION', right - 180, PAGE.margin, 180, { bold: true, size: 20, align: 'right' });
    text(`Quote No. ${doc.number || '—'}`, right - 180, PAGE.margin + 28, 180, { size: 8.5, align: 'right' });
    text(`Date: ${doc.date || '—'}`, right - 180, PAGE.margin + 42, 180, { size: 8.5, align: 'right' });
    text(`Valid Until: ${doc.validUntil || '—'}`, right - 180, PAGE.margin + 56, 180, { size: 8.5, align: 'right' });
    y = Math.max(y, PAGE.margin + 82) + 12;
    pdf.strokeColor('#111827').lineWidth(1).moveTo(PAGE.margin, y).lineTo(right, y).stroke();
    y += 14;
  };

  const drawTableHeader = () => {
    ensure(24);
    const x = PAGE.margin;
    const widths = [32, 245, 45, 55, 98, 40];
    const labels = ['#', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total'];
    let cx = x;
    pdf.fillColor('#f1f5f9').rect(x, y, PAGE.width - 2 * PAGE.margin, 22).fill();
    labels.forEach((label, i) => {
      text(label, cx + 3, y + 6, widths[i] - 6, { bold: true, size: 7.5, align: i >= 2 ? 'right' : 'left' });
      cx += widths[i];
    });
    y += 26;
  };

  drawHeader();
  ensure(70);
  text('BILL TO', PAGE.margin, y, 240, { bold: true, size: 7.5, color: '#64748b' });
  text('DOCUMENT INFORMATION', 320, y, 235, { bold: true, size: 7.5, color: '#64748b' });
  y += 14;
  text(doc.customer?.name || 'Walk-in Customer', PAGE.margin, y, 240, { bold: true, size: 10.5 });
  const info = [`Reference: ${doc.orderReference || doc.number || '—'}`, `Payment Terms: ${doc.paymentTerms || 'Quotation valid for 30 days from the date of issue.'}`, `Currency: ${currency}`];
  let infoY = y;
  for (const value of info) { text(value, 320, infoY, 235, { size: 8.5 }); infoY += height(value, 235, { size: 8.5 }) + 3; }
  let customerY = y + height(doc.customer?.name || 'Walk-in Customer', 240, { bold: true, size: 10.5 }) + 3;
  for (const value of [doc.customer?.address, doc.customer?.phone, doc.customer?.email].filter(Boolean)) { text(value, PAGE.margin, customerY, 240, { size: 8.5, color: '#475569' }); customerY += height(value, 240, { size: 8.5 }) + 2; }
  y = Math.max(customerY, infoY) + 14;

  drawTableHeader();
  const widths = [32, 245, 45, 55, 98, 40];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const description = [item.description || item.name || 'Item', item.sub].filter(Boolean).join('\n');
    const rowH = Math.max(30, height(description, widths[1] - 8, { bold: true, size: 8.7 }) + 12);
    if (y + rowH > BOTTOM - 20) drawTableHeader();
    const values = [String(i + 1), description, formatNumber(item.qty || 0), item.unit || 'pcs', money(item.unitPrice, currency), money(lineTotal(item).total, currency)];
    let cx = PAGE.margin;
    values.forEach((value, col) => {
      text(value, cx + 3, y + 6, widths[col] - 6, { bold: col === 1, size: col === 1 ? 8.7 : 8, align: col >= 2 ? 'right' : 'left', color: col === 1 ? '#111827' : '#334155' });
      cx += widths[col];
    });
    pdf.strokeColor('#e2e8f0').lineWidth(.5).moveTo(PAGE.margin, y + rowH).lineTo(PAGE.width - PAGE.margin, y + rowH).stroke();
    y += rowH;
  }

  ensure(110);
  const summaryX = 345;
  const summaryW = 210;
  const summaryRows = [
    ['Subtotal', money(totals.subtotal, currency)],
    ...(totals.discount ? [['Discount', money(totals.discount, currency)]] : []),
    ['VAT', money(totals.tax, currency)],
    ['GRAND TOTAL', money(totals.total, currency)]
  ];
  y += 12;
  for (const [label, value] of summaryRows) {
    const grand = label === 'GRAND TOTAL';
    text(label, summaryX, y, 90, { bold: grand, size: grand ? 10 : 8.5 });
    text(value, summaryX + 90, y, 120, { bold: grand, size: grand ? 10 : 8.5, align: 'right' });
    y += grand ? 24 : 17;
  }

  const notes = [
    ['NOTES', doc.notes || ''],
    ['Warranty', doc.warranty || 'All products are covered by the manufacturer\'s warranty where applicable.'],
    ['Return Policy', doc.returnPolicy || 'Returns are subject to the company\'s applicable return policy and product condition.']
  ].filter(([, value]) => value);
  for (const [title, body] of notes) {
    const blockH = 18 + height(body, PAGE.width - 2 * PAGE.margin, { size: 8.2 }) + 10;
    ensure(blockH);
    text(title, PAGE.margin, y, PAGE.width - 2 * PAGE.margin, { bold: true, size: 8, color: '#475569' });
    y += 13;
    text(body, PAGE.margin, y, PAGE.width - 2 * PAGE.margin, { size: 8.2, color: '#334155' });
    y += height(body, PAGE.width - 2 * PAGE.margin, { size: 8.2 }) + 10;
  }

  const signatureH = 64;
  ensure(signatureH);
  const sigW = (PAGE.width - 2 * PAGE.margin - 24) / 3;
  const labels = ['Prepared By', 'Customer Acceptance', 'Approved By'];
  labels.forEach((label, i) => {
    const x = PAGE.margin + i * (sigW + 12);
    text(label, x, y, sigW, { bold: true, size: 8 });
    pdf.strokeColor('#94a3b8').lineWidth(.6).moveTo(x, y + 42).lineTo(x + sigW, y + 42).stroke();
    text('Signature / Date', x, y + 46, sigW, { size: 7.2, color: '#64748b' });
  });
  y += signatureH;

  const paymentLines = [
    company.paybill ? `M-PESA Paybill: ${company.paybill}` : '',
    company.accountNumber ? `Account No.: ${company.accountNumber}` : '',
    company.bankName ? `Bank: ${company.bankName}` : '',
    company.bankBranch ? `Branch: ${company.bankBranch}` : ''
  ].filter(Boolean);
  if (paymentLines.length) {
    const paymentH = 20 + paymentLines.reduce((h, value) => h + height(value, PAGE.width - 2 * PAGE.margin, { size: 8.2 }) + 2, 0);
    ensure(paymentH);
    text('HOW TO PAY', PAGE.margin, y, PAGE.width - 2 * PAGE.margin, { bold: true, size: 8, color: '#475569' });
    y += 14;
    for (const value of paymentLines) { text(value, PAGE.margin, y, PAGE.width - 2 * PAGE.margin, { size: 8.2 }); y += height(value, PAGE.width - 2 * PAGE.margin, { size: 8.2 }) + 2; }
  }

  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    pdf.switchToPage(i);
    text(`Page ${i + 1} of ${range.count}`, PAGE.margin, PAGE.height - 28, PAGE.width - 2 * PAGE.margin, { size: 7, color: '#64748b', align: 'center' });
  }

  pdf.end();
  return new Promise((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
}

module.exports = { renderPdfBuffer };
