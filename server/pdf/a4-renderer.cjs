'use strict';

/*
 * AUTHORITATIVE INVOICE / QUOTATION A4 TEMPLATE
 *
 * This renderer is intentionally rebuilt from the supplied
 * "POS Invoice / Quotation Template.html". The old A4 renderer is not used.
 * Both document types share one layout; only document labels, status and
 * quotation/invoice-specific dates/notes change.
 */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const W = A4.width - M * 2;
const FOOTER_Y = A4.height - 30;
const MAX_LOGO = 2 * 1024 * 1024;

// Exact palette from the supplied HTML template.
const C = {
  ink: '#16213A',
  paper: '#EEF1ED',
  card: '#FFFFFF',
  line: '#CBD2C8',
  lineSoft: '#E3E7E1',
  muted: '#6B7280',
  amber: '#C7810A',
  teal: '#1E6E67',
  danger: '#B3402A',
  white: '#FFFFFF'
};

// Exact five-column structure from the supplied ledger table.
const COL = { index: 34, item: 238, qty: 55, unit: 105, amount: W - 34 - 238 - 55 - 105 };

function text(pdf, value, x, y, options = {}) {
  pdf.font(options.font || 'body')
    .fontSize(options.size || 9)
    .fillColor(options.color || C.ink)
    .text(String(value ?? ''), x, y, {
      width: options.width,
      align: options.align || 'left',
      lineGap: options.lineGap || 0,
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
  return String(value ?? '').replace(/([^\s]{30})(?=[^\s])/g, '$1\u200b');
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

function drawLogo(pdf, x, y, size, buffer) {
  if (!buffer) return;
  try {
    pdf.image(buffer, x, y, { fit: [size, size], align: 'center', valign: 'center' });
  } catch (_) {}
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

function drawHeader(pdf, doc) {
  const top = 34;
  const logoSize = 60;
  const brandX = M + logoSize + 14;
  const metaW = 185;
  const metaX = A4.width - M - metaW;
  const brandW = Math.max(190, metaX - brandX - 24);
  const accent = doc.type === 'quotation' ? C.amber : C.teal;

  drawLogo(pdf, M, top, logoSize, doc.company.logo);

  let brandY = top;
  const companyName = String(doc.company.name || '');
  text(pdf, companyName, brandX, brandY, { font: 'bold', size: 17, width: brandW });
  brandY += Math.max(22, measured(pdf, companyName, brandW, 17, 'bold')) + 4;

  const meta = [
    doc.company.address,
    [doc.company.phone, doc.company.email].filter(Boolean).join('  ·  '),
    doc.company.taxId ? `PIN: ${doc.company.taxId}` : ''
  ].filter(Boolean);

  for (const value of meta) {
    const h = measured(pdf, value, brandW, 8.5);
    text(pdf, value, brandX, brandY, { size: 8.5, color: C.muted, width: brandW });
    brandY += h + 3;
  }

  const type = doc.type === 'quotation' ? 'Quotation' : 'Invoice';
  text(pdf, type, metaX, top, { font: 'bold', size: 23, width: metaW, align: 'right' });
  right(pdf, `No. ${doc.number}`, metaX, top + 28, metaW, { size: 9, color: C.muted });
  right(pdf, `Issued    ${displayDate(doc.date)}`, metaX, top + 48, metaW, { size: 8.5, color: C.muted });
  right(pdf, `${doc.type === 'quotation' ? 'Valid until' : 'Due'}    ${displayDate(doc.type === 'quotation' ? doc.validUntil : doc.dueDate)}`, metaX, top + 62, metaW, { size: 8.5, color: C.muted });
  if (doc.servedBy) right(pdf, `Served by    ${doc.servedBy}`, metaX, top + 76, metaW, { size: 8.2, color: C.muted });

  const bottom = Math.max(brandY, top + 90) + 20;
  pdf.strokeColor(C.ink).lineWidth(1.1).moveTo(M, bottom).lineTo(A4.width - M, bottom).stroke();

  // Exact corner stamp treatment from the supplied template.
  pdf.save();
  pdf.translate(A4.width - M - 35, top + 3);
  pdf.rotate(9);
  pdf.strokeColor(accent).lineWidth(1.1).dash(4, { space: 3 });
  pdf.moveTo(-95, 0).lineTo(95, 0).stroke();
  pdf.moveTo(-95, 24).lineTo(95, 24).stroke();
  text(pdf, type, -95, 7, { font: 'bold', size: 9.5, color: accent, width: 190, align: 'center' });
  pdf.restore();

  return bottom + 1;
}

function drawParties(pdf, doc, y) {
  const gap = 24;
  const colW = (W - gap) / 2;
  const leftX = M;
  const rightX = M + colW + gap;

  text(pdf, 'BILLED TO', leftX, y, { font: 'bold', size: 7.5, color: C.muted, width: colW });
  text(pdf, doc.customer.name, leftX, y + 16, { font: 'bold', size: 10.5, width: colW });

  let leftY = y + 31;
  for (const value of [doc.customer.address, doc.customer.phone, doc.customer.email, doc.customer.taxId ? `PIN: ${doc.customer.taxId}` : ''].filter(Boolean)) {
    text(pdf, value, leftX, leftY, { size: 8.2, color: C.muted, width: colW });
    leftY += measured(pdf, value, colW, 8.2) + 2;
  }

  text(pdf, 'ORDER REFERENCE', rightX, y, { font: 'bold', size: 7.5, color: C.muted, width: colW });
  text(pdf, doc.orderReference || '—', rightX, y + 16, { font: 'bold', size: 10.5, width: colW });

  let rightY = y + 31;
  const status = doc.status || (doc.type === 'quotation' ? 'Pending approval' : 'Awaiting payment');
  for (const value of [
    doc.channel ? `Channel: ${doc.channel}` : '',
    doc.paymentMethod ? `Payment method: ${doc.paymentMethod}` : '',
    `Status: ${status}`
  ].filter(Boolean)) {
    text(pdf, value, rightX, rightY, { size: 8.2, color: C.muted, width: colW });
    rightY += measured(pdf, value, colW, 8.2) + 2;
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
  for (const [label, width, isRight] of columns) {
    if (isRight) right(pdf, label, x, y, width, { font: 'bold', size: 7.3, color: C.muted });
    else text(pdf, label, x, y, { font: 'bold', size: 7.3, color: C.muted, width });
    x += width;
  }

  pdf.strokeColor(C.ink).lineWidth(1).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke();
  return y + h + 1;
}

function itemHeight(pdf, item) {
  const itemW = COL.item - 12;
  const nameH = measured(pdf, wrap(item.description), itemW, 8.7, 'bold');
  const subH = item.sub ? measured(pdf, wrap(item.sub), itemW, 7.4) : 0;
  return Math.max(30, nameH + subH + 15);
}

function drawItem(pdf, item, y, index, currency) {
  const h = itemHeight(pdf, item);
  let x = M;

  text(pdf, String(index + 1).padStart(2, '0'), x + 4, y + 8, { size: 7.5, color: C.muted, width: COL.index - 8 });
  x += COL.index;

  text(pdf, wrap(item.description), x + 4, y + 7, { font: 'bold', size: 8.7, width: COL.item - 12 });
  if (item.sub) text(pdf, wrap(item.sub), x + 4, y + 20, { size: 7.4, color: C.muted, width: COL.item - 12 });
  x += COL.item;

  right(pdf, formatNumber(item.qty), x, y + 8, COL.qty - 7, { size: 8.2 });
  x += COL.qty;
  right(pdf, formatMoney(moneyFromInput(item.unitPrice), currency), x, y + 8, COL.unit - 7, { size: 8.2 });
  x += COL.unit;
  right(pdf, formatMoney(lineTotal(item).total, currency), x, y + 8, COL.amount - 7, { font: 'bold', size: 8.2 });

  pdf.strokeColor(C.lineSoft).lineWidth(.55).moveTo(M, y + h).lineTo(A4.width - M, y + h).stroke();
  return y + h;
}

function drawTotals(pdf, doc, values, y) {
  const width = 280;
  const x = A4.width - M - width;
  let cy = y;

  const line = (label, value, color = C.ink) => {
    text(pdf, label, x, cy, { size: 8.5, color: C.muted, width: width - 125 });
    right(pdf, value, x + 120, cy, width - 120, { size: 8.5, color });
    cy += 18;
  };

  line('Subtotal', formatMoney(values.subtotal, doc.currency));
  line('VAT', formatMoney(values.tax, doc.currency));
  if (values.discount) line('Discount', `- ${formatMoney(values.discount, doc.currency)}`, C.danger);

  const grandLabel = doc.type === 'quotation' ? 'Estimated total' : 'Total due';
  pdf.fillColor(C.ink).roundedRect(x, cy + 2, width, 34, 6).fill();
  text(pdf, grandLabel, x + 14, cy + 12, { font: 'bold', size: 8.8, color: C.white, width: 120 });
  right(pdf, formatMoney(values.total, doc.currency), x + 120, cy + 10, width - 134, { font: 'bold', size: 12.5, color: C.white });
  return cy + 36;
}

function drawQrPlaceholder(pdf, x, y, size) {
  pdf.save();
  pdf.strokeColor(C.ink).lineWidth(.8).roundedRect(x, y, size, size, 6).stroke();
  const cell = 4;
  const count = Math.floor((size - 8) / cell);
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (((row * 17 + col * 31 + row * col) % 7) < 2) {
        pdf.fillColor(C.ink).rect(x + 4 + col * cell, y + 4 + row * cell, cell, cell).fill();
      }
    }
  }
  pdf.restore();
}

function drawFooter(pdf, doc, y) {
  const leftW = 300;
  const gap = 28;
  const rightX = M + leftW + gap;
  const rightW = W - leftW - gap;
  const note = doc.notes || (doc.type === 'quotation'
    ? 'This quotation is valid for 14 days from the issue date. Prices are subject to stock availability at time of order confirmation.'
    : 'Goods once sold are exchangeable within 7 days with receipt. Prices include VAT where applicable. Thank you for shopping with us.');
  const noteText = doc.terms ? `${note}\n${doc.terms}` : note;

  const leftH = measured(pdf, noteText, leftW, 8.2) + 45;
  const payment = doc.paymentDetails || {};
  const paymentRows = [
    ['M-Pesa Paybill', payment.paybill],
    ['Till', payment.till],
    ['Account', payment.account],
    ['Bank', payment.bank]
  ].filter(([, value]) => value);
  const rightH = 45 + paymentRows.length * 15 + (payment.qr ? 78 : 0);
  const height = Math.max(leftH, rightH);

  pdf.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M, y).lineTo(A4.width - M, y).stroke();
  text(pdf, 'NOTES & TERMS', M, y + 12, { font: 'bold', size: 7.3, color: C.muted, width: leftW });
  text(pdf, noteText, M, y + 27, { size: 8.2, width: leftW, lineGap: 2 });

  text(pdf, 'PAYMENT DETAILS', rightX, y + 12, { font: 'bold', size: 7.3, color: C.muted, width: rightW });
  let paymentY = y + 27;
  for (const [label, value] of paymentRows) {
    text(pdf, label, rightX, paymentY, { size: 7.8, color: C.muted, width: rightW * .55 });
    right(pdf, value, rightX + rightW * .55, paymentY, rightW * .45, { size: 7.8 });
    paymentY += 15;
  }
  if (payment.qr) drawQrPlaceholder(pdf, rightX, paymentY + 3, 60);

  return y + height + 12;
}

function drawSignatures(pdf, doc, y) {
  const gap = 24;
  const width = (W - gap) / 2;

  pdf.strokeColor(C.ink).lineWidth(.6);
  pdf.moveTo(M, y + 28).lineTo(M + width, y + 28).stroke();
  pdf.moveTo(M + width + gap, y + 28).lineTo(A4.width - M, y + 28).stroke();

  text(pdf, doc.preparedBy ? `Prepared by: ${doc.preparedBy}` : 'Prepared by', M, y + 34, { size: 7.5, color: C.muted, width, align: 'center' });
  text(pdf, doc.customerAcknowledgement || 'Customer acknowledgement', M + width + gap, y + 34, { size: 7.5, color: C.muted, width, align: 'center' });
  return y + 50;
}

function drawPageFooter(pdf, doc, pageNumber, pageCount) {
  pdf.strokeColor(C.lineSoft).lineWidth(.6).moveTo(M, FOOTER_Y - 8).lineTo(A4.width - M, FOOTER_Y - 8).stroke();
  text(pdf, doc.type === 'quotation' ? 'Quotation' : 'Invoice', M, FOOTER_Y, { size: 7, color: C.muted, width: 100 });
  right(pdf, `Page ${pageNumber} of ${pageCount}`, A4.width - M - 100, FOOTER_Y, 100, { size: 7, color: C.muted });
}

function paginate(pdf, doc, firstTableY, reserve) {
  const capacity = FOOTER_Y - 18 - firstTableY - reserve;
  const pages = [];
  let page = { rows: [], height: 0 };

  for (const item of doc.items) {
    const height = itemHeight(pdf, item);
    if (page.rows.length && page.height + height > capacity) {
      pages.push(page);
      page = { rows: [], height: 0 };
    }
    page.rows.push(item);
    page.height += height;
  }
  if (page.rows.length || !pages.length) pages.push(page);
  return pages;
}

async function renderDocument({ type, doc: input, company }) {
  if (!company || typeof company !== 'object') throw new Error('company: must be an object');

  const logoSource = company.logo || company.logoUrl || company.logo_url || company.logoPath || company.logo_path || '';
  const logo = await loadLogo(logoSource);
  const normalizedCompany = { ...company, logo };
  validateDocument(type, input, normalizedCompany);
  const doc = normalizeDocument(type, input, normalizedCompany);
  const calculated = totals(doc.items);

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
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.once('end', () => resolve(Buffer.concat(chunks)));
    pdf.once('error', reject);
  });

  // The last-page reserve is deliberately based on the actual supplied layout:
  // totals, notes/payment details, signatures and footer all remain together.
  const probe = new PDFDocument({ size: 'A4' });
  registerFonts(probe);
  const headerY = drawHeader(probe, doc);
  const partiesY = drawParties(probe, doc, headerY + 18);
  const tableY = drawTableHeader(probe, partiesY + 18) + 2;
  const footerReserve = 175;
  const pages = paginate(probe, doc, tableY, footerReserve);
  probe.end();

  pages.forEach((page, pageIndex) => {
    pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } });

    const currentHeader = drawHeader(pdf, doc);
    const currentParties = drawParties(pdf, doc, currentHeader + 18);
    let y = drawTableHeader(pdf, currentParties + 18) + 2;

    page.rows.forEach((item, index) => {
      y = drawItem(pdf, item, y, index, doc.currency);
    });

    if (pageIndex === pages.length - 1) {
      y += 14;
      const totalsY = Math.min(y, FOOTER_Y - footerReserve - 12);
      const afterTotals = drawTotals(pdf, doc, calculated, totalsY);
      const afterFooter = drawFooter(pdf, doc, afterTotals + 18);
      drawSignatures(pdf, doc, Math.min(afterFooter + 8, FOOTER_Y - 58));
    }
  });

  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    drawPageFooter(pdf, doc, index + 1, range.count);
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

module.exports = {
  renderDocument,
  renderPdfBuffer,
  mapDocumentPayload: adaptDocumentPayload
};
