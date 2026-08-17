'use strict';

const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const FOOTER_Y = PAGE.height - 28;
const CONTENT_W = PAGE.width - MARGIN * 2;
const COLORS = { navy: '#0B4778', orange: '#F7941D', text: '#172033', muted: '#667085', line: '#D9E1EA', soft: '#F6F8FB', white: '#FFFFFF' };
const COL = { description: 220, qty: 48, unit: 100, tax: 55, amount: 92 };
const TABLE_W = Object.values(COL).reduce((a, b) => a + b, 0);
const BODY_FONT = 8.5;

function put(pdf, value, x, y, options = {}) {
  pdf.font(options.font || 'body').fontSize(options.size || 9).fillColor(options.color || COLORS.text).text(String(value ?? ''), x, y, {
    width: options.width,
    align: options.align || 'left',
    lineGap: options.lineGap || 0,
    continued: false
  });
}
function right(pdf, value, x, y, width, options = {}) { put(pdf, value, x, y, { ...options, width, align: 'right' }); }
function textHeight(pdf, value, width, size = BODY_FONT, font = 'body') {
  pdf.font(font).fontSize(size);
  return pdf.heightOfString(String(value ?? ''), { width, lineGap: 0 });
}
function safeText(value) { return String(value ?? '').replace(/([^\s]{30})(?=[^\s])/g, '$1\u200b'); }
function lineTotals(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function documentTotals(items) {
  return items.reduce((out, item) => {
    const t = lineTotals(item);
    out.subtotal += t.gross;
    out.discount += t.discount;
    out.tax += t.tax;
    out.total += t.total;
    return out;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}
function rowHeight(pdf, item) {
  return Math.max(28, textHeight(pdf, safeText(item.description), COL.description - 14, BODY_FONT) + 14);
}

function drawFallbackLogo(pdf, x, y, size = 58) {
  const s = size / 58;
  pdf.save();
  pdf.fillColor(COLORS.orange).roundedRect(x, y, size, size, 8).fill();
  put(pdf, 'US', x, y + size * 0.28, { font: 'bold', size: 17 * s, color: COLORS.white, width: size, align: 'center' });
  pdf.restore();
}

async function loadLogoBuffer(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:image/svg+xml')) return null;
  try {
    let target = raw;
    if (target.startsWith('/')) {
      const origin = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
      if (!origin) return null;
      target = origin + target;
    }
    if (!/^https?:\/\//i.test(target)) return null;
    const response = await fetch(target, { redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!/^image\/(png|jpeg|jpg)$/i.test(contentType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length && buffer.length <= 2 * 1024 * 1024 ? buffer : null;
  } catch (_error) {
    return null;
  }
}

function drawLogo(pdf, company, x, y, size) {
  if (Buffer.isBuffer(company.logo)) {
    try { pdf.image(company.logo, x, y, { fit: [size, size], align: 'center', valign: 'center' }); return; } catch (_error) {}
  }
  drawFallbackLogo(pdf, x, y, size);
}

function drawFooter(pdf, pageNo, pageCount, type) {
  pdf.strokeColor(COLORS.line).lineWidth(0.6).moveTo(MARGIN, FOOTER_Y - 7).lineTo(PAGE.width - MARGIN, FOOTER_Y - 7).stroke();
  put(pdf, type === 'invoice' ? 'Invoice' : 'Quotation', MARGIN, FOOTER_Y, { size: 7.5, color: COLORS.muted });
  right(pdf, `Page ${pageNo} of ${pageCount}`, PAGE.width - MARGIN - 110, FOOTER_Y, 110, { size: 7.5, color: COLORS.muted });
}

function drawHeader(pdf, data) {
  const top = 18;
  pdf.fillColor(COLORS.navy).rect(0, 0, PAGE.width, 5).fill();
  drawLogo(pdf, data.company, MARGIN, top + 4, 58);

  const brandX = MARGIN + 70;
  const cardW = 182;
  const cardX = PAGE.width - MARGIN - cardW;
  const brandW = cardX - brandX - 14;
  const name = data.company.name || 'Unique Solar Kenya Ltd';
  const nameSize = name.length > 38 ? 10.5 : name.length > 31 ? 11.5 : 13;
  put(pdf, name, brandX, top + 5, { font: 'bold', size: nameSize, color: COLORS.navy, width: brandW });
  const nameH = textHeight(pdf, name, brandW, nameSize, 'bold');
  let contactY = top + 7 + nameH;
  if (data.company.address) { put(pdf, data.company.address, brandX, contactY, { size: 7.5, color: COLORS.muted, width: brandW }); contactY += 12; }
  const contact = [data.company.phone, data.company.email].filter(Boolean).join('  ·  ');
  if (contact) { put(pdf, contact, brandX, contactY, { size: 7.5, color: COLORS.muted, width: brandW }); contactY += 12; }
  if (data.company.taxId) put(pdf, `Tax ID: ${data.company.taxId}`, brandX, contactY, { size: 7.5, color: COLORS.muted, width: brandW });

  pdf.fillColor(COLORS.navy).roundedRect(cardX, top, cardW, 76, 5).fill();
  put(pdf, data.type === 'invoice' ? 'INVOICE' : 'QUOTATION', cardX + 12, top + 10, { font: 'bold', size: 14, color: COLORS.white, width: cardW - 24 });
  put(pdf, data.number, cardX + 12, top + 32, { size: 8.5, color: COLORS.white, width: cardW - 24 });
  put(pdf, `Date: ${data.date}`, cardX + 12, top + 46, { size: 8, color: COLORS.white, width: cardW - 24 });
  put(pdf, `${data.type === 'invoice' ? 'Due date' : 'Valid until'}: ${data.type === 'invoice' ? (data.dueDate || '—') : (data.validUntil || '—')}`, cardX + 12, top + 59, { size: 8, color: COLORS.white, width: cardW - 24 });

  const customerY = 100;
  const customerH = 62;
  pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(MARGIN, customerY, CONTENT_W, customerH, 5).fillAndStroke();
  put(pdf, 'CUSTOMER', MARGIN + 12, customerY + 9, { font: 'bold', size: 7.5, color: COLORS.navy });
  put(pdf, data.customer.name, MARGIN + 12, customerY + 23, { font: 'bold', size: 10.5, width: 300 });
  const details = [data.customer.address, data.customer.phone, data.customer.email, data.customer.taxId ? `Tax ID: ${data.customer.taxId}` : ''].filter(Boolean).join('  ·  ');
  if (details) put(pdf, details, MARGIN + 12, customerY + 40, { size: 7.3, color: COLORS.muted, width: CONTENT_W - 105 });
  const status = data.type === 'invoice' ? 'UNPAID' : 'VALID';
  pdf.fillColor(COLORS.white).strokeColor(COLORS.navy).roundedRect(PAGE.width - MARGIN - 78, customerY + 20, 66, 20, 10).fillAndStroke();
  put(pdf, status, PAGE.width - MARGIN - 74, customerY + 26, { font: 'bold', size: 6.8, color: COLORS.navy, width: 58, align: 'center' });
  return customerY + customerH + 10;
}

function drawTableHeader(pdf, y) {
  const h = 24;
  pdf.fillColor(COLORS.navy).rect(MARGIN, y, TABLE_W, h).fill();
  let x = MARGIN;
  put(pdf, 'Description', x + 7, y + 7, { font: 'bold', size: 7.5, color: COLORS.white, width: COL.description - 14 }); x += COL.description;
  for (const [label, width] of [['Qty', COL.qty], ['Unit Price', COL.unit], ['Tax', COL.tax], ['Amount', COL.amount]]) {
    right(pdf, label, x, y + 7, width - 7, { font: 'bold', size: 7.5, color: COLORS.white }); x += width;
  }
  return y + h;
}
function drawRow(pdf, item, y, index) {
  const h = rowHeight(pdf, item);
  if (index % 2) pdf.fillColor(COLORS.soft).rect(MARGIN, y, TABLE_W, h).fill();
  pdf.strokeColor(COLORS.line).lineWidth(0.4).rect(MARGIN, y, TABLE_W, h).stroke();
  let x = MARGIN;
  put(pdf, safeText(item.description), x + 7, y + 7, { size: BODY_FONT, width: COL.description - 14 }); x += COL.description;
  right(pdf, formatNumber(item.qty), x, y + 7, COL.qty - 7, { size: BODY_FONT }); x += COL.qty;
  right(pdf, formatMoney(moneyFromInput(item.unitPrice), item.currency), x, y + 7, COL.unit - 7, { size: BODY_FONT }); x += COL.unit;
  right(pdf, `${Number(item.taxRate || 0).toFixed(2)}%`, x, y + 7, COL.tax - 7, { size: BODY_FONT }); x += COL.tax;
  right(pdf, formatMoney(lineTotals(item).total, item.currency), x, y + 7, COL.amount - 7, { font: 'bold', size: BODY_FONT });
  return y + h;
}

function totalsHeight(data) {
  const notes = data.notes ? Math.max(42, textHeightDummy(data.notes, CONTENT_W - 20) + 31) : 0;
  const terms = data.terms ? Math.max(42, textHeightDummy(data.terms, CONTENT_W - 20) + 31) : 0;
  return 104 + (data.notes ? 8 + notes : 0) + (data.terms ? 8 + terms : 0);
}
function textHeightDummy(value, width) { return String(value ?? '').length / 85 * 8; }
function drawTotals(pdf, totals, currency, y) {
  const w = 250;
  const h = 104;
  const x = PAGE.width - MARGIN - w;
  pdf.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(0.7).roundedRect(x, y, w, h, 4).fillAndStroke();
  [['Subtotal', totals.subtotal], ['Discount', -totals.discount], ['Tax', totals.tax]].forEach(([label, value], index) => {
    const yy = y + 13 + index * 20;
    put(pdf, label, x + 12, yy, { size: 8.5, color: COLORS.muted });
    right(pdf, formatMoney(value, currency), x + 105, yy, w - 117, { size: 8.5 });
  });
  pdf.fillColor(COLORS.navy).roundedRect(x, y + h - 31, w, 31, 4).fill();
  put(pdf, 'GRAND TOTAL', x + 12, y + h - 22, { font: 'bold', size: 8.5, color: COLORS.white });
  right(pdf, formatMoney(totals.total, currency), x + 105, y + h - 24, w - 117, { font: 'bold', size: 11, color: COLORS.white });
  return h;
}
function drawBlock(pdf, title, value, y) {
  if (!value) return 0;
  const h = Math.max(42, textHeight(pdf, value, CONTENT_W - 20, 8) + 31);
  pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(MARGIN, y, CONTENT_W, h, 4).fillAndStroke();
  put(pdf, title, MARGIN + 10, y + 8, { font: 'bold', size: 8, color: COLORS.navy });
  put(pdf, value, MARGIN + 10, y + 21, { size: 8, color: COLORS.muted, width: CONTENT_W - 20 });
  return h;
}

function paginate(pdf, data) {
  const contentTop = 188;
  const contentBottom = FOOTER_Y - 18;
  const rowCapacity = contentBottom - contentTop;
  const pages = [];
  let current = { rows: [], height: 0 };
  for (const item of data.items) {
    const h = rowHeight(pdf, item);
    if (current.rows.length && current.height + h > rowCapacity) {
      pages.push(current);
      current = { rows: [], height: 0 };
    }
    current.rows.push(item);
    current.height += h;
  }
  if (current.rows.length || !pages.length) pages.push(current);
  return pages;
}

async function renderDocument({ type, doc: input, company }) {
  validateDocument(type, input, company);
  const data = normalizeDocument(type, input, company);
  const totals = documentTotals(data.items);
  data.company.logoUrl = company.logoUrl || company.logo_url || '';
  data.company.logoBuffer = await loadLogoBuffer(data.company.logoUrl);

  const pdf = new PDFDocument({ size: 'A4', autoFirstPage: false, bufferPages: true, margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }, info: { Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${data.number}`, Author: data.company.name } });
  registerFonts(pdf);
  const chunks = [];
  const result = new Promise((resolve, reject) => { pdf.on('data', (chunk) => chunks.push(chunk)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });

  const pages = paginate(pdf, data);
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    pdf.addPage({ size: 'A4', margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } });
    let y = drawTableHeader(pdf, drawHeader(pdf, data)) + 4;
    page.rows.forEach((item, index) => { y = drawRow(pdf, item, y, index); });

    if (pageIndex === pages.length - 1) {
      const reserve = totalsHeight(data) + 12;
      if (y + reserve > FOOTER_Y - 18) {
        pdf.addPage({ size: 'A4', margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } });
        y = drawTableHeader(pdf, drawHeader(pdf, data)) + 4;
      }
      y += 12;
      y = Math.min(y, FOOTER_Y - 18 - totalsHeight(data));
      y += drawTotals(pdf, totals, data.currency, y) + 8;
      if (data.notes) y += drawBlock(pdf, 'Notes', data.notes, y) + 8;
      if (data.terms) drawBlock(pdf, data.type === 'invoice' ? 'Terms & Conditions' : 'Quotation Terms', data.terms, y);
    }
  }

  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) drawFooter(pdf, i + 1, range.count, data.type);
  pdf.end();
  return result;
}

module.exports = { renderDocument };
