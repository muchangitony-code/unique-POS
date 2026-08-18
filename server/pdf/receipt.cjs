'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('@leduard/svg-to-pdfkit');
const BRAND = require('../branding.config.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const WIDTHS = { '80mm': 226.77, '58mm': 164.41 };
const MARGIN = 10;
const FONT = 8.5;
const C = BRAND.colors;
const LOGO_PATH = path.join(process.cwd(), 'public', BRAND.thermalLogo.replace(/^\/+/, ''));

function text(pdf, value, x, y, width, options = {}) {
  pdf.font(options.font || 'body').fontSize(options.size || FONT).fillColor(options.color || C.ink).text(String(value ?? ''), x, y, { width, align: options.align || 'left', lineGap: 0 });
}
function money(value, currency) { return formatMoney(value, currency); }
function lineTotal(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function loadThermalLogo() {
  try {
    const svg = fs.readFileSync(LOGO_PATH, 'utf8');
    if (/^\s*<svg(?:\s|>)/i.test(svg)) return svg;
  } catch (error) {
    console.warn('[receipt] Branding logo could not be loaded:', error?.message || error);
  }
  return null;
}
function drawThermalLogo(pdf, svg, width, y) {
  if (!svg) return y;
  try {
    const size = Math.min(82, width - 20);
    const x = (width - size) / 2;
    SVGtoPDF(pdf, svg, x, y, { width: size, height: size, preserveAspectRatio: 'xMidYMid meet' });
    return y + size + 6;
  } catch (error) {
    console.warn('[receipt] Branding logo render failed:', error?.message || error);
    return y;
  }
}

async function renderReceiptDocument({ doc: data, company, paper = '80mm' }) {
  const width = WIDTHS[paper] || WIDTHS['80mm'];
  const items = Array.isArray(data.items) ? data.items : [];
  const totals = items.reduce((out, item) => { const t = lineTotal(item); out.subtotal += t.gross; out.discount += t.discount; out.tax += t.tax; out.total += t.total; return out; }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
  const pdf = new PDFDocument({ size: [width, 700], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true, info: { Title: `Receipt ${data.number}`, Author: BRAND.legalName } });
  registerFonts(pdf);
  const chunks = [];
  const result = new Promise((resolve, reject) => { pdf.on('data', c => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  let y = MARGIN;
  const inner = width - MARGIN * 2;

  // Brand accent and monochrome thermal-safe logo.
  pdf.fillColor(C.ink).rect(0, 0, width, 3).fill();
  pdf.fillColor(C.orange).rect(width * 0.72, 0, width * 0.28, 3).fill();
  y += 8;
  y = drawThermalLogo(pdf, loadThermalLogo(), width, y);

  // Customer-facing identity is canonical and not taken from stale company settings.
  text(pdf, BRAND.legalName, MARGIN, y, inner, { font: 'bold', size: 11, align: 'center', color: C.ink }); y += 16;
  text(pdf, BRAND.tagline, MARGIN, y, inner, { font: 'bold', size: 7.2, align: 'center', color: C.orangeDeep }); y += 11;
  text(pdf, BRAND.address, MARGIN, y, inner, { size: 7.1, align: 'center', color: C.muted }); y += 10;
  text(pdf, BRAND.phone, MARGIN, y, inner, { size: 7.1, align: 'center', color: C.muted }); y += 10;
  text(pdf, BRAND.website, MARGIN, y, inner, { size: 7.1, align: 'center', color: C.muted }); y += 12;
  if (company?.taxId) { text(pdf, `KRA PIN: ${company.taxId}`, MARGIN, y, inner, { size: 7.1, align: 'center', color: C.muted }); y += 10; }

  pdf.strokeColor(C.line).lineWidth(.7).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 8;
  text(pdf, 'RECEIPT', MARGIN, y, inner, { font: 'bold', size: 12, align: 'center', color: C.ink }); y += 17;
  text(pdf, `No: ${data.number}`, MARGIN, y, inner, { size: 8, color: C.ink }); y += 11;
  text(pdf, `Date: ${data.date || '—'}`, MARGIN, y, inner, { size: 8, color: C.ink }); y += 11;
  text(pdf, `Customer: ${data.customer?.name || 'Walk-in Customer'}`, MARGIN, y, inner, { size: 8, color: C.ink }); y += 15;
  pdf.strokeColor(C.line).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7;

  text(pdf, 'ITEM', MARGIN, y, inner * 0.50, { font: 'bold', size: 7, color: C.muted });
  text(pdf, 'QTY', MARGIN + inner * 0.50, y, inner * 0.14, { font: 'bold', size: 7, color: C.muted, align: 'right' });
  text(pdf, 'AMOUNT', MARGIN + inner * 0.64, y, inner * 0.36, { font: 'bold', size: 7, color: C.muted, align: 'right' }); y += 12;
  for (const item of items) {
    const total = lineTotal(item).total;
    const desc = String(item.description || 'Item');
    const h = Math.max(18, pdf.heightOfString(desc, { width: inner * 0.50, font: 'body', fontSize: FONT }) + 4);
    text(pdf, desc, MARGIN, y, inner * 0.50, { size: FONT, color: C.ink });
    text(pdf, formatNumber(item.qty), MARGIN + inner * 0.50, y, inner * 0.14, { size: FONT, color: C.ink, align: 'right' });
    text(pdf, money(total, data.currency), MARGIN + inner * 0.64, y, inner * 0.36, { size: FONT, color: C.ink, align: 'right' });
    y += h;
  }

  pdf.strokeColor(C.line).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7;
  const rows = [['Subtotal', totals.subtotal], ['Discount', -totals.discount], ['VAT', totals.tax]];
  for (const [label, value] of rows) { text(pdf, label, MARGIN, y, inner * 0.50, { font: 'body', size: FONT, color: C.muted }); text(pdf, money(value, data.currency), MARGIN + inner * 0.50, y, inner * 0.50, { font: 'body', size: FONT, color: C.ink, align: 'right' }); y += 13; }

  // Orange total rule is the thermal-safe on-brand accent.
  pdf.fillColor(C.ink).roundedRect(MARGIN, y + 1, inner, 25, 3).fill();
  pdf.fillColor(C.orange).rect(MARGIN, y + 1, 4, 25).fill();
  text(pdf, 'TOTAL', MARGIN + 9, y + 8, inner * 0.40, { font: 'bold', size: 9.5, color: C.white });
  text(pdf, money(totals.total, data.currency), MARGIN + inner * 0.40, y + 7, inner * 0.60 - 9, { font: 'bold', size: 10.5, color: C.white, align: 'right' });
  y += 34;

  if (data.notes) { y += 4; text(pdf, data.notes, MARGIN, y, inner, { size: 7.5, color: C.muted }); y += pdf.heightOfString(data.notes, { width: inner, font: 'body', fontSize: 7.5 }) + 5; }
  y += 6; text(pdf, 'Thank you for your business.', MARGIN, y, inner, { font: 'bold', size: 8, align: 'center', color: C.ink });
  pdf.end();
  return result;
}

module.exports = { renderReceiptDocument };
