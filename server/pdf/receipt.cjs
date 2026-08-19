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
const MAX_LOGO = 2 * 1024 * 1024;
const C = BRAND.colors;

function text(pdf, value, x, y, width, o = {}) { pdf.font(o.font || 'body').fontSize(o.size || FONT).fillColor(o.color || C.ink).text(String(value ?? ''), x, y, { width, align: o.align || 'left', lineGap: o.lineGap || 0 }); }
function measure(pdf, value, width, size = FONT, font = 'body', lineGap = 0) { pdf.font(font).fontSize(size); return pdf.heightOfString(String(value ?? ''), { width, lineGap }); }
function money(value, currency) { return formatMoney(value, currency); }
function lineTotal(item) { const gross = mulCents(moneyFromInput(item.unitPrice), item.qty); const discount = moneyFromInput(item.discount || '0'); const net = Math.max(0, gross - discount); const tax = taxCents(net, item.taxRate || 0); return { gross, discount, tax, total: net + tax }; }
function normalizeItems(data) { return Array.isArray(data.items) ? data.items : []; }
function calculateTotals(items) { return items.reduce((out, item) => { const t = lineTotal(item); out.subtotal += t.gross; out.discount += t.discount; out.tax += t.tax; out.total += t.total; return out; }, { subtotal: 0, discount: 0, tax: 0, total: 0 }); }
function raster(value) { return Buffer.isBuffer(value) && value.length > 4 && ((value[0] === 137 && value[1] === 80 && value[2] === 78 && value[3] === 71) || (value[0] === 255 && value[1] === 216 && value[2] === 255)); }
function svg(value) { const source = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || ''); return /^\s*<svg(?:\s|>)/i.test(source) && Buffer.byteLength(source, 'utf8') <= MAX_LOGO; }
function decodeDataImage(value) { const source = String(value || '').trim(); let match = source.match(/^data:image\/(png|jpe?g);base64,(.+)$/i); if (match) { try { const buffer = Buffer.from(match[2], 'base64'); return raster(buffer) && buffer.length <= MAX_LOGO ? buffer : null; } catch (_) { return null; } } match = source.match(/^data:image\/svg\+xml(?:;charset=[^;]+)?;base64,(.+)$/i); if (match) { try { const buffer = Buffer.from(match[1], 'base64'); return svg(buffer) ? buffer.toString('utf8') : null; } catch (_) { return null; } } return null; }
async function loadLogo(source) {
  if (raster(source) || svg(source)) return source;
  const data = decodeDataImage(source); if (data) return data;
  const raw = String(source || '').trim(); if (!raw) return null;
  if (/^(iVBOR|\/9j\/)/.test(raw)) { try { const buffer = Buffer.from(raw, 'base64'); if (raster(buffer) && buffer.length <= MAX_LOGO) return buffer; } catch (_) {} }
  const files = [];
  if (raw.startsWith('/')) { files.push(path.join(process.cwd(), 'public', raw.slice(1))); files.push(path.join(process.cwd(), raw.slice(1))); }
  else if (!/^https?:\/\//i.test(raw)) { files.push(path.resolve(process.cwd(), raw)); files.push(path.join(process.cwd(), raw)); }
  for (const file of files) { try { const buffer = fs.readFileSync(file); if (buffer.length > MAX_LOGO) continue; if (raster(buffer)) return buffer; if (svg(buffer)) return buffer.toString('utf8'); } catch (_) {} }
  if (!/^https?:\/\//i.test(raw)) return null;
  try { const response = await fetch(raw, { redirect: 'follow' }); if (!response.ok) return null; const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > MAX_LOGO) return null; if (raster(buffer)) return buffer; if (svg(buffer)) return buffer.toString('utf8'); } catch (_) {}
  return null;
}
function companyValue(company, key, fallback) { return String(company?.[key] ?? '').trim() || fallback; }
function logoSource(company) { return String(company?.logoUrl || company?.logo || company?.logoPath || '').trim(); }
function drawThermalLogo(pdf, logo, width, y) {
  if (!logo) throw new Error('Thermal branding logo could not be loaded; refusing to generate an unbranded receipt');
  const size = Math.min(LOGO_SIZE_MAX, width - 20); const x = (width - size) / 2;
  try { if (typeof logo === 'string' && svg(logo)) SVGtoPDF(pdf, logo, x, y, { width: size, height: size, preserveAspectRatio: 'xMidYMid meet' }); else pdf.image(logo, x, y, { fit: [size, size], align: 'center', valign: 'center' }); }
  catch (error) { throw new Error(`Thermal branding logo render failed: ${error?.message || error}`); }
  return y + size + 6;
}
function layout(data, company, paper, probe) {
  const width = WIDTHS[paper] || WIDTHS['80mm']; const inner = width - MARGIN * 2; const logoSize = Math.min(LOGO_SIZE_MAX, width - 20); let y = MARGIN + 8 + logoSize + 6;
  const addCentered = (value, size, font = 'body', gap = 0) => { y += measure(probe, value, inner, size, font) + gap; };
  addCentered(companyValue(company, 'name', BRAND.legalName), 11, 'bold', 2); addCentered(company?.tagline || BRAND.tagline, 7.2, 'bold', 2); addCentered(companyValue(company, 'address', BRAND.address), 7.1, 'body', 2); addCentered(companyValue(company, 'phone', BRAND.phone), 7.1, 'body', 2); addCentered(companyValue(company, 'website', BRAND.website), 7.1, 'body', 2); if (company?.taxId) addCentered(`KRA PIN: ${company.taxId}`, 7.1, 'body', 2);
  y += 8; addCentered('RECEIPT', 12, 'bold', 2); addCentered(`No: ${data.number}`, 8, 'body', 1); addCentered(`Date: ${data.date || '—'}`, 8, 'body', 1); addCentered(`Customer: ${data.customer?.name || 'Walk-in Customer'}`, 8, 'body', 4); y += 7 + 12;
  for (const item of normalizeItems(data)) { const desc = String(item.description || 'Item'); y += Math.max(18, measure(probe, desc, inner * .50, FONT) + 4); }
  y += 7 + 13 * 3 + 34; if (data.notes) y += 4 + measure(probe, data.notes, inner, 7.5) + 5; y += 6 + measure(probe, 'Thank you for your business.', inner, 8, 'bold'); return Math.ceil(y + 24);
}

async function renderReceiptDocument({ doc: data, company, paper = '80mm' }) {
  const width = WIDTHS[paper] || WIDTHS['80mm']; const items = normalizeItems(data); const totals = calculateTotals(items);
  const logo = (await loadLogo(logoSource(company))) || (await loadLogo(BRAND.thermalLogo));
  if (!logo) throw new Error('Thermal branding logo could not be loaded; refusing to generate an unbranded receipt');
  const probe = new PDFDocument({ size: [width, 2000], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }); registerFonts(probe); const height = layout(data, company, paper, probe); probe.end();
  const pdf = new PDFDocument({ size: [width, height], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true, info: { Title: `Receipt ${data.number}`, Author: companyValue(company, 'name', BRAND.legalName) } }); registerFonts(pdf);
  const chunks = []; const result = new Promise((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  let y = MARGIN; const inner = width - MARGIN * 2;
  pdf.fillColor(C.ink).rect(0, 0, width, 3).fill(); pdf.fillColor(C.orange).rect(width * .72, 0, width * .28, 3).fill(); y += 8; y = drawThermalLogo(pdf, logo, width, y);
  const addCentered = (value, size, font = 'body', gap = 0, color = C.ink) => { text(pdf, value, MARGIN, y, inner, { font, size, align: 'center', color }); y += measure(pdf, value, inner, size, font) + gap; };
  addCentered(companyValue(company, 'name', BRAND.legalName), 11, 'bold', 2); addCentered(company?.tagline || BRAND.tagline, 7.2, 'bold', 2, C.orangeDeep); addCentered(companyValue(company, 'address', BRAND.address), 7.1, 'body', 2, C.muted); addCentered(companyValue(company, 'phone', BRAND.phone), 7.1, 'body', 2, C.muted); addCentered(companyValue(company, 'website', BRAND.website), 7.1, 'body', 2, C.muted); if (company?.taxId) addCentered(`KRA PIN: ${company.taxId}`, 7.1, 'body', 2, C.muted);
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
