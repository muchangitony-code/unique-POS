'use strict';

/*
 * AUTHORITATIVE A4 INVOICE / QUOTATION RENDERER
 *
 * Rebuilt from the supplied POS Invoice / Quotation Template.html.
 * This file is the only A4 renderer for invoices and quotations.
 * The HTML sample is a visual specification; live POS data is injected
 * through the existing document adapter/schema.
 */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const W = A4.width - (M * 2);
const FOOTER_Y = A4.height - 31;
const MAX_LOGO = 2 * 1024 * 1024;

// Palette copied from the supplied HTML template.
const C = {
  ink: '#14284A',
  ink2: '#1E3F73',
  paper: '#EEF1F4',
  card: '#FFFFFF',
  line: '#C9D2DE',
  lineSoft: '#E4E9F0',
  muted: '#5C6B85',
  orange: '#EF8A17',
  orangeDeep: '#D9740A',
  orangeSoft: '#FCEBD6',
  danger: '#B3402A',
  white: '#FFFFFF'
};

// The supplied template is a five-column ledger: # / Item / Qty / Unit price / Amount.
const COL = {
  index: 34,
  item: 238,
  qty: 55,
  unit: 105,
  amount: W - 34 - 238 - 55 - 105
};

function text(pdf, value, x, y, options = {}) {
  pdf.font(options.font || 'body')
    .fontSize(options.size || 9)
    .fillColor(options.color || C.ink)
    .text(String(value ?? ''), x, y, {
      width: options.width,
      align: options.align || 'left',
      lineGap: options.lineGap || 0,
      characterSpacing: options.characterSpacing || 0,
      continued: false
    });
}

function right(pdf, value, x, y, width, options = {}) {
  text(pdf, value, x, y, { ...options, width, align: 'right' });
}

function measured(pdf, value, width, size = 9, font = 'body') {
  pdf.font(font).fontSize(size);
  return pdf.heightOfString(String(value ?? ''), { width, lineGap: 0 });
}

function wrap(value) {
  return String(value ?? '').replace(/([^\s]{28})(?=[^\s])/g, '$1\u200b');
}

function imageBuffer(value) {
  return Buffer.isBuffer(value) && value.length > 4 && (
    (value[0] === 137 && value[1] === 80 && value[2] === 78 && value[3] === 71) ||
    (value[0] === 255 && value[1] === 216 && value[2] === 255)
  );
}

function decodeDataImage(value) {
  const match = String(value || '').trim().match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    return buffer.length <= MAX_LOGO && imageBuffer(buffer) ? buffer : null;
  } catch (_) {
    return null;
  }
}

async function loadLogo(source) {
  if (imageBuffer(source)) return source;
  const raw = String(source || '').trim();
  if (!raw) return null;

  const data = decodeDataImage(raw);
  if (data) return data;

  if (/^(iVBOR|\/9j\/)/.test(raw)) {
    try {
      const buffer = Buffer.from(raw, 'base64');
      if (buffer.length <= MAX_LOGO && imageBuffer(buffer)) return buffer;
    } catch (_) {}
  }

  const candidates = [];
  if (raw.startsWith('/')) {
    candidates.push(path.join(process.cwd(), 'public', raw.replace(/^\/+/, '')));
    candidates.push(path.join(process.cwd(), raw.replace(/^\/+/, '')));
  } else if (!/^https?:\/\//i.test(raw)) {
    candidates.push(path.join(process.cwd(), raw));
    candidates.push(path.join(process.cwd(), 'public', raw));
  }

  for (const filename of candidates) {
    try {
      const buffer = fs.readFileSync(filename);
      if (buffer.length <= MAX_LOGO && imageBuffer(buffer)) return buffer;
    } catch (_) {}
  }

  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const response = await fetch(raw, { redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '');
    if (!/^image\/(png|jpe?g)$/i.test(contentType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length <= MAX_LOGO && imageBuffer(buffer) ? buffer : null;
  } catch (_) {
    return null;
  }
}

async function makeQrBuffer(url) {
  const target = String(url || '').trim();
  if (!target) return null;
  try {
    return await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: target,
      scale: 3,
      padding: 0,
      includetext: false
    });
  } catch (_) {
    return null;
  }
}

function drawLogo(pdf, x, y, size, buffer) {
  pdf.save();
  pdf.strokeColor(C.orangeSoft).lineWidth(.7).roundedRect(x, y, size, size, 7).stroke();
  if (buffer) {
    try {
      pdf.image(buffer, x + 4, y + 4, { fit: [size - 8, size - 8], align: 'center', valign: 'center' });
    } catch (_) {}
  }
  pdf.restore();
}

function drawTopBar(pdf) {
  const h = 4.5;
  const segments = [C.ink, C.ink2, C.orange];
  const widths = [W * .45, W * .35, W * .20];
  let x = M;
  segments.forEach((color, i) => {
    pdf.fillColor(color).rect(x, 0, widths[i], h).fill();
    x += widths[i];
  });
}

function displayDate(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])));
}

function lineTotal(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}

function totals(items) {
  return items.reduce((out, item) => {
    const value = lineTotal(item);
    out.subtotal += value.gross;
    out.discount += value.discount;
    out.tax += value.tax;
    out.total += value.total;
    return out;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}

function companyWebsite(doc) {
  return String(doc.company.website || doc.company.websiteUrl || 'https://uniquesolarltd.co.ke/').trim();
}

function drawHeader(pdf, doc) {
  drawTopBar(pdf);

  const top = 34;
  const logoSize = 48; // 64 CSS px at print scale.
  const brandX = M + logoSize + 14;
  const metaW = 178;
  const metaX = A4.width - M - metaW;
  const brandW = Math.max(175, metaX - brandX - 22);
  const accent = doc.type === 'quotation' ? C.orangeDeep : C.ink2;

  drawLogo(pdf, M, top, logoSize, doc.company.logo);

  let brandY = top - 1;
  const companyName = String(doc.company.name || '');
  text(pdf, companyName, brandX, brandY, {
    font: 'bold', size: 14.25, width: brandW
  });
  brandY += Math.max(18, measured(pdf, companyName, brandW, 14.25, 'bold')) + 2;

  const tagline = String(doc.company.tagline || 'Solar Energy & General Supplies');
  text(pdf, tagline, brandX, brandY, {
    font: 'bold', size: 7.8, color: C.orangeDeep, width: brandW, characterSpacing: .65
  });
  brandY += 12;

  const meta = [
    doc.company.address,
    [doc.company.phone, doc.company.email].filter(Boolean).join('  ·  '),
    doc.company.taxId ? `PIN: ${doc.company.taxId}` : ''
  ].filter(Boolean);
  for (const value of meta) {
    text(pdf, value, brandX, brandY, { size: 8.3, color: C.muted, width: brandW });
    brandY += measured(pdf, value, brandW, 8.3) + 2;
  }

  text(pdf, doc.type === 'quotation' ? 'Quotation' : 'Invoice', metaX, top - 2, {
    font: 'bold', size: 20, width: metaW, align: 'right'
  });
  right(pdf, `No. ${doc.number}`, metaX, top + 24, metaW, { size: 9.1, color: C.muted });
  right(pdf, `Issued    ${displayDate(doc.date)}`, metaX, top + 42, metaW, { size: 8.4, color: C.muted });
  right(pdf, `${doc.type === 'quotation' ? 'Valid until' : 'Due'}    ${displayDate(doc.type === 'quotation' ? doc.validUntil : doc.dueDate)}`, metaX, top + 56, metaW, { size: 8.4, color: C.muted });
  if (doc.servedBy) right(pdf, `Served by    ${doc.servedBy}`, metaX, top + 70, metaW, { size: 8.2, color: C.muted });

  const bottom = Math.max(brandY, top + 86) + 17;
  pdf.strokeColor(C.ink).lineWidth(1.1).moveTo(M, bottom).lineTo(A4.width - M, bottom).stroke();

  // Signature element from the supplied template: rotated dashed status stamp.
  pdf.save();
  pdf.translate(A4.width - M + 3, top + 5);
  pdf.rotate(9);
  pdf.strokeColor(accent).lineWidth(1.1).dash(4, { space: 3 });
  pdf.moveTo(-90, 0).lineTo(90, 0).stroke();
  pdf.moveTo(-90, 22).lineTo(90, 22).stroke();
  text(pdf, doc.type === 'quotation' ? 'Quotation' : 'Invoice', -90, 6, {
    font: 'bold', size: 9, color: accent, width: 180, align: 'center', characterSpacing: 1.8
  });
  pdf.restore();

  return bottom + 1;
}

function drawParties(pdf, doc, y) {
  const gap = 24;
  const colW = (W - gap) / 2;
  const leftX = M;
  const rightX = M + colW + gap;

  text(pdf, 'BILLED TO', leftX, y, { font: 'bold', size: 7.4, color: C.muted, width: colW, characterSpacing: .8 });
  text(pdf, doc.customer.name, leftX, y + 16, { font: 'bold', size: 10.6, width: colW });

  let leftY = y + 32;
  for (const value of [
    doc.customer.address,
    doc.customer.phone,
    doc.customer.email,
    doc.customer.taxId ? `PIN: ${doc.customer.taxId}` : ''
  ].filter(Boolean)) {
    text(pdf, value, leftX, leftY, { size: 8.5, color: C.muted, width: colW });
    leftY += measured(pdf, value, colW, 8.5) + 2;
  }

  text(pdf, 'ORDER REFERENCE', rightX, y, { font: 'bold', size: 7.4, color: C.muted, width: colW, characterSpacing: .8 });
  text(pdf, doc.orderReference || '—', rightX, y + 16, { font: 'bold', size: 10.6, width: colW });

  let rightY = y + 32;
  for (const value of [
    doc.channel ? `Channel: ${doc.channel}` : '',
    doc.paymentMethod ? `Payment method: ${doc.paymentMethod}` : '',
    `Status: ${doc.status || (doc.type === 'quotation' ? 'Pending approval' : 'Awaiting payment')}`
  ].filter(Boolean)) {
    text(pdf, value, rightX, rightY, { size: 8.5, color: C.muted, width: colW });
    rightY += measured(pdf, value, colW, 8.5) + 2;
  }

  const bottom = Math.max(leftY, rightY) + 15;
  pdf.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M, bottom).lineTo(A4.width - M, bottom).stroke();
  return bottom + 1;
}

function drawTableHeader(pdf, y) {
  const h = 22;
  const columns = [
    ['#', COL.index, false],
    ['Item', COL.item, false],
    ['Qty', COL.qty, true],
    ['Unit price', COL.unit, true],
    ['Amount', COL.amount, true]
  ];
  let x = M;
  for (const [label, width, numeric] of columns) {
    if (numeric) right(pdf, label, x, y, width, { font: 'bold', size: 7.4, color: C.muted, characterSpacing: .6 });
    else text(pdf, label, x, y, { font: 'bold', size: 7.4, color: C.muted, width, characterSpacing: .6 });
    x += width;
  }
  pdf.strokeColor(C.ink).lineWidth(1).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke();
  return y + h + 1;
}

function itemHeight(pdf, item) {
  const itemW = COL.item - 12;
  const nameH = measured(pdf, wrap(item.description), itemW, 9.1, 'bold');
  const subH = item.sub ? measured(pdf, wrap(item.sub), itemW, 7.8) : 0;
  return Math.max(31, nameH + subH + 15);
}

function drawItem(pdf, item, y, index, currency, last = false) {
  const h = itemHeight(pdf, item);
  let x = M;

  text(pdf, String(index + 1).padStart(2, '0'), x + 4, y + 8, {
    font: 'bold', size: 7.8, color: C.orangeDeep, width: COL.index - 8
  });
  x += COL.index;

  text(pdf, wrap(item.description), x + 4, y + 7, {
    font: 'bold', size: 9.1, width: COL.item - 12
  });
  if (item.sub) text(pdf, wrap(item.sub), x + 4, y + 21, {
    size: 7.8, color: C.muted, width: COL.item - 12
  });
  x += COL.item;

  right(pdf, formatNumber(item.qty), x, y + 8, COL.qty - 7, { size: 8.5 });
  x += COL.qty;
  right(pdf, formatMoney(moneyFromInput(item.unitPrice), currency), x, y + 8, COL.unit - 7, { size: 8.5 });
  x += COL.unit;
  right(pdf, formatMoney(lineTotal(item).total, currency), x, y + 8, COL.amount - 7, { font: 'bold', size: 8.5 });

  pdf.strokeColor(last ? C.ink : C.lineSoft).lineWidth(last ? 1 : .55).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke();
  return y + h;
}

function drawTotals(pdf, doc, values, y) {
  const width = 210;
  const x = A4.width - M - width;
  let cy = y;
  const line = (label, value, color = C.ink) => {
    text(pdf, label, x, cy, { size: 8.4, color: C.muted, width: width - 95 });
    right(pdf, value, x + 90, cy, width - 90, { size: 8.4, color });
    cy += 17;
  };

  line('Subtotal', formatMoney(values.subtotal, doc.currency));
  const taxLabel = `VAT (${doc.items.length ? Math.round((values.tax / Math.max(1, values.subtotal - values.discount)) * 100) : 0}%)`;
  line(taxLabel, formatMoney(values.tax, doc.currency));
  if (values.discount) line('Discount', `- ${formatMoney(values.discount, doc.currency)}`, C.danger);

  const label = doc.type === 'quotation' ? 'Estimated total' : 'Total due';
  pdf.fillColor(C.ink).roundedRect(x, cy + 1, width, 36, 6).fill();
  pdf.fillColor(C.orange).rect(x, cy + 1, 4, 36).fill();
  text(pdf, label, x + 13, cy + 12, { font: 'bold', size: 8.7, color: C.white, width: 95, characterSpacing: .3 });
  right(pdf, formatMoney(values.total, doc.currency), x + 92, cy + 10, width - 105, { font: 'bold', size: 12.5, color: C.white });
  return cy + 39;
}

function drawFooter(pdf, doc, y, qrBuffer) {
  const leftW = 285;
  const gap = 28;
  const rightX = M + leftW + gap;
  const rightW = W - leftW - gap;
  const note = doc.notes || (doc.type === 'quotation'
    ? 'This quotation is valid for 14 days from the issue date. Prices are subject to stock availability at time of order confirmation.'
    : 'Goods once sold are exchangeable within 7 days with receipt. Prices include VAT where applicable. Thank you for shopping with us.');
  const noteText = doc.terms ? `${note}\n${doc.terms}` : note;
  const payment = doc.paymentDetails || {};
  const rows = [
    ['M-Pesa Paybill', payment.paybill],
    ['Till', payment.till],
    ['Account', payment.account],
    ['Bank', payment.bank]
  ].filter(([, value]) => value);

  const leftH = measured(pdf, noteText, leftW, 8.3) + 40;
  const qrH = qrBuffer ? 92 : 0;
  const rightH = 35 + rows.length * 17 + qrH;
  const height = Math.max(leftH, rightH);

  pdf.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M, y).lineTo(A4.width - M, y).stroke();
  text(pdf, 'NOTES & TERMS', M, y + 12, { font: 'bold', size: 7.4, color: C.muted, width: leftW, characterSpacing: .7 });
  text(pdf, noteText, M, y + 27, { size: 8.3, width: leftW, lineGap: 2 });

  text(pdf, 'PAYMENT DETAILS', rightX, y + 12, { font: 'bold', size: 7.4, color: C.muted, width: rightW, characterSpacing: .7 });
  let py = y + 28;
  for (const [label, value] of rows) {
    text(pdf, label, rightX, py, { size: 8.1, color: C.muted, width: rightW * .52 });
    right(pdf, value, rightX + rightW * .48, py, rightW * .52, { size: 8.1 });
    pdf.strokeColor(C.line).lineWidth(.4).dash(2, { space: 2 }).moveTo(rightX, py + 12).lineTo(rightX + rightW, py + 12).stroke();
    pdf.undash();
    py += 17;
  }

  if (qrBuffer) {
    try {
      pdf.image(qrBuffer, rightX, py + 5, { fit: [56, 56] });
    } catch (_) {}
    text(pdf, 'Scan to visit uniquesolarltd.co.ke', rightX + 64, py + 21, { size: 7.1, color: C.muted, width: rightW - 64 });
  }

  return y + height + 13;
}

function drawSignatures(pdf, doc, y) {
  const gap = 24;
  const width = (W - gap) / 2;
  const lineY = y + 30;
  pdf.strokeColor(C.ink).lineWidth(.65).moveTo(M, lineY).lineTo(M + width, lineY).stroke();
  pdf.moveTo(M + width + gap, lineY).lineTo(A4.width - M, lineY).stroke();
  text(pdf, doc.preparedBy ? `Prepared by: ${doc.preparedBy}` : 'Prepared by', M, lineY + 6, { size: 7.5, color: C.muted, width, align: 'center' });
  text(pdf, doc.customerAcknowledgement || 'Customer acknowledgement', M + width + gap, lineY + 6, { size: 7.5, color: C.muted, width, align: 'center' });
  return lineY + 22;
}

function drawPageFooter(pdf, doc, pageNumber, pageCount) {
  pdf.strokeColor(C.lineSoft).lineWidth(.6).moveTo(M, FOOTER_Y - 9).lineTo(A4.width - M, FOOTER_Y - 9).stroke();
  text(pdf, 'Generated by Uniques Solar & General Supplies POS  ·  uniquesolarltd.co.ke', M, FOOTER_Y, { size: 6.8, color: C.muted, width: W - 110 });
  right(pdf, `Page ${pageNumber} of ${pageCount}`, A4.width - M - 90, FOOTER_Y, 90, { size: 6.8, color: C.muted });
}

function estimateRowsPerPage(pdf, doc, firstTableY, reserve) {
  const capacity = FOOTER_Y - firstTableY - reserve;
  const pages = [];
  let current = [];
  let used = 0;
  for (const item of doc.items) {
    const h = itemHeight(pdf, item);
    if (current.length && used + h > capacity) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += h;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

async function renderDocument({ type, doc: input, company }) {
  if (!company || typeof company !== 'object') throw new Error('company: must be an object');

  const logoSource = company.logo || company.logoUrl || company.logo_url || company.logoPath || company.logo_path || '';
  const logo = await loadLogo(logoSource);
  const normalizedCompany = { ...company, logo };
  validateDocument(type, input, normalizedCompany);
  const doc = normalizeDocument(type, input, normalizedCompany);
  doc.company.tagline = String(company.tagline || company.brandTagline || 'Solar Energy & General Supplies');
  doc.company.website = String(company.website || company.websiteUrl || company.website_url || 'https://uniquesolarltd.co.ke/');

  const calculated = totals(doc.items);
  const qrBuffer = await makeQrBuffer(companyWebsite(doc));

  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: M, left: M, right: M },
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${doc.number}`,
      Author: doc.company.name
    }
  });
  registerFonts(pdf);

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.once('end', () => resolve(Buffer.concat(chunks)));
    pdf.once('error', reject);
  });

  // Probe the exact template geometry before writing real pages.
  const probe = new PDFDocument({ size: 'A4' });
  registerFonts(probe);
  const headerY = drawHeader(probe, doc);
  const partiesY = drawParties(probe, doc, headerY + 18);
  const tableY = drawTableHeader(probe, partiesY + 18) + 1;
  const pages = estimateRowsPerPage(probe, doc, tableY, 190);
  probe.end();

  pages.forEach((rows, pageIndex) => {
    pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } });
    const currentHeader = drawHeader(pdf, doc);
    const currentParties = drawParties(pdf, doc, currentHeader + 18);
    let y = drawTableHeader(pdf, currentParties + 18) + 1;

    rows.forEach((item, rowIndex) => {
      y = drawItem(pdf, item, y, doc.items.indexOf(item), doc.currency, rowIndex === rows.length - 1);
    });

    if (pageIndex === pages.length - 1) {
      y += 18;
      y = drawTotals(pdf, doc, calculated, y) + 15;
      y = drawFooter(pdf, doc, y, qrBuffer) + 8;
      drawSignatures(pdf, doc, Math.min(y, FOOTER_Y - 57));
    }
  });

  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    pdf.switchToPage(i);
    drawPageFooter(pdf, doc, i + 1, range.count);
  }

  pdf.end();
  return done;
}

async function renderPdfBuffer(payload, paper = 'a4') {
  const adapted = adaptDocumentPayload(payload, paper);
  if (adapted.type !== 'invoice' && adapted.type !== 'quotation') {
    throw new Error(`Unsupported PDF document type: ${adapted.type}`);
  }
  return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company });
}

module.exports = { renderDocument, renderPdfBuffer };
