'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const CONTENT_W = A4.width - M * 2;
const FOOTER_Y = A4.height - 28;
const TABLE_W = CONTENT_W;
const COLORS = {
  text: '#111827',
  muted: '#667085',
  line: '#D7DDE5',
  soft: '#F6F8FB',
  accent: '#123D6A',
  orange: '#F7941D',
  white: '#FFFFFF'
};
const COLS = { description: 220, qty: 48, unitPrice: 100, tax: 55, amount: 92 };
const ROW_FONT = 8.5;
const LOGO_PATH = path.join(__dirname, '../../public/assets/unique-solar-kenya-logo.svg');

function text(pdf, value, x, y, o = {}) {
  pdf.font(o.font || 'body').fontSize(o.size || 9).fillColor(o.color || COLORS.text)
    .text(String(value ?? ''), x, y, { width: o.width, align: o.align || 'left', lineGap: o.lineGap || 0 });
}
function right(pdf, value, x, y, w, o = {}) { text(pdf, value, x, y, { ...o, width: w, align: 'right' }); }
function wrapHeight(pdf, value, width, size = ROW_FONT) {
  pdf.font('body').fontSize(size);
  return pdf.heightOfString(String(value ?? ''), { width, lineGap: 0 });
}
function safeDescription(value) {
  return String(value ?? '').replace(/([^\s]{30})(?=[^\s])/g, '$1\u200b');
}
function rowHeight(pdf, item) {
  return Math.max(27, wrapHeight(pdf, safeDescription(item.description), COLS.description - 12) + 13);
}
function itemTotals(item) {
  const gross = mulCents(moneyFromInput(item.unitPrice), item.qty);
  const discount = moneyFromInput(item.discount || '0');
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function totals(items) {
  let subtotal = 0, discount = 0, tax = 0, total = 0;
  for (const item of items) {
    const t = itemTotals(item);
    subtotal += t.gross; discount += t.discount; tax += t.tax; total += t.total;
  }
  return { subtotal, discount, tax, total };
}

function getLogoBuffer(company) {
  if (Buffer.isBuffer(company.logo)) return company.logo;
  if (typeof company.logo === 'string' && company.logo.startsWith('data:image/')) {
    try { return Buffer.from(company.logo.split(',')[1], 'base64'); } catch {}
  }
  try { return fs.readFileSync(LOGO_PATH); } catch { return null; }
}

function footer(pdf, n, total, data) {
  pdf.strokeColor(COLORS.line).lineWidth(0.6).moveTo(M, FOOTER_Y - 7).lineTo(A4.width - M, FOOTER_Y - 7).stroke();
  text(pdf, data.type === 'invoice' ? 'Invoice' : 'Quotation', M, FOOTER_Y, { size: 7.5, color: COLORS.muted });
  right(pdf, `Page ${n} of ${total}`, A4.width - M - 110, FOOTER_Y, 110, { size: 7.5, color: COLORS.muted });
}

function header(pdf, data) {
  const top = 22;
  pdf.fillColor(COLORS.accent).rect(0, 0, A4.width, 5).fill();

  const logo = getLogoBuffer(data.company);
  if (logo) {
    try { pdf.image(logo, M, top, { fit: [72, 72], align: 'left', valign: 'top' }); } catch {}
  }

  const companyX = M + 86;
  text(pdf, data.company.name, companyX, top + 4, { font: 'bold', size: 16, color: COLORS.accent, width: 285 });
  if (data.company.address) text(pdf, data.company.address, companyX, top + 27, { size: 8, color: COLORS.muted, width: 285 });
  const contact = [data.company.phone, data.company.email].filter(Boolean).join('  ·  ');
  if (contact) text(pdf, contact, companyX, top + 40, { size: 8, color: COLORS.muted, width: 285 });
  if (data.company.taxId) text(pdf, `Tax ID: ${data.company.taxId}`, companyX, top + 53, { size: 8, color: COLORS.muted, width: 285 });

  const cardX = A4.width - M - 190;
  const cardY = top;
  pdf.fillColor(COLORS.accent).roundedRect(cardX, cardY, 190, 76, 5).fill();
  text(pdf, data.type === 'invoice' ? 'INVOICE' : 'QUOTATION', cardX + 13, cardY + 11, { font: 'bold', size: 14, color: COLORS.white, width: 164 });
  text(pdf, data.number, cardX + 13, cardY + 32, { size: 8.5, color: COLORS.white, width: 164 });
  text(pdf, `Date: ${data.date}`, cardX + 13, cardY + 46, { size: 8, color: COLORS.white, width: 164 });
  text(pdf, `${data.type === 'invoice' ? 'Due date' : 'Valid until'}: ${data.type === 'invoice' ? data.dueDate || '—' : data.validUntil || '—'}`, cardX + 13, cardY + 59, { size: 8, color: COLORS.white, width: 164 });

  const customerY = 108;
  const customerH = 61;
  pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, customerY, CONTENT_W, customerH, 4).fillAndStroke();
  text(pdf, 'CUSTOMER', M + 12, customerY + 9, { font: 'bold', size: 7.5, color: COLORS.accent });
  text(pdf, data.customer.name, M + 12, customerY + 23, { font: 'bold', size: 10.5, width: 285 });
  const details = [data.customer.address, data.customer.phone, data.customer.email, data.customer.taxId ? `Tax ID: ${data.customer.taxId}` : ''].filter(Boolean).join('  ·  ');
  if (details) text(pdf, details, M + 12, customerY + 39, { size: 7.5, color: COLORS.muted, width: CONTENT_W - 115 });

  const status = data.type === 'invoice' ? 'UNPAID' : 'VALID';
  pdf.fillColor(COLORS.white).strokeColor(COLORS.accent).roundedRect(A4.width - M - 78, customerY + 15, 66, 20, 10).fillAndStroke();
  text(pdf, status, A4.width - M - 74, customerY + 21, { font: 'bold', size: 6.8, color: COLORS.accent, width: 58, align: 'center' });
  return customerY + customerH + 12;
}

function tableHeader(pdf, y) {
  const h = 24;
  pdf.fillColor(COLORS.accent).rect(M, y, TABLE_W, h).fill();
  let x = M;
  text(pdf, 'Description', x + 7, y + 7, { font: 'bold', size: 7.5, color: COLORS.white, width: COLS.description - 14 }); x += COLS.description;
  for (const [label, w] of [['Qty', COLS.qty], ['Unit Price', COLS.unitPrice], ['Tax', COLS.tax], ['Amount', COLS.amount]]) {
    right(pdf, label, x, y + 7, w - 7, { font: 'bold', size: 7.5, color: COLORS.white }); x += w;
  }
  return y + h;
}

function row(pdf, item, y, i) {
  const h = rowHeight(pdf, item);
  if (i % 2) pdf.fillColor(COLORS.soft).rect(M, y, TABLE_W, h).fill();
  pdf.strokeColor(COLORS.line).lineWidth(0.4).rect(M, y, TABLE_W, h).stroke();
  let x = M;
  text(pdf, safeDescription(item.description), x + 7, y + 7, { size: ROW_FONT, width: COLS.description - 14 }); x += COLS.description;
  right(pdf, formatNumber(item.qty), x, y + 7, COLS.qty - 7, { size: ROW_FONT }); x += COLS.qty;
  right(pdf, formatMoney(moneyFromInput(item.unitPrice), item.currency), x, y + 7, COLS.unitPrice - 7, { size: ROW_FONT }); x += COLS.unitPrice;
  right(pdf, `${item.taxRate.toFixed(2)}%`, x, y + 7, COLS.tax - 7, { size: ROW_FONT }); x += COLS.tax;
  right(pdf, formatMoney(itemTotals(item).total, item.currency), x, y + 7, COLS.amount - 7, { font: 'bold', size: ROW_FONT });
  return y + h;
}

function totalsBlock(pdf, t, currency, y) {
  const w = 250;
  const h = 102;
  const x = A4.width - M - w;
  pdf.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(0.7).roundedRect(x, y, w, h, 3).fillAndStroke();

  const rows = [['Subtotal', t.subtotal], ['Discount', -t.discount], ['Tax', t.tax]];
  rows.forEach(([label, value], i) => {
    const yy = y + 13 + i * 20;
    text(pdf, label, x + 12, yy, { size: 8.5, color: COLORS.muted });
    right(pdf, formatMoney(value, currency), x + 105, yy, w - 117, { size: 8.5 });
  });

  const grandY = y + h - 31;
  pdf.fillColor(COLORS.accent).roundedRect(x, grandY, w, 31, 3).fill();
  text(pdf, 'GRAND TOTAL', x + 12, grandY + 9, { font: 'bold', size: 8.5, color: COLORS.white });
  right(pdf, formatMoney(t.total, currency), x + 105, grandY + 7, w - 117, { font: 'bold', size: 11, color: COLORS.white });
  return h;
}

function block(pdf, title, value, y) {
  if (!value) return 0;
  const h = Math.max(42, wrapHeight(pdf, value, CONTENT_W - 20, 8) + 31);
  pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(0.6).roundedRect(M, y, CONTENT_W, h, 3).fillAndStroke();
  text(pdf, title, M + 10, y + 8, { font: 'bold', size: 8, color: COLORS.accent });
  text(pdf, value, M + 10, y + 21, { size: 8, color: COLORS.muted, width: CONTENT_W - 20 });
  return h;
}

function calculatePages(pdf, data) {
  const headerBottom = 195;
  const bodyBottom = FOOTER_Y - 18;
  const normalCapacity = bodyBottom - headerBottom;
  const notesH = data.notes ? Math.max(42, wrapHeight(pdf, data.notes, CONTENT_W - 20, 8) + 31) : 0;
  const termsH = data.terms ? Math.max(42, wrapHeight(pdf, data.terms, CONTENT_W - 20, 8) + 31) : 0;
  const lastReserve = 12 + 102 + (data.notes ? 8 + notesH : 0) + (data.terms ? 8 + termsH : 0);

  const pages = [];
  let current = { rows: [], height: 0 };
  const push = () => { if (current.rows.length || pages.length === 0) pages.push(current); current = { rows: [], height: 0 }; };

  for (const item of data.items) {
    const h = rowHeight(pdf, item);
    const isPotentialLast = current.height + h + lastReserve <= normalCapacity;
    if (!isPotentialLast && current.rows.length) push();
    current.rows.push(item);
    current.height += h;
  }
  if (!current.rows.length && pages.length) current = pages[pages.length - 1];
  if (current.height + lastReserve > normalCapacity && current.rows.length > 1) {
    const moved = current.rows.pop();
    current.height -= rowHeight(pdf, moved);
    pages.push(current);
    current = { rows: [moved], height: rowHeight(pdf, moved) };
  }
  if (!pages.includes(current)) pages.push(current);
  return pages;
}

async function renderDocument({ type, doc: input, company }) {
  validateDocument(type, input, company);
  const data = normalizeDocument(type, input, company);
  const t = totals(data.items);
  const pdf = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, autoFirstPage: false, bufferPages: true, info: { Title: `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${data.number}`, Author: company.name } });
  registerFonts(pdf);
  const chunks = [];
  const done = new Promise((resolve, reject) => { pdf.on('data', c => chunks.push(c)); pdf.once('end', () => resolve(Buffer.concat(chunks))); pdf.once('error', reject); });

  const pages = calculatePages(pdf, data);
  const headerBottom = 195;
  const bodyBottom = FOOTER_Y - 18;

  pages.forEach((page, pageIndex) => {
    pdf.addPage({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M } });
    let y = tableHeader(pdf, header(pdf, data)) + 4;
    page.rows.forEach((item, i) => { y = row(pdf, item, y, i); });

    if (pageIndex === pages.length - 1) {
      y += 12;
      const totalsY = Math.min(y, bodyBottom - 102);
      totalsBlock(pdf, t, data.currency, totalsY);
      y = totalsY + 110;
      if (data.notes) y += block(pdf, 'Notes', data.notes, y) + 8;
      if (data.terms) block(pdf, data.type === 'invoice' ? 'Terms & Conditions' : 'Quotation Terms', data.terms, y);
    }
  });

  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) footer(pdf, i + 1, range.count, data);
  pdf.end();
  return done;
}

function asDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\D.*)?$/);
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function moneyValue(value) {
  if (value == null || value === '') return '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const cleaned = String(value).trim().replace(/[^0-9.-]/g, '');
  return cleaned || '0';
}
function quantityValue(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
function mapDocumentPayload(payload, paper) {
  if (paper && paper !== 'a4') throw new Error('The invoice/quotation PDF API only supports A4 documents');
  const source = payload && typeof payload === 'object' ? payload : {};
  const rawType = String(source.documentType || source.type || '').toLowerCase();
  const type = rawType.includes('quotation') ? 'quotation' : 'invoice';
  const rows = Array.isArray(source.rows) ? source.rows : Array.isArray(source.items) ? source.items : [];
  const customer = source.customer && typeof source.customer === 'object' ? source.customer : {};
  const company = source.company && typeof source.company === 'object' ? source.company : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  return {
    type,
    doc: {
      number: source.documentNumber || source.number || 'DOCUMENT',
      date: asDate(source.documentDate || source.date || new Date()),
      dueDate: asDate(source.dueDate),
      validUntil: asDate(source.validUntil || source.dueDate),
      customer: {
        name: source.customerName || source.partyName || customer.name || customer.customer_name || 'Walk-in Customer',
        address: source.customerAddress || customer.address || '',
        phone: source.customerPhone || customer.phone || '',
        email: source.customerEmail || customer.email || '',
        taxId: source.customerTaxNumber || customer.taxNumber || customer.tax_id || ''
      },
      items: rows.map((r) => ({
        description: r.description || r.productName || r.product_name || 'Item',
        qty: quantityValue(r.quantity ?? r.qty),
        unitPrice: moneyValue(r.unitPrice ?? r.unit_price ?? r.price),
        taxRate: quantityValue(r.taxRate ?? r.tax_rate ?? r.vatRate ?? r.vat_rate),
        discount: moneyValue(r.discount ?? r.discount_amount ?? '0')
      })),
      currency: String(source.currency || settings.currency || 'KES').trim().toUpperCase(),
      notes: Array.isArray(source.notesSections) ? source.notesSections.map((x) => Array.isArray(x) ? x.join(': ') : String(x)).join('\n') : String(source.notes || ''),
      terms: Array.isArray(source.termsLines) ? source.termsLines.join('\n') : String(source.terms || '')
    },
    company: {
      name: company.name || company.businessName || settings.businessName || 'Unique Solar Kenya Ltd',
      address: company.address || company.businessAddress || settings.businessAddress || '',
      phone: company.phone || company.businessPhone || settings.businessPhone || '',
      email: company.email || company.businessEmail || settings.businessEmail || '',
      taxId: company.taxPin || company.taxId || settings.taxPin || settings.taxNumber || settings.tax_number || '',
      logo: company.logo || settings.logoUrl || null
    }
  };
}

async function renderPdfBuffer(payload, paper) { return renderDocument(mapDocumentPayload(payload, paper)); }

module.exports = { renderDocument, renderPdfBuffer, mapDocumentPayload };
