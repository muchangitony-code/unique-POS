'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('@leduard/svg-to-pdfkit');
const BRAND = require('../document-branding.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const WIDTHS = { '80mm': 226.77, '58mm': 164.41 };
const MARGIN = 10;
const FONT = 8.5;
const LOGO_SIZE_MAX = 82;
const C = BRAND.colors;
const LOGO_PATH = path.join(process.cwd(), 'public', BRAND.thermalLogo.replace(/^\/+/, ''));

function text(pdf, value, x, y, width, o = {}) {
  pdf.font(o.font || 'body').fontSize(o.size || FONT).fillColor(o.color || C.ink).text(String(value ?? ''), x, y, { width, align: o.align || 'left', lineGap: o.lineGap || 0 });
}
function measure(pdf, value, width, size = FONT, font = 'body', lineGap = 0) { pdf.font(font).fontSize(size); return pdf.heightOfString(String(value ?? ''), { width, lineGap }); }
function money(value, currency) { return formatMoney(value, currency); }
function lineTotal(item) { const gross = mulCents(moneyFromInput(item.unitPrice), item.qty); const discount = moneyFromInput(item.discount || '0'); const net = Math.max(0, gross - discount); const tax = taxCents(net, item.taxRate || 0); return { gross, discount, tax, total: net + tax }; }
function loadThermalLogo() { try { const svg = fs.readFileSync(LOGO_PATH, 'utf8'); if (/^\s*<svg(?:\s|>)/i.test(svg)) return svg; } catch (error) { console.warn('[receipt] Branding logo could not be loaded:', error?.message || error); } return null; }
function drawThermalLogo(pdf, svg, width, y) { if (!svg) throw new Error('Thermal branding logo could not be loaded'); const size = Math.min(LOGO_SIZE_MAX, width - 20); const x = (width - size) / 2; try { SVGtoPDF(pdf, svg, x, y, { width: size, height: size, preserveAspectRatio: 'xMidYMid meet' }); } catch (error) { throw new Error(`Thermal branding logo render failed: ${error?.message || error}`); } return y + size + 6; }
function normalizeItems(data) { return Array.isArray(data.items) ? data.items : []; }
function calculateTotals(items) { return items.reduce((out, item) => { const t = lineTotal(item); out.subtotal += t.gross; out.discount += t.discount; out.tax += t.tax; out.total += t.total; return out; }, { subtotal: 0, discount: 0, tax: 0, total: 0 }); }
function layout(data, company, paper, probe) {
  const width = WIDTHS[paper] || WIDTHS['80mm']; const inner = width - MARGIN * 2; const logoSize = Math.min(LOGO_SIZE_MAX, width - 20); let y = MARGIN + 8 + logoSize + 6;
  const addCentered = (value, size, font = 'body', gap = 0) => { y += measure(probe, value, inner, size, font) + gap; };
  addCentered(BRAND.legalName, 11, 'bold', 2); addCentered(BRAND.tagline, 7.2, 'bold', 2); addCentered(BRAND.address, 7.1, 'body', 2); addCentered(BRAND.phone, 7.1, 'body', 2); addCentered(BRAND.website, 7.1, 'body', 2); if (company?.taxId) addCentered(`KRA PIN: ${company.taxId}`, 7.1, 'body', 2);
  y += 8; addCentered('RECEIPT', 12, 'bold', 2); addCentered(`No: ${data.number}`, 8, 'body', 1); addCentered(`Date: ${data.date || '—'}`, 8, 'body', 1); addCentered(`Customer: ${data.customer?.name || 'Walk-in Customer'}`, 8, 'body', 4); y += 7 + 12;
  for (const item of normalizeItems(data)) { const desc = String(item.description || 'Item'); y += Math.max(18, measure(probe, desc, inner * .50, FONT) + 4); }
  y += 7 + 13 * 3 + 34; if (data.notes) y += 4 + measure(probe, data.notes, inner, 7.5) + 5; y += 6 + measure(probe, 'Thank you for your business.', inner, 8, 'bold'); return Math.ceil(y + 24);
}

async function renderReceiptDocument({ doc: data, company, paper = '80mm' }) {
  const width = WIDTHS[paper] || WIDTHS['80mm']; const items = normalizeItems(data); const totals = calculateTotals(items);
  const probe = new PDFDocument({ size: [width, 2000], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }); registerFonts(probe); const height = layout(data, company, paper, probe); probe.end();
  const logo = loadThermalLogo(); if (!logo) throw new Error('Thermal branding logo could not be loaded; refusing to generate an unbranded receipt');
  const pdf = new PDFDocument({ size: [width, height], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true, info: { Title: `Receipt ${data.number}`, Author: BRAND.legalName } }); registerFonts(pdf);
  const chunks = []; const result = new Promise((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  let y = MARGIN; const inner = width - MARGIN * 2; const logoSize = Math.min(LOGO_SIZE_MAX, width - 20);
  pdf.fillColor(C.ink).rect(0, 0, width, 3).fill(); pdf.fillColor(C.orange).rect(width * .72, 0, width * .28, 3).fill(); y += 8; y = drawThermalLogo(pdf, logo, width, y);
  const addCentered = (value, size, font = 'body', gap = 0, color = C.ink) => { text(pdf, value, MARGIN, y, inner, { font, size, align: 'center', color }); y += measure(pdf, value, inner, size, font) + gap; };
  addCentered(BRAND.legalName, 11, 'bold', 2); addCentered(BRAND.tagline, 7.2, 'bold', 2, C.orangeDeep); addCentered(BRAND.address, 7.1, 'body', 2, C.muted); addCentered(BRAND.phone, 7.1, 'body', 2, C.muted); addCentered(BRAND.website, 7.1, 'body', 2, C.muted); if (company?.taxId) addCentered(`KRA PIN: ${company.taxId}`, 7.1, 'body', 2, C.muted);
  pdf.strokeColor(C.line).lineWidth(.7).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 8; addCentered('RECEIPT', 12, 'bold', 2); addCentered(`No: ${data.number}`, 8, 'body', 1); addCentered(`Date: ${data.date || '—'}`, 8, 'body', 1); addCentered(`Customer: ${data.customer?.name || 'Walk-in Customer'}`, 8, 'body', 4);
  pdf.strokeColor(C.line).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7;
  text(pdf, 'ITEM', MARGIN, y, inner * .50, { font: 'bold', size: 7, color: C.muted }); text(pdf, 'QTY', MARGIN + inner * .50, y, inner * .14, { font: 'bold', size: 7, color: C.muted, align: 'right' }); text(pdf, 'AMOUNT', MARGIN + inner * .64, y, inner * .36, { font: 'bold', size: 7, color: C.muted, align: 'right' }); y += 12;
  for (const item of items) { const total = lineTotal(item).total; const desc = String(item.description || 'Item'); const h = Math.max(18, measure(pdf, desc, inner * .50, FONT) + 4); text(pdf, desc, MARGIN, y, inner * .50, { size: FONT }); text(pdf, formatNumber(item.qty), MARGIN + inner * .50, y, inner * .14, { size: FONT, align: 'right' }); text(pdf, money(total, data.currency), MARGIN + inner * .64, y, inner * .36, { size: FONT, align: 'right' }); y += h; }
  pdf.strokeColor(C.line).moveTo(MARGIN, y).lineTo(width - MARGIN, y).stroke(); y += 7; for (const [label, value] of [['Subtotal', totals.subtotal], ['Discount', -totals.discount], ['VAT', totals.tax]]) { text(pdf, label, MARGIN, y, inner * .50, { size: FONT, color: C.muted }); text(pdf, money(value, data.currency), MARGIN + inner * .50, y, inner * .50, { size: FONT, align: 'right' }); y += 13; }
  pdf.fillColor(C.ink).roundedRect(MARGIN, y + 1, inner, 25, 3).fill(); pdf.fillColor(C.orange).rect(MARGIN, y + 1, 4, 25).fill(); text(pdf, 'TOTAL', MARGIN + 9, y + 8, inner * .40, { font: 'bold', size: 9.5, color: C.white }); text(pdf, money(totals.total, data.currency), MARGIN + inner * .40, y + 7, inner * .60 - 9, { font: 'bold', size: 10.5, color: C.white, align: 'right' }); y += 34;
  if (data.notes) { y += 4; text(pdf, data.notes, MARGIN, y, inner, { size: 7.5, color: C.muted }); y += measure(pdf, data.notes, inner, 7.5) + 5; }
  y += 6; addCentered('Thank you for your business.', 8, 'bold', 0, C.ink);
  if (y > height - 8) throw new Error(`Thermal receipt layout exceeded its calculated height (${Math.ceil(y)} > ${Math.floor(height - 8)})`);
  pdf.end(); return result;
}

module.exports = { renderReceiptDocument };
