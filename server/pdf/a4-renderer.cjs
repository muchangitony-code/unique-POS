'use strict';

/* Authoritative A4 invoice / quotation renderer. */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('@leduard/svg-to-pdfkit');
const bwipjs = require('bwip-js');
const BRAND = require('../document-branding.cjs');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const W = A4.width - M * 2;
const FOOTER_Y = A4.height - 31;
const MAX_LOGO = 2 * 1024 * 1024;
const ROW_MAX_NAME_LINES = 8;
const C = BRAND.colors;
const COL = {
  index: 34,
  item: 238,
  qty: 55,
  unit: 105,
  amount: W - 34 - 238 - 55 - 105
};

function text(pdf, value, x, y, o = {}) {
  pdf.font(o.font || 'body').fontSize(o.size || 9).fillColor(o.color || C.ink).text(String(value ?? ''), x, y, {
    width: o.width, align: o.align || 'left', lineGap: o.lineGap || 0, characterSpacing: o.characterSpacing || 0, continued: false
  });
}
function right(pdf, value, x, y, width, o = {}) { text(pdf, value, x, y, { ...o, width, align: 'right' }); }
function measured(pdf, value, width, size = 9, font = 'body', lineGap = 0) { pdf.font(font).fontSize(size); return pdf.heightOfString(String(value ?? ''), { width, lineGap }); }
function splitLongToken(token, maxChars = 28) { const out = []; let rest = String(token || ''); while (rest.length > maxChars) { out.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); } if (rest) out.push(rest); return out.length ? out : ['']; }
function wrapLines(pdf, value, width, size, font) {
  const source = String(value ?? '').replace(/\s+/g, ' ').trim(); if (!source) return [''];
  const tokens = source.split(' ').flatMap((token) => splitLongToken(token)); const lines = []; let line = ''; pdf.font(font).fontSize(size);
  for (const token of tokens) { const candidate = line ? `${line} ${token}` : token; if (!line || pdf.widthOfString(candidate) <= width) line = candidate; else { lines.push(line); line = token; } }
  if (line) lines.push(line); return lines;
}
function raster(value) { return Buffer.isBuffer(value) && value.length > 4 && ((value[0] === 137 && value[1] === 80 && value[2] === 78 && value[3] === 71) || (value[0] === 255 && value[1] === 216 && value[2] === 255)); }
function svg(value) { const source = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || ''); return /^\s*<svg(?:\s|>)/i.test(source) && Buffer.byteLength(source, 'utf8') <= MAX_LOGO; }
function decodeDataImage(value) {
  const source = String(value || '').trim(); let match = source.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (match) { try { const buffer = Buffer.from(match[2], 'base64'); return raster(buffer) && buffer.length <= MAX_LOGO ? buffer : null; } catch (_) { return null; } }
  match = source.match(/^data:image\/svg\+xml(?:;charset=[^;]+)?;base64,(.+)$/i);
  if (match) { try { const buffer = Buffer.from(match[1], 'base64'); return svg(buffer) ? buffer.toString('utf8') : null; } catch (_) { return null; } }
  return null;
}
async function loadLogo(source) {
  if (raster(source) || svg(source)) return source; const data = decodeDataImage(source); if (data) return data; const raw = String(source || '').trim(); if (!raw) return null;
  if (/^(iVBOR|\/9j\/)/.test(raw)) { try { const buffer = Buffer.from(raw, 'base64'); if (raster(buffer) && buffer.length <= MAX_LOGO) return buffer; } catch (_) {} }
  const files = [];
  if (raw.startsWith('/')) { files.push(path.join(process.cwd(), 'public', raw.slice(1))); files.push(path.join(process.cwd(), raw.slice(1))); }
  else if (!/^https?:\/\//i.test(raw)) { files.push(path.resolve(process.cwd(), raw)); files.push(path.join(process.cwd(), 'public', raw)); }
  for (const file of files) { try { const buffer = fs.readFileSync(file); if (buffer.length > MAX_LOGO) continue; if (raster(buffer)) return buffer; if (svg(buffer)) return buffer.toString('utf8'); } catch (_) {} }
  if (!/^https?:\/\//i.test(raw)) return null;
  try { const response = await fetch(raw, { redirect: 'follow' }); if (!response.ok) return null; const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > MAX_LOGO) return null; if (raster(buffer)) return buffer; if (svg(buffer)) return buffer.toString('utf8'); } catch (_) {}
  return null;
}
function drawLogo(pdf, x, y, size, logo) {
  if (!logo) throw new Error('Branding logo missing at render time'); pdf.save(); pdf.strokeColor(C.orangeSoft).lineWidth(.7).roundedRect(x, y, size, size, 7).stroke();
  try { if (typeof logo === 'string' && svg(logo)) SVGtoPDF(pdf, logo, x + 3, y + 3, { width: size - 6, height: size - 6, preserveAspectRatio: 'xMidYMid meet' }); else pdf.image(logo, x + 3, y + 3, { fit: [size - 6, size - 6], align: 'center', valign: 'center' }); }
  catch (error) { pdf.restore(); throw new Error(`Branding logo render failed: ${error?.message || error}`); } pdf.restore();
}
function drawTopBar(pdf) { const h = 4.5; const widths = [W * .45, W * .35, W * .20]; let x = M; [C.ink, C.ink2, C.orange].forEach((color, index) => { pdf.fillColor(color).rect(x, 0, widths[index], h).fill(); x += widths[index]; }); }
function displayDate(value) { if (!value) return '—'; const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return String(value); return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))); }
function lineTotal(item) { const gross = mulCents(moneyFromInput(item.unitPrice), item.qty); const discount = moneyFromInput(item.discount || '0'); const net = Math.max(0, gross - discount); const tax = taxCents(net, item.taxRate || 0); return { gross, discount, tax, total: net + tax }; }
function totals(items) { return items.reduce((out, item) => { const value = lineTotal(item); out.subtotal += value.gross; out.discount += value.discount; out.tax += value.tax; out.total += value.total; return out; }, { subtotal: 0, discount: 0, tax: 0, total: 0 }); }

function drawHeader(pdf, doc, logo) {
  drawTopBar(pdf); const top = 34, logoSize = 48, brandX = M + logoSize + 14, metaW = 178, metaX = A4.width - M - metaW, brandW = Math.max(170, metaX - brandX - 22); drawLogo(pdf, M, top, logoSize, logo);
  let brandY = top - 1; const name = String(doc.company.name || BRAND.legalName); text(pdf, name, brandX, brandY, { font: 'bold', size: 14.25, width: brandW }); brandY += Math.max(18, measured(pdf, name, brandW, 14.25, 'bold')) + 2;
  text(pdf, doc.company.tagline || BRAND.tagline, brandX, brandY, { font: 'bold', size: 7.8, color: C.orangeDeep, width: brandW, characterSpacing: .65 }); brandY += 12;
  for (const value of [doc.company.website || BRAND.website, doc.company.address || BRAND.address, doc.company.phone || BRAND.phone, doc.company.email ? `Email: ${doc.company.email}` : '', doc.company.taxId ? `PIN: ${doc.company.taxId}` : ''].filter(Boolean)) { text(pdf, value, brandX, brandY, { size: 8.05, color: C.muted, width: brandW }); brandY += measured(pdf, value, brandW, 8.05) + 1.5; }
  text(pdf, doc.type === 'quotation' ? 'Quotation' : 'Invoice', metaX, top - 2, { font: 'bold', size: 20, width: metaW, align: 'right' }); right(pdf, `No. ${doc.number}`, metaX, top + 24, metaW, { size: 9.1, color: C.muted }); right(pdf, `Issued    ${displayDate(doc.date)}`, metaX, top + 42, metaW, { size: 8.4, color: C.muted }); right(pdf, `${doc.type === 'quotation' ? 'Valid until' : 'Due'}    ${displayDate(doc.type === 'quotation' ? doc.validUntil : doc.dueDate)}`, metaX, top + 56, metaW, { size: 8.4, color: C.muted }); if (doc.servedBy) right(pdf, `Served by    ${doc.servedBy}`, metaX, top + 70, metaW, { size: 8.2, color: C.muted });
  const bottom = Math.max(brandY, top + 86) + 15; pdf.strokeColor(C.ink).lineWidth(1.1).moveTo(M, bottom).lineTo(A4.width - M, bottom).stroke(); return bottom + 1;
}
function drawParties(pdf, doc, y) {
  const gap = 24, colW = (W - gap) / 2, leftX = M, rightX = M + colW + gap;
  text(pdf, 'BILLED TO', leftX, y, { font: 'bold', size: 7.4, color: C.muted, width: colW }); text(pdf, doc.customer.name, leftX, y + 16, { font: 'bold', size: 10.6, width: colW }); let leftY = y + 16 + measured(pdf, doc.customer.name, colW, 10.6, 'bold') + 4;
  for (const value of [doc.customer.address, doc.customer.phone, doc.customer.email, doc.customer.taxId ? `PIN: ${doc.customer.taxId}` : ''].filter(Boolean)) { text(pdf, value, leftX, leftY, { size: 8.5, color: C.muted, width: colW }); leftY += measured(pdf, value, colW, 8.5) + 2; }
  text(pdf, 'ORDER REFERENCE', rightX, y, { font: 'bold', size: 7.4, color: C.muted, width: colW }); const ref = doc.orderReference || '—'; text(pdf, ref, rightX, y + 16, { font: 'bold', size: 10.6, width: colW }); let rightY = y + 16 + measured(pdf, ref, colW, 10.6, 'bold') + 4;
  for (const value of [doc.channel ? `Channel: ${doc.channel}` : '', doc.paymentMethod ? `Payment method: ${doc.paymentMethod}` : '', `Status: ${doc.status || (doc.type === 'quotation' ? 'Pending approval' : 'Awaiting payment')}`].filter(Boolean)) { text(pdf, value, rightX, rightY, { size: 8.5, color: C.muted, width: colW }); rightY += measured(pdf, value, colW, 8.5) + 2; }
  const bottom = Math.max(leftY, rightY) + 12; pdf.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M, bottom).lineTo(A4.width - M, bottom).stroke(); return bottom + 1;
}
function drawTableHeader(pdf, y) { const h = 22; let x = M; for (const [label, width, numeric] of [['#', COL.index, false], ['Item', COL.item, false], ['Qty', COL.qty, true], ['Unit price', COL.unit, true], ['Amount', COL.amount, true]]) { if (numeric) right(pdf, label, x, y, width, { font: 'bold', size: 7.4, color: C.muted }); else text(pdf, label, x, y, { font: 'bold', size: 7.4, color: C.muted, width }); x += width; } pdf.strokeColor(C.ink).lineWidth(1).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke(); return y + h + 1; }
function itemLines(pdf, item) { const width = COL.item - 12; return { name: wrapLines(pdf, item.description, width, 9.1, 'bold'), sub: item.sub ? wrapLines(pdf, item.sub, width, 7.8, 'body') : [] }; }
function itemHeight(pdf, item) { const lines = itemLines(pdf, item); const name = lines.name.join('\n'); const sub = lines.sub.join('\n'); const nameH = measured(pdf, name, COL.item - 12, 9.1, 'bold'); const subH = sub ? measured(pdf, sub, COL.item - 12, 7.8) : 0; return Math.max(31, nameH + (subH ? subH + 2 : 0) + 15); }
function splitItemRows(pdf, item, index) {
  const lines = itemLines(pdf, item); if (lines.name.length <= ROW_MAX_NAME_LINES && lines.sub.length <= 3) return [{ item, index, continuation: false, height: itemHeight(pdf, item) }];
  const chunks = []; for (let i = 0; i < lines.name.length; i += ROW_MAX_NAME_LINES) chunks.push({ name: lines.name.slice(i, i + ROW_MAX_NAME_LINES), sub: [] });
  if (lines.sub.length) { let remaining = lines.sub.slice(); for (let i = chunks.length - 1; i >= 0 && remaining.length; i -= 1) { const room = Math.max(0, 3 - chunks[i].name.length); if (room) chunks[i].sub = remaining.splice(0, room); } while (remaining.length) chunks.push({ name: [], sub: remaining.splice(0, 3) }); }
  return chunks.map((chunk, part) => { const segment = { ...item, description: chunk.name.join('\n'), sub: chunk.sub.join('\n') }; return { item: segment, index, continuation: part > 0, height: itemHeight(pdf, segment) }; });
}
function drawItem(pdf, row, y, currency, last = false) {
  const item = row.item, h = row.height; let x = M;
  if (!row.continuation) text(pdf, String(row.index + 1).padStart(2, '0'), x + 4, y + 8, { font: 'bold', size: 7.8, color: C.orangeDeep, width: COL.index - 8 });
  x += COL.index; const lines = itemLines(pdf, item); const name = lines.name.join('\n'); const sub = lines.sub.join('\n'); text(pdf, name, x + 4, y + 7, { font: 'bold', size: 9.1, width: COL.item - 12 });
  if (sub) { const nameH = measured(pdf, name, COL.item - 12, 9.1, 'bold'); text(pdf, sub, x + 4, y + 7 + nameH + 2, { size: 7.8, color: C.muted, width: COL.item - 12 }); }
  x += COL.item;
  if (!row.continuation) { right(pdf, formatNumber(item.qty), x, y + 8, COL.qty - 7, { size: 8.5 }); x += COL.qty; right(pdf, formatMoney(moneyFromInput(item.unitPrice), currency), x, y + 8, COL.unit - 7, { size: 8.5 }); x += COL.unit; right(pdf, formatMoney(lineTotal(item).total, currency), x, y + 8, COL.amount - 7, { font: 'bold', size: 8.5 }); }
  pdf.strokeColor(last ? C.ink : C.lineSoft).lineWidth(last ? 1 : .55).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke(); return y + h;
}
function finalNote(doc) { if (doc.terms) return `${doc.notes || ''}\n${doc.terms}`.trim(); return doc.notes || (doc.type === 'quotation' ? 'This quotation is valid for 14 days from the issue date. Prices are subject to stock availability at time of order confirmation.' : 'Goods once sold are exchangeable within 7 days with receipt. Prices include VAT where applicable. Thank you for shopping with us.'); }
function drawTotals(pdf, doc, values, y) { const width = 210, x = A4.width - M - width; let cy = y; const line = (label, value, color = C.ink) => { text(pdf, label, x, cy, { size: 8.4, color: C.muted, width: width - 95 }); right(pdf, value, x + 90, cy, width - 90, { size: 8.4, color }); cy += 17; }; line('Subtotal', formatMoney(values.subtotal, doc.currency)); const taxBase = Math.max(1, values.subtotal - values.discount); line(`VAT (${doc.items.length ? Math.round((values.tax / taxBase) * 100) : 0}%)`, formatMoney(values.tax, doc.currency)); if (values.discount) line('Discount', `- ${formatMoney(values.discount, doc.currency)}`, C.danger); const label = doc.type === 'quotation' ? 'Estimated total' : 'Total due'; pdf.fillColor(C.ink).roundedRect(x, cy + 1, width, 36, 6).fill(); pdf.fillColor(C.orange).rect(x, cy + 1, 4, 36).fill(); text(pdf, label, x + 13, cy + 12, { font: 'bold', size: 8.7, color: C.white, width: 95 }); right(pdf, formatMoney(values.total, doc.currency), x + 92, cy + 10, width - 105, { font: 'bold', size: 12.5, color: C.white }); return cy + 39; }
function drawFooter(pdf, doc, y, qr) {
  const leftW = 285, gap = 28, rightX = M + leftW + gap, rightW = W - leftW - gap, note = finalNote(doc), p = doc.paymentDetails || {};
  const rows = [['M-Pesa Paybill', p.paybill], ['Till', p.till], ['Account', p.account], ['Bank', p.bank]].filter(([, value]) => value);
  const leftH = measured(pdf, note, leftW, 8.3, 'body', 2) + 40, rightH = 35 + rows.length * 17 + (qr ? 70 : 0), height = Math.max(leftH, rightH);
  pdf.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M, y).lineTo(A4.width - M, y).stroke(); text(pdf, 'NOTES & TERMS', M, y + 12, { font: 'bold', size: 7.4, color: C.muted, width: leftW }); text(pdf, note, M, y + 27, { size: 8.3, width: leftW, lineGap: 2 });
  text(pdf, 'PAYMENT DETAILS', rightX, y + 12, { font: 'bold', size: 7.4, color: C.muted, width: rightW }); let py = y + 28; for (const [label, value] of rows) { text(pdf, label, rightX, py, { size: 8.1, color: C.muted, width: rightW * .52 }); right(pdf, value, rightX + rightW * .48, py, rightW * .52, { size: 8.1 }); py += 17; }
  if (qr) { pdf.image(qr, rightX, py + 5, { fit: [56, 56] }); text(pdf, 'Scan to visit uniquesolarltd.co.ke', rightX + 64, py + 21, { size: 7.1, color: C.muted, width: rightW - 64 }); }
  return y + height + 13;
}
function drawSignatures(pdf, doc, y) { const gap = 24, width = (W - gap) / 2, lineY = y + 30; pdf.strokeColor(C.ink).lineWidth(.65).moveTo(M, lineY).lineTo(M + width, lineY).stroke(); pdf.moveTo(M + width + gap, lineY).lineTo(A4.width - M, lineY).stroke(); text(pdf, doc.preparedBy ? `Prepared by: ${doc.preparedBy}` : 'Prepared by', M, lineY + 6, { size: 7.5, color: C.muted, width, align: 'center' }); text(pdf, doc.customerAcknowledgement || 'Customer acknowledgement', M + width + gap, lineY + 6, { size: 7.5, color: C.muted, width, align: 'center' }); return lineY + 22; }
function drawPageFooter(pdf, page, count) { pdf.strokeColor(C.lineSoft).lineWidth(.6).moveTo(M, FOOTER_Y - 9).lineTo(A4.width - M, FOOTER_Y - 9).stroke(); text(pdf, `${BRAND.legalName}  ·  ${BRAND.website.replace(/^https?:\/\//, '')}`, M, FOOTER_Y, { size: 6.8, color: C.muted, width: W - 110 }); right(pdf, `Page ${page} of ${count}`, A4.width - M - 90, FOOTER_Y, 90, { size: 6.8, color: C.muted }); }
function drawContinuationHeader(pdf, doc, logo) { drawTopBar(pdf); drawLogo(pdf, M, 20, 30, logo); text(pdf, doc.type === 'quotation' ? 'Quotation' : 'Invoice', M + 40, 24, { font: 'bold', size: 12, width: 180 }); right(pdf, `No. ${doc.number}`, A4.width - M - 180, 25, 180, { size: 8.2, color: C.muted }); pdf.strokeColor(C.line).lineWidth(.8).moveTo(M, 57).lineTo(A4.width - M, 57).stroke(); }
function takeRows(rows, capacity, leaveOne = false) { const out = []; let used = 0; for (const row of rows) { if (out.length && used + row.height > capacity) break; out.push(row); used += row.height; } if (leaveOne && out.length === rows.length && rows.length > 1) out.pop(); if (!out.length && rows.length) out.push(rows[0]); return out; }
function sumRows(rows) { return rows.reduce((sum, row) => sum + row.height, 0); }
async function makeQrBuffer(url) { try { return await bwipjs.toBuffer({ bcid: 'qrcode', text: String(url || ''), scale: 3, padding: 0, includetext: false }); } catch (_) { return null; } }
function measureFinalBlock(probe, doc, calculated, qr) { let y = 18; y = drawTotals(probe, doc, calculated, y) + 15; y = drawFooter(probe, doc, y, qr) + 8; y = drawSignatures(probe, doc, y); return y + 10; }

async function renderDocument({ type, doc: input, company }) {
  if (!company || typeof company !== 'object') throw new Error('company: must be an object');
  const requested = company.logo || company.logoUrl || company.logo_url || company.logoPath || company.logo_path || BRAND.logo;
  const logo = (await loadLogo(requested)) || (await loadLogo(BRAND.logo));
  if (!logo) throw new Error('Branding logo could not be loaded; refusing to generate an unbranded customer document');
  const normalizedCompany = { ...company, logo }; validateDocument(type, input, normalizedCompany); const doc = normalizeDocument(type, input, normalizedCompany); const calculated = totals(doc.items); const qr = await makeQrBuffer(BRAND.website);
  const probe = new PDFDocument({ size: 'A4' }); registerFonts(probe); const headerY = drawHeader(probe, doc, logo); const partiesY = drawParties(probe, doc, headerY + 16); const tableY = drawTableHeader(probe, partiesY + 16) + 1; const finalReserve = measureFinalBlock(probe, doc, calculated, qr); const rows = doc.items.flatMap((item, index) => splitItemRows(probe, item, index)); probe.end();
  const firstOpen = FOOTER_Y - tableY - 12, firstFinal = firstOpen - finalReserve, contTableY = 79, contOpen = FOOTER_Y - contTableY - 12, contFinal = contOpen - finalReserve;
  if (firstFinal <= 0 || contFinal <= 0) throw new Error('PDF layout cannot fit the totals, notes, payment details and signatures on A4');
  const pages = []; let remaining = rows.slice();
  if (sumRows(remaining) <= firstFinal) { pages.push({ kind: 'first-final', rows: remaining }); remaining = []; }
  else {
    const first = takeRows(remaining, firstOpen, true); pages.push({ kind: 'first', rows: first }); remaining = remaining.slice(first.length);
    while (remaining.length) { if (sumRows(remaining) <= contFinal) { pages.push({ kind: 'continuation-final', rows: remaining }); remaining = []; break; } const chunk = takeRows(remaining, contOpen, true); if (chunk.length === remaining.length && remaining.length === 1) throw new Error('A single invoice/quotation line is too tall to fit beside the final totals block'); pages.push({ kind: 'continuation', rows: chunk }); remaining = remaining.slice(chunk.length); }
  }
  if (!pages.length || !pages[pages.length - 1].kind.endsWith('final')) throw new Error('PDF pagination failed to allocate a final page');

  const pdf = new PDFDocument({ size: 'A4', autoFirstPage: false, bufferPages: true, margins: { top: M, bottom: M, left: M, right: M }, info: { Title: `${type === 'quotation' ? 'Quotation' : 'Invoice'} ${doc.number}`, Author: BRAND.legalName } }); registerFonts(pdf);
  const chunks = []; const done = new Promise((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  pages.forEach((page) => {
    pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } }); let y;
    if (page.kind === 'first' || page.kind === 'first-final') { y = drawHeader(pdf, doc, logo); y = drawParties(pdf, doc, y + 16); y = drawTableHeader(pdf, y + 16) + 1; }
    else { drawContinuationHeader(pdf, doc, logo); y = drawTableHeader(pdf, contTableY) + 1; }
    page.rows.forEach((row, index) => { y = drawItem(pdf, row, y, doc.currency, index === page.rows.length - 1); });
    if (page.kind.endsWith('final')) { y += 18; y = drawTotals(pdf, doc, calculated, y) + 15; y = drawFooter(pdf, doc, y, qr) + 8; y = drawSignatures(pdf, doc, y); if (y > FOOTER_Y - 10) throw new Error(`PDF final block exceeded the safe A4 footer boundary (${Math.ceil(y)} > ${Math.floor(FOOTER_Y - 10)})`); }
  });
  const range = pdf.bufferedPageRange(); for (let i = range.start; i < range.start + range.count; i += 1) { pdf.switchToPage(i); drawPageFooter(pdf, i + 1, range.count); }
  pdf.end(); return done;
}

async function renderPdfBuffer(payload, paper = 'a4') { const adapted = adaptDocumentPayload(payload, paper); if (adapted.type !== 'invoice' && adapted.type !== 'quotation') throw new Error(`Unsupported PDF document type: ${adapted.type}`); return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company }); }
module.exports = { renderDocument, renderPdfBuffer, loadLogo };
