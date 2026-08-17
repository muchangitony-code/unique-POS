'use strict';

const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const W = A4.width - M * 2;
const FOOTER_Y = A4.height - M;
const COLORS = { navy: '#123F68', orange: '#F7941D', text: '#172033', muted: '#667085', line: '#D8DEE7', pale: '#F5F7FA', white: '#FFFFFF' };
const COL = { no: 34, description: 245, qty: 48, unit: 92, tax: 50, amount: 86 };
const BODY = 8.5;
const HEAD = 7.5;

function drawText(pdf, value, x, y, width, opts = {}) {
  pdf.font(opts.font || 'body').fontSize(opts.size || BODY).fillColor(opts.color || COLORS.text);
  pdf.text(String(value ?? ''), x, y, { width, align: opts.align || 'left', lineGap: 0, continued: false, ellipsis: Boolean(opts.ellipsis) });
}
function right(pdf, value, x, y, width, opts = {}) { drawText(pdf, value, x, y, width, { ...opts, align: 'right' }); }
function height(pdf, value, width, size = BODY, font = 'body') { pdf.font(font).fontSize(size); return pdf.heightOfString(String(value ?? ''), { width, lineGap: 0 }); }
function safe(value) { return String(value ?? '').replace(/([^\s]{32})(?=[^\s])/g, '$1\u200b'); }

function lineTotal(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function totals(items) {
  return items.reduce((r, item) => {
    const t = lineTotal(item);
    r.subtotal += t.gross;
    r.discount += t.discount;
    r.tax += t.tax;
    r.total += t.total;
    return r;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}
function rowHeight(pdf, item) {
  return Math.max(27, height(pdf, safe(item.description), COL.description - 14, BODY) + 14);
}

async function loadLogo(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:image/svg+xml')) return null;
  try {
    let target = raw;
    if (target.startsWith('/')) {
      const origin = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
      const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
      target = (origin || (domain ? `https://${domain}` : '')) + target;
    }
    if (!/^https?:\/\//i.test(target)) return null;
    const response = await fetch(target, { redirect: 'follow' });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!/^image\/(png|jpeg|jpg)$/.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 && buffer.length <= 2 * 1024 * 1024 ? buffer : null;
  } catch (_) { return null; }
}
function logo(pdf, buffer) {
  const x = M, y = 28, s = 50;
  if (buffer) { try { pdf.image(buffer, x, y, { fit: [s, s], align: 'center', valign: 'center' }); return; } catch (_) {} }
  pdf.save().fillColor(COLORS.orange).roundedRect(x, y, s, s, 7).fill();
  drawText(pdf, 'US', x, y + 15, s, { font: 'bold', size: 15, color: COLORS.white, align: 'center' });
  pdf.restore();
}

function header(pdf, data) {
  pdf.fillColor(COLORS.navy).rect(0, 0, A4.width, 5).fill();
  logo(pdf, data.company.logoBuffer);

  const infoX = M + 62;
  const cardW = 190;
  const cardX = A4.width - M - cardW;
  const infoW = cardX - infoX - 16;
  let nameSize = 13;
  const name = safe(data.company.name || 'Unique Solar Kenya Ltd');
  while (nameSize > 9.5 && height(pdf, name, infoW, nameSize, 'bold') > 30) nameSize -= 0.5;
  drawText(pdf, name, infoX, 29, infoW, { font: 'bold', size: nameSize, color: COLORS.navy });
  let cy = 29 + height(pdf, name, infoW, nameSize, 'bold') + 5;
  const contacts = [data.company.address, [data.company.phone, data.company.email].filter(Boolean).join(' · '), data.company.taxId ? `Tax ID: ${data.company.taxId}` : ''].filter(Boolean);
  for (const value of contacts) {
    const v = safe(value);
    drawText(pdf, v, infoX, cy, infoW, { size: 7.3, color: COLORS.muted });
    cy += height(pdf, v, infoW, 7.3) + 2;
  }

  pdf.fillColor(COLORS.navy).roundedRect(cardX, 20, cardW, 90, 6).fill();
  drawText(pdf, data.type === 'invoice' ? 'INVOICE' : 'QUOTATION', cardX + 14, 31, cardW - 28, { font: 'bold', size: 14, color: COLORS.white });
  drawText(pdf, data.number, cardX + 14, 54, cardW - 28, { font: 'bold', size: 8.5, color: COLORS.white });
  drawText(pdf, `Date: ${data.date}`, cardX + 14, 70, cardW - 28, { size: 7.8, color: COLORS.white });
  drawText(pdf, `${data.type === 'invoice' ? 'Due date' : 'Valid until'}: ${data.type === 'invoice' ? (data.dueDate || '—') : (data.validUntil || '—')}`, cardX + 14, 86, cardW - 28, { size: 7.8, color: COLORS.white });

  return Math.max(122, cy + 8);
}

function customerBox(pdf, data, y) {
  const boxY = y + 12;
  const leftW = W - 116;
  const details = [data.customer.address, data.customer.phone, data.customer.email, data.customer.taxId ? `Tax ID: ${data.customer.taxId}` : ''].filter(Boolean).join(' · ');
  const name = safe(data.customer.name || 'Walk-in Customer');
  const nameH = height(pdf, name, leftW - 24, 10.5, 'bold');
  const detailH = details ? height(pdf, safe(details), leftW - 24, 7.2) : 0;
  const boxH = Math.max(66, 33 + nameH + (details ? detailH + 5 : 0));
  pdf.fillColor(COLORS.pale).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, boxY, W, boxH, 5).fillAndStroke();
  drawText(pdf, 'BILL TO', M + 12, boxY + 9, leftW, { font: 'bold', size: 7.3, color: COLORS.navy });
  drawText(pdf, name, M + 12, boxY + 23, leftW - 24, { font: 'bold', size: 10.5 });
  if (details) drawText(pdf, safe(details), M + 12, boxY + 23 + nameH + 3, leftW - 24, { size: 7.2, color: COLORS.muted });
  const sx = A4.width - M - 92;
  pdf.fillColor(COLORS.white).strokeColor(COLORS.navy).roundedRect(sx, boxY + 18, 76, 22, 11).fillAndStroke();
  drawText(pdf, data.type === 'invoice' ? 'UNPAID' : 'VALID', sx + 4, boxY + 25, 68, { font: 'bold', size: 6.8, color: COLORS.navy, align: 'center' });
  return boxY + boxH + 14;
}

function tableHeader(pdf, y) {
  const h = 25;
  pdf.fillColor(COLORS.navy).rect(M, y, W, h).fill();
  let x = M;
  drawText(pdf, 'No.', x + 6, y + 8, COL.no - 12, { font: 'bold', size: HEAD, color: COLORS.white }); x += COL.no;
  drawText(pdf, 'Description', x + 6, y + 8, COL.description - 12, { font: 'bold', size: HEAD, color: COLORS.white }); x += COL.description;
  right(pdf, 'Qty', x, y + 8, COL.qty - 7, { font: 'bold', size: HEAD, color: COLORS.white }); x += COL.qty;
  right(pdf, 'Unit Price', x, y + 8, COL.unit - 7, { font: 'bold', size: HEAD, color: COLORS.white }); x += COL.unit;
  right(pdf, 'Tax', x, y + 8, COL.tax - 7, { font: 'bold', size: HEAD, color: COLORS.white }); x += COL.tax;
  right(pdf, 'Amount', x, y + 8, COL.amount - 7, { font: 'bold', size: HEAD, color: COLORS.white });
  return y + h;
}
function row(pdf, item, index, y, currency) {
  const h = rowHeight(pdf, item);
  if (index % 2) pdf.fillColor(COLORS.pale).rect(M, y, W, h).fill();
  pdf.strokeColor(COLORS.line).lineWidth(0.45).rect(M, y, W, h).stroke();
  let x = M;
  drawText(pdf, String(index + 1), x + 6, y + 8, COL.no - 12, { size: BODY }); x += COL.no;
  drawText(pdf, safe(item.description), x + 6, y + 8, COL.description - 12, { size: BODY }); x += COL.description;
  right(pdf, formatNumber(item.qty), x, y + 8, COL.qty - 7, { size: BODY }); x += COL.qty;
  right(pdf, formatMoney(moneyFromInput(item.unitPrice), currency), x, y + 8, COL.unit - 7, { size: BODY }); x += COL.unit;
  right(pdf, `${Number(item.taxRate || 0).toFixed(2)}%`, x, y + 8, COL.tax - 7, { size: BODY }); x += COL.tax;
  right(pdf, formatMoney(lineTotal(item).total, currency), x, y + 8, COL.amount - 7, { font: 'bold', size: BODY });
  return y + h;
}

function blockHeight(pdf, value) { return Math.max(44, height(pdf, safe(value), W - 20, 8) + 30); }
function block(pdf, title, value, y) {
  const h = blockHeight(pdf, value);
  pdf.fillColor(COLORS.pale).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, y, W, h, 4).fillAndStroke();
  drawText(pdf, title, M + 10, y + 8, W - 20, { font: 'bold', size: 7.8, color: COLORS.navy });
  drawText(pdf, safe(value), M + 10, y + 21, W - 20, { size: 8, color: COLORS.muted });
  return y + h;
}
function totalsHeight(data) { return 106 + (data.notes ? 8 + blockHeight({ font(){ return this; }, fontSize(){ return this; }, heightOfString(v){ return String(v).length * 4; } }, data.notes) : 0) + (data.terms ? 8 + blockHeight({ font(){ return this; }, fontSize(){ return this; }, heightOfString(v){ return String(v).length * 4; } }, data.terms) : 0); }
function drawTotals(pdf, t, currency, data, y) {
  const w = 255;
  pdf.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(0.7).roundedRect(A4.width - M - w, y, w, 106, 4).fillAndStroke();
  const x = A4.width - M - w;
  [['Subtotal', t.subtotal], ['Discount', -t.discount], ['Tax', t.tax]].forEach(([label, value], i) => {
    const yy = y + 13 + i * 20;
    drawText(pdf, label, x + 12, yy, 105, { size: 8.5, color: COLORS.muted });
    right(pdf, formatMoney(value, currency), x + 105, yy, w - 117, { size: 8.5 });
  });
  const gy = y + 75;
  pdf.fillColor(COLORS.navy).roundedRect(x, gy, w, 31, 4).fill();
  drawText(pdf, 'GRAND TOTAL', x + 12, gy + 9, 105, { font: 'bold', size: 8.5, color: COLORS.white });
  right(pdf, formatMoney(t.total, currency), x + 105, gy + 7, w - 117, { font: 'bold', size: 11, color: COLORS.white });
  let by = y + 114;
  if (data.notes) { by = block(pdf, 'Notes', data.notes, by) + 8; }
  if (data.terms) { by = block(pdf, data.type === 'invoice' ? 'Terms & Conditions' : 'Quotation Terms', data.terms, by); }
  return by;
}
function footer(pdf, page, count, type) {
  const y = FOOTER_Y;
  pdf.strokeColor(COLORS.line).lineWidth(0.6).moveTo(M, y - 8).lineTo(A4.width - M, y - 8).stroke();
  drawText(pdf, type === 'invoice' ? 'Invoice' : 'Quotation', M, y, 120, { size: 7.3, color: COLORS.muted });
  right(pdf, `Page ${page} of ${count}`, A4.width - M - 100, y, 100, { size: 7.3, color: COLORS.muted });
}

function pageMetrics(pdf, data, first) {
  const top = header(pdf, data);
  const start = first ? customerBox(pdf, data, top) : top + 14;
  const tableStart = start;
  const tableHeaderH = 25;
  const bottom = FOOTER_Y - 16;
  return { tableStart, rowCapacity: bottom - tableStart - tableHeaderH, bottom, finalReserve: 12 + 106 + (data.notes ? 8 + blockHeight(pdf, data.notes) : 0) + (data.terms ? 8 + blockHeight(pdf, data.terms) : 0) };
}

async function renderDocument({ type, doc: input, company }) {
  validateDocument(type, input, company);
  const data = normalizeDocument(type, input, company);
  data.company.logoBuffer = Buffer.isBuffer(company.logo) ? company.logo : await loadLogo(company.logoUrl || company.logo_url || company.logo);
  const t = totals(data.items);
  const pdf = new PDFDocument({ size: 'A4', autoFirstPage: false, bufferPages: true, margins: { top: M, right: M, bottom: M, left: M }, info: { Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${data.number}`, Author: data.company.name } });
  registerFonts(pdf);

  // Measure using a temporary PDFKit page. No content is emitted from the probe.
  const probe = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: M, right: M, bottom: M, left: M } });
  registerFonts(probe); probe.addPage();
  const firstMetrics = pageMetrics(probe, data, true);
  const nextMetrics = pageMetrics(probe, data, false);
  const heights = data.items.map(item => rowHeight(probe, item));
  probe.end();

  function paginate(capacity) {
    const pages = [];
    let rows = [], used = 0;
    for (let i = 0; i < data.items.length; i += 1) {
      const h = heights[i];
      if (rows.length && used + h > capacity) { pages.push({ rows, used }); rows = []; used = 0; }
      rows.push(i); used += h;
    }
    if (rows.length || !pages.length) pages.push({ rows, used });
    return pages;
  }
  let pages = paginate(nextMetrics.rowCapacity);
  const finalCapacity = nextMetrics.rowCapacity - firstMetrics.finalReserve;
  if (pages.length === 1 && pages[0].used > finalCapacity) {
    while (pages[0].rows.length > 1 && pages[0].used > finalCapacity) {
      const moved = pages[0].rows.pop();
      pages[0].used -= heights[moved];
      pages.push({ rows: [moved], used: heights[moved] });
    }
  } else if (pages.length > 1 && pages[pages.length - 1].used > finalCapacity) {
    while (pages[pages.length - 1].rows.length > 1 && pages[pages.length - 1].used > finalCapacity) {
      const moved = pages[pages.length - 1].rows.shift();
      pages[pages.length - 1].used -= heights[moved];
      pages[pages.length - 2].rows.push(moved);
      pages[pages.length - 2].used += heights[moved];
    }
  }

  const chunks = [];
  const done = new Promise((resolve, reject) => { pdf.on('data', c => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });
  pages.forEach((page, pageIndex) => {
    pdf.addPage({ size: 'A4', margins: { top: M, right: M, bottom: M, left: M } });
    const metrics = pageIndex === 0 ? pageMetrics(pdf, data, true) : pageMetrics(pdf, data, false);
    let y = tableHeader(pdf, metrics.tableStart);
    page.rows.forEach((index, rowIndex) => { y = row(pdf, data.items[index], index, y, data.currency); });
    if (pageIndex === pages.length - 1) {
      const reserve = metrics.finalReserve;
      const totalsY = Math.min(y + 12, metrics.bottom - reserve);
      drawTotals(pdf, t, data.currency, data, totalsY);
    }
  });
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) footer(pdf, i + 1, range.count, type);
  pdf.end();
  return done;
}

module.exports = { renderDocument };
