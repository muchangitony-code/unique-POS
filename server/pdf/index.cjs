'use strict';

const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { getFonts } = require('./fonts');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const CONTENT_W = A4.width - M * 2;
const COLORS = { text: '#111827', muted: '#6B7280', line: '#D1D5DB', soft: '#F8FAFC', accent: '#083D6D', white: '#FFFFFF' };
const COLS = { description: 210, qty: 45, unitPrice: 100, tax: 50, amount: 110 };
const TABLE_W = Object.values(COLS).reduce((a, b) => a + b, 0);
const ROW_FONT = 8.5;
const FOOTER_H = 28;

function itemTotals(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, net, tax, total: net + tax };
}
function computeTotals(items) {
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const item of items) { const t = itemTotals(item); subtotal += t.gross; discount += t.discount; tax += t.tax; total += t.total; }
  return { subtotal, discount, tax, total };
}
function text(doc, value, x, y, opts = {}) { doc.font(opts.font || 'body').fontSize(opts.size || 9).fillColor(opts.color || COLORS.text).text(String(value ?? ''), x, y, { width: opts.width, align: opts.align || 'left', lineGap: opts.lineGap || 0 }); }
function rightText(doc, value, x, y, width, opts = {}) { text(doc, value, x, y, { ...opts, width, align: 'right' }); }
function rule(doc, y) { doc.strokeColor(COLORS.line).lineWidth(0.6).moveTo(M, y).lineTo(A4.width - M, y).stroke(); }
function safeDescription(value) { return String(value ?? '').replace(/([^\s]{30})(?=[^\s])/g, '$1\u200b'); }
function wrapHeight(doc, value, width, size = ROW_FONT, font = 'body') { doc.font(font).fontSize(size); return doc.heightOfString(String(value ?? ''), { width, lineGap: 0 }); }
function rowHeight(doc, item) { return Math.max(26, wrapHeight(doc, safeDescription(item.description), COLS.description - 12) + 12); }

function drawFooter(doc, pageNumber, totalPages, data) {
  const y = A4.height - 25;
  rule(doc, y - 5);
  text(doc, data.type === 'invoice' ? 'Invoice' : 'Quotation', M, y, { size: 7.5, color: COLORS.muted });
  rightText(doc, `Page ${pageNumber} of ${totalPages}`, A4.width - M - 110, y, 110, { size: 7.5, color: COLORS.muted });
}
function drawHeader(doc, data) {
  const y = M;
  doc.fillColor(COLORS.accent).rect(0, 0, A4.width, 6).fill();
  if (Buffer.isBuffer(data.company.logo)) { try { doc.image(data.company.logo, M, y + 4, { fit: [58, 40] }); } catch {} }
  const nameX = Buffer.isBuffer(data.company.logo) ? M + 68 : M;
  text(doc, data.company.name, nameX, y + 5, { font: 'bodyBold', size: 17, color: COLORS.accent, width: 300 });
  if (data.company.address) text(doc, data.company.address, nameX, y + 28, { size: 8, color: COLORS.muted, width: 300 });
  const contact = [data.company.phone, data.company.email].filter(Boolean).join(' · ');
  if (contact) text(doc, contact, nameX, y + 41, { size: 8, color: COLORS.muted, width: 300 });
  if (data.company.taxId) text(doc, `Tax ID: ${data.company.taxId}`, nameX, y + 54, { size: 8, color: COLORS.muted, width: 300 });
  const cardX = A4.width - M - 185;
  doc.fillColor(COLORS.accent).roundedRect(cardX, y + 2, 185, 76, 4).fill();
  text(doc, data.type === 'invoice' ? 'INVOICE' : 'QUOTATION', cardX + 12, y + 13, { font: 'bodyBold', size: 15, color: COLORS.white });
  text(doc, data.number, cardX + 12, y + 33, { size: 9, color: COLORS.white });
  text(doc, `Date: ${data.date}`, cardX + 12, y + 47, { size: 8, color: COLORS.white });
  text(doc, `${data.type === 'invoice' ? 'Due date' : 'Valid until'}: ${data.type === 'invoice' ? data.dueDate || '—' : data.validUntil || '—'}`, cardX + 12, y + 60, { size: 8, color: COLORS.white });
  const billY = y + 94;
  doc.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, billY, CONTENT_W, 66, 3).fillAndStroke();
  text(doc, 'CUSTOMER', M + 10, billY + 9, { font: 'bodyBold', size: 7.5, color: COLORS.accent });
  text(doc, data.customer.name, M + 10, billY + 23, { font: 'bodyBold', size: 10.5, width: 240 });
  const details = [data.customer.address, data.customer.phone, data.customer.email, data.customer.taxId ? `Tax ID: ${data.customer.taxId}` : ''].filter(Boolean).join(' · ');
  if (details) text(doc, details, M + 10, billY + 39, { size: 7.5, color: COLORS.muted, width: CONTENT_W - 20 });
  const status = data.type === 'invoice' ? 'UNPAID' : 'VALID';
  doc.fillColor(COLORS.white).strokeColor(COLORS.accent).lineWidth(0.6).roundedRect(A4.width - M - 82, billY + 9, 70, 20, 10).fillAndStroke();
  text(doc, status, A4.width - M - 78, billY + 15, { font: 'bodyBold', size: 7, color: COLORS.accent, width: 62, align: 'center' });
  return billY + 80;
}
function drawTableHeader(doc, y) {
  const h = 23;
  doc.fillColor(COLORS.accent).rect(M, y, TABLE_W, h).fill();
  let x = M;
  text(doc, 'Description', x + 6, y + 7, { font: 'bodyBold', size: 7.5, color: COLORS.white, width: COLS.description - 12 }); x += COLS.description;
  rightText(doc, 'Qty', x, y + 7, COLS.qty - 6, { font: 'bodyBold', size: 7.5, color: COLORS.white }); x += COLS.qty;
  rightText(doc, 'Unit Price', x, y + 7, COLS.unitPrice - 6, { font: 'bodyBold', size: 7.5, color: COLORS.white }); x += COLS.unitPrice;
  rightText(doc, 'Tax', x, y + 7, COLS.tax - 6, { font: 'bodyBold', size: 7.5, color: COLORS.white }); x += COLS.tax;
  rightText(doc, 'Amount', x, y + 7, COLS.amount - 6, { font: 'bodyBold', size: 7.5, color: COLORS.white });
  return y + h;
}
function drawRow(doc, item, y, index) {
  const h = rowHeight(doc, item);
  if (index % 2) doc.fillColor(COLORS.soft).rect(M, y, TABLE_W, h).fill();
  doc.strokeColor(COLORS.line).lineWidth(0.4).rect(M, y, TABLE_W, h).stroke();
  let x = M;
  text(doc, safeDescription(item.description), x + 6, y + 7, { size: ROW_FONT, width: COLS.description - 12 }); x += COLS.description;
  rightText(doc, formatNumber(item.qty), x, y + 7, COLS.qty - 6, { size: ROW_FONT }); x += COLS.qty;
  rightText(doc, formatMoney(moneyFromInput(item.unitPrice), item.currency), x, y + 7, COLS.unitPrice - 6, { size: ROW_FONT }); x += COLS.unitPrice;
  rightText(doc, `${item.taxRate.toFixed(2)}%`, x, y + 7, COLS.tax - 6, { size: ROW_FONT }); x += COLS.tax;
  rightText(doc, formatMoney(itemTotals(item).total, item.currency), x, y + 7, COLS.amount - 6, { font: 'bodyBold', size: ROW_FONT });
  return y + h;
}
function drawTotals(doc, totals, currency, y) {
  const w = 245, x = A4.width - M - w, h = 86;
  doc.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(0.7).rect(x, y, w, h).fillAndStroke();
  const rows = [['Subtotal', totals.subtotal], ['Discount', -totals.discount], ['Tax', totals.tax]];
  rows.forEach(([label, value], i) => { const yy = y + h - 20 - i * 20; text(doc, label, x + 12, yy, { size: 8.5, color: COLORS.muted }); rightText(doc, formatMoney(value, currency), x + 100, yy, w - 112, { size: 8.5 }); });
  doc.fillColor(COLORS.accent).rect(x, y, w, 26).fill();
  text(doc, 'GRAND TOTAL', x + 12, y + 8, { font: 'bodyBold', size: 8.5, color: COLORS.white });
  rightText(doc, formatMoney(totals.total, currency), x + 100, y + 7, w - 112, { font: 'bodyBold', size: 11, color: COLORS.white });
}
function drawTextBlock(doc, title, value, y, width = CONTENT_W) {
  if (!value) return 0;
  const h = wrapHeight(doc, value, width - 20, 8) + 32;
  doc.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).rect(M, y, width, h).fillAndStroke();
  text(doc, title, M + 10, y + 9, { font: 'bodyBold', size: 8, color: COLORS.accent });
  text(doc, value, M + 10, y + 22, { size: 8, color: COLORS.muted, width: width - 20 });
  return h;
}
function makePages(doc, data) {
  const pages = [];
  let page = { rows: [], height: 0 };
  const rowAvailable = 467;
  for (const item of data.items) {
    const h = rowHeight(doc, item);
    if (page.rows.length && page.height + h > rowAvailable) { pages.push(page); page = { rows: [], height: 0 }; }
    page.rows.push(item); page.height += h;
  }
  pages.push(page);
  const final = pages[pages.length - 1];
  const extras = 14 + 86 + 8 + (data.notes ? wrapHeight(doc, data.notes, CONTENT_W, 8) + 32 + 8 : 0) + (data.terms ? wrapHeight(doc, data.terms, CONTENT_W, 8) + 32 : 0);
  if (final.height + extras > rowAvailable) pages.push({ rows: [], height: 0 });
  return pages;
}

async function renderDocument({ type, doc: input, company }) {
  validateDocument(type, input, company);
  const data = normalizeDocument(type, input, company);
  const totals = computeTotals(data.items);
  const fonts = getFonts();
  const pdf = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, autoFirstPage: false, bufferPages: true, info: { Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${data.number}`, Author: company.name } });
  pdf.registerFont('body', fonts.regular);
  pdf.registerFont('bodyBold', fonts.bold);
  const chunks = [];
  const done = new Promise((resolve, reject) => { pdf.on('data', (c) => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  const pages = makePages(pdf, data);
  pages.forEach((page) => {
    pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } });
    let y = drawHeader(pdf, data);
    y = drawTableHeader(pdf, y) + 3;
    page.rows.forEach((item, i) => { y = drawRow(pdf, item, y, i); });
    if (page === pages[pages.length - 1]) {
      y += 14;
      drawTotals(pdf, totals, data.currency, y);
      y += 94;
      y += drawTextBlock(pdf, 'Notes', data.notes, y) + 8;
      drawTextBlock(pdf, data.type === 'invoice' ? 'Terms & Conditions' : 'Quotation Terms', data.terms, y);
    }
  });
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) drawFooter(pdf, i + 1, range.count, data);
  pdf.end();
  return done;
}

module.exports = { renderDocument };
