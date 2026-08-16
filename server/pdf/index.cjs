'use strict';
const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');
const A4 = { width: 595.28, height: 841.89 }, M = 40, CONTENT_W = A4.width - M * 2, FOOTER_Y = A4.height - 25;
const COLORS = { text: '#111827', muted: '#6B7280', line: '#D1D5DB', soft: '#F8FAFC', accent: '#083D6D', white: '#FFFFFF' };
const COLS = { description: 210, qty: 45, unitPrice: 100, tax: 50, amount: 110 }, TABLE_W = 515, ROW_FONT = 8.5, ROW_AVAILABLE = 467;
function text(pdf, value, x, y, o = {}) { pdf.font(o.font || 'body').fontSize(o.size || 9).fillColor(o.color || COLORS.text).text(String(value ?? ''), x, y, { width: o.width, align: o.align || 'left', lineGap: o.lineGap || 0 }); }
function right(pdf, value, x, y, w, o = {}) { text(pdf, value, x, y, { ...o, width: w, align: 'right' }); }
function wrapHeight(pdf, value, width, size = ROW_FONT) { pdf.font('body').fontSize(size); return pdf.heightOfString(String(value ?? ''), { width, lineGap: 0 }); }
function safeDescription(value) { return String(value ?? '').replace(/([^\s]{30})(?=[^\s])/g, '$1\u200b'); }
function rowHeight(pdf, item) { return Math.max(26, wrapHeight(pdf, safeDescription(item.description), COLS.description - 12) + 12); }
function itemTotals(item) { const gross = mulCents(moneyFromInput(item.unitPrice), item.qty); const discount = moneyFromInput(item.discount || '0'); const net = Math.max(0, gross - discount); const tax = taxCents(net, item.taxRate || 0); return { gross, discount, tax, total: net + tax }; }
function totals(items) { let subtotal = 0, discount = 0, tax = 0, total = 0; for (const item of items) { const t = itemTotals(item); subtotal += t.gross; discount += t.discount; tax += t.tax; total += t.total; } return { subtotal, discount, tax, total }; }
function footer(pdf, n, total, data) { pdf.strokeColor(COLORS.line).lineWidth(0.6).moveTo(M, FOOTER_Y - 5).lineTo(A4.width - M, FOOTER_Y - 5).stroke(); text(pdf, data.type === 'invoice' ? 'Invoice' : 'Quotation', M, FOOTER_Y, { size: 7.5, color: COLORS.muted }); right(pdf, `Page ${n} of ${total}`, A4.width - M - 110, FOOTER_Y, 110, { size: 7.5, color: COLORS.muted }); }
function header(pdf, data) {
  pdf.fillColor(COLORS.accent).rect(0, 0, A4.width, 6).fill();
  if (Buffer.isBuffer(data.company.logo)) { try { pdf.image(data.company.logo, M, M + 4, { fit: [58, 40] }); } catch {} }
  const x = Buffer.isBuffer(data.company.logo) ? M + 68 : M;
  text(pdf, data.company.name, x, M + 5, { font: 'bold', size: 17, color: COLORS.accent, width: 300 });
  if (data.company.address) text(pdf, data.company.address, x, M + 28, { size: 8, color: COLORS.muted, width: 300 });
  const contact = [data.company.phone, data.company.email].filter(Boolean).join(' · '); if (contact) text(pdf, contact, x, M + 41, { size: 8, color: COLORS.muted, width: 300 });
  if (data.company.taxId) text(pdf, `Tax ID: ${data.company.taxId}`, x, M + 54, { size: 8, color: COLORS.muted, width: 300 });
  const cx = A4.width - M - 185; pdf.fillColor(COLORS.accent).roundedRect(cx, M + 2, 185, 76, 4).fill();
  text(pdf, data.type === 'invoice' ? 'INVOICE' : 'QUOTATION', cx + 12, M + 13, { font: 'bold', size: 15, color: COLORS.white }); text(pdf, data.number, cx + 12, M + 33, { size: 9, color: COLORS.white });
  text(pdf, `Date: ${data.date}`, cx + 12, M + 47, { size: 8, color: COLORS.white }); text(pdf, `${data.type === 'invoice' ? 'Due date' : 'Valid until'}: ${data.type === 'invoice' ? data.dueDate || '—' : data.validUntil || '—'}`, cx + 12, M + 60, { size: 8, color: COLORS.white });
  const by = M + 94; pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, by, CONTENT_W, 66, 3).fillAndStroke();
  text(pdf, 'CUSTOMER', M + 10, by + 9, { font: 'bold', size: 7.5, color: COLORS.accent }); text(pdf, data.customer.name, M + 10, by + 23, { font: 'bold', size: 10.5, width: 240 });
  const details = [data.customer.address, data.customer.phone, data.customer.email, data.customer.taxId ? `Tax ID: ${data.customer.taxId}` : ''].filter(Boolean).join(' · '); if (details) text(pdf, details, M + 10, by + 39, { size: 7.5, color: COLORS.muted, width: CONTENT_W - 20 });
  const status = data.type === 'invoice' ? 'UNPAID' : 'VALID'; pdf.fillColor(COLORS.white).strokeColor(COLORS.accent).roundedRect(A4.width - M - 82, by + 9, 70, 20, 10).fillAndStroke(); text(pdf, status, A4.width - M - 78, by + 15, { font: 'bold', size: 7, color: COLORS.accent, width: 62, align: 'center' });
  return by + 80;
}
function tableHeader(pdf, y) {
  const h = 23; pdf.fillColor(COLORS.accent).rect(M, y, TABLE_W, h).fill(); let x = M;
  text(pdf, 'Description', x + 6, y + 7, { font: 'bold', size: 7.5, color: COLORS.white, width: COLS.description - 12 }); x += COLS.description;
  for (const [label, w] of [['Qty', COLS.qty], ['Unit Price', COLS.unitPrice], ['Tax', COLS.tax], ['Amount', COLS.amount]]) { right(pdf, label, x, y + 7, w - 6, { font: 'bold', size: 7.5, color: COLORS.white }); x += w; }
  return y + h;
}
function row(pdf, item, y, i) {
  const h = rowHeight(pdf, item); if (i % 2) pdf.fillColor(COLORS.soft).rect(M, y, TABLE_W, h).fill(); pdf.strokeColor(COLORS.line).lineWidth(0.4).rect(M, y, TABLE_W, h).stroke(); let x = M;
  text(pdf, safeDescription(item.description), x + 6, y + 7, { size: ROW_FONT, width: COLS.description - 12 }); x += COLS.description;
  right(pdf, formatNumber(item.qty), x, y + 7, COLS.qty - 6, { size: ROW_FONT }); x += COLS.qty; right(pdf, formatMoney(moneyFromInput(item.unitPrice), item.currency), x, y + 7, COLS.unitPrice - 6, { size: ROW_FONT }); x += COLS.unitPrice;
  right(pdf, `${item.taxRate.toFixed(2)}%`, x, y + 7, COLS.tax - 6, { size: ROW_FONT }); x += COLS.tax; right(pdf, formatMoney(itemTotals(item).total, item.currency), x, y + 7, COLS.amount - 6, { font: 'bold', size: ROW_FONT }); return y + h;
}
function totalsBlock(pdf, t, currency, y) { const w = 245, x = A4.width - M - w, h = 86; pdf.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(0.7).rect(x, y, w, h).fillAndStroke(); [['Subtotal', t.subtotal], ['Discount', -t.discount], ['Tax', t.tax]].forEach(([label, value], i) => { const yy = y + h - 20 - i * 20; text(pdf, label, x + 12, yy, { size: 8.5, color: COLORS.muted }); right(pdf, formatMoney(value, currency), x + 100, yy, w - 112, { size: 8.5 }); }); pdf.fillColor(COLORS.accent).rect(x, y, w, 26).fill(); text(pdf, 'GRAND TOTAL', x + 12, y + 8, { font: 'bold', size: 8.5, color: COLORS.white }); right(pdf, formatMoney(t.total, currency), x + 100, y + 7, w - 112, { font: 'bold', size: 11, color: COLORS.white }); }
function block(pdf, title, value, y) { if (!value) return 0; const h = wrapHeight(pdf, value, CONTENT_W - 20, 8) + 32; pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).rect(M, y, CONTENT_W, h).fillAndStroke(); text(pdf, title, M + 10, y + 9, { font: 'bold', size: 8, color: COLORS.accent }); text(pdf, value, M + 10, y + 22, { size: 8, color: COLORS.muted, width: CONTENT_W - 20 }); return h; }
function paginate(pdf, data) { const pages = []; let page = { rows: [], height: 0 }; for (const item of data.items) { const h = rowHeight(pdf, item); if (page.rows.length && page.height + h > ROW_AVAILABLE) { pages.push(page); page = { rows: [], height: 0 }; } page.rows.push(item); page.height += h; } pages.push(page); const last = pages[pages.length - 1]; const extras = 14 + 86 + 8 + (data.notes ? wrapHeight(pdf, data.notes, CONTENT_W, 8) + 32 + 8 : 0) + (data.terms ? wrapHeight(pdf, data.terms, CONTENT_W, 8) + 32 : 0); if (last.height + extras > ROW_AVAILABLE) pages.push({ rows: [], height: 0 }); return pages; }

async function renderDocument({ type, doc: input, company }) {
  validateDocument(type, input, company); const data = normalizeDocument(type, input, company); const t = totals(data.items);
  const pdf = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, autoFirstPage: false, bufferPages: true, info: { Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${data.number}`, Author: company.name } });
  registerFonts(pdf);
  const chunks = []; const done = new Promise((resolve, reject) => { pdf.on('data', c => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  const pages = paginate(pdf, data);
  for (const page of pages) { pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } }); let y = tableHeader(pdf, header(pdf, data)) + 3; page.rows.forEach((item, i) => { y = row(pdf, item, y, i); }); if (page === pages[pages.length - 1]) { y += 14; totalsBlock(pdf, t, data.currency, y); y += 94; y += block(pdf, 'Notes', data.notes, y) + 8; block(pdf, data.type === 'invoice' ? 'Terms & Conditions' : 'Quotation Terms', data.terms, y); } }
  const range = pdf.bufferedPageRange(); for (let i = range.start; i < range.start + range.count; i++) footer(pdf, i + 1, range.count, data); pdf.end(); return done;
}
module.exports = { renderDocument };
