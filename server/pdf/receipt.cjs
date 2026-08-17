'use strict';

const PDFDocument = require('pdfkit');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const WIDTHS = { '80mm': 226.77, '58mm': 164.41 };
const MARGIN = 10;
const FONT = 8.5;

function text(pdf, value, x, y, width, options = {}) {
  pdf.font(options.font || 'body').fontSize(options.size || FONT).fillColor('#111827').text(String(value ?? ''), x, y, { width, align: options.align || 'left', lineGap: 0 });
}
function money(value, currency) { return formatMoney(value, currency); }
function lineTotal(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}

async function renderReceiptDocument({ doc: data, company, paper = '80mm' }) {
  const width = WIDTHS[paper] || WIDTHS['80mm'];
  const items = Array.isArray(data.items) ? data.items : [];
  const totals = items.reduce((out, item) => { const t = lineTotal(item); out.subtotal += t.gross; out.discount += t.discount; out.tax += t.tax; out.total += t.total; return out; }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
  const pdf = new PDFDocument({ size: [width, 700], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true, info: { Title: `Receipt ${data.number}`, Author: company.name || 'Unique Solar Kenya Ltd' } });
  registerFonts(pdf);
  const chunks = [];
  const result = new Promise((resolve, reject) => { pdf.on('data', c => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  let y = MARGIN;
  const inner = width - MARGIN * 2;
  pdf.fillColor('#0B4778').rect(0, 0, width, 4).fill(); y += 8;
  text(pdf, company.name || 'Unique Solar Kenya Ltd', MARGIN, y, inner, { font: 'bold', size: 12, align: 'center' }); y += 18;
  if (company.address) { text(pdf, company.address, MARGIN, y, inner, { size: 7.5, align: 'center' }); y += 12; }
  if (company.phone) { text(pdf, company.phone, MARGIN, y, inner, { size: 7.5, align: 'center' }); y += 12; }
  if (company.taxId) { text(pdf, `KRA PIN: ${company.taxId}`, MARGIN, y, inner, { size: 7.5, align: 'center' }); y += 12; }
  pdf.strokeColor('#CBD5E1').moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 8;
  text(pdf, 'RECEIPT', MARGIN, y, inner, { font: 'bold', size: 13, align: 'center' }); y += 18;
  text(pdf, `No: ${data.number}`, MARGIN, y, inner, { size: 8 }); y += 11;
  text(pdf, `Date: ${data.date || '—'}`, MARGIN, y, inner, { size: 8 }); y += 11;
  text(pdf, `Customer: ${data.customer?.name || 'Walk-in Customer'}`, MARGIN, y, inner, { size: 8 }); y += 15;
  pdf.strokeColor('#CBD5E1').moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7;
  text(pdf, 'ITEM', MARGIN, y, inner * 0.50, { font: 'bold', size: 7 });
  text(pdf, 'QTY', MARGIN + inner * 0.50, y, inner * 0.14, { font: 'bold', size: 7, align: 'right' });
  text(pdf, 'AMOUNT', MARGIN + inner * 0.64, y, inner * 0.36, { font: 'bold', size: 7, align: 'right' }); y += 12;
  for (const item of items) {
    const total = lineTotal(item).total;
    const desc = String(item.description || 'Item');
    const h = Math.max(18, pdf.heightOfString(desc, { width: inner * 0.50, font: 'body', fontSize: FONT }) + 4);
    text(pdf, desc, MARGIN, y, inner * 0.50, { size: FONT });
    text(pdf, formatNumber(item.qty), MARGIN + inner * 0.50, y, inner * 0.14, { size: FONT, align: 'right' });
    text(pdf, money(total, data.currency), MARGIN + inner * 0.64, y, inner * 0.36, { size: FONT, align: 'right' });
    y += h;
  }
  pdf.strokeColor('#CBD5E1').moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7;
  const rows = [['Subtotal', totals.subtotal], ['Discount', -totals.discount], ['VAT', totals.tax], ['TOTAL', totals.total]];
  for (const [label, value] of rows) { text(pdf, label, MARGIN, y, inner * 0.50, { font: label === 'TOTAL' ? 'bold' : 'body', size: label === 'TOTAL' ? 10 : FONT }); text(pdf, money(value, data.currency), MARGIN + inner * 0.50, y, inner * 0.50, { font: label === 'TOTAL' ? 'bold' : 'body', size: label === 'TOTAL' ? 10 : FONT, align: 'right' }); y += label === 'TOTAL' ? 17 : 13; }
  if (data.notes) { y += 4; text(pdf, data.notes, MARGIN, y, inner, { size: 7.5 }); y += pdf.heightOfString(data.notes, { width: inner, font: 'body', fontSize: 7.5 }) + 5; }
  y += 6; text(pdf, 'Thank you for your business.', MARGIN, y, inner, { font: 'bold', size: 8, align: 'center' });
  pdf.end();
  return result;
}

module.exports = { renderReceiptDocument };
