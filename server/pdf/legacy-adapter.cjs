'use strict';

const { renderDocument } = require('./index.cjs');

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function isoDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  if (!s || s === '—' || s === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{4})(?:\D.*)?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return d.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function money(value) {
  if (value === undefined || value === null || value === '' || value === '—') return '0';
  return String(value).replace(/,/g, '').replace(/^K(?:ES|Sh)\s*/i, '').trim() || '0';
}

function number(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function adaptLegacyPayload(payload, paper) {
  const source = payload?.doc || payload?.document || payload;
  const type = source?.type === 'quotation' || payload?.type === 'quotation' ? 'quotation' : 'invoice';
  const customer = source?.customer || payload?.customer || {};
  const company = source?.company || payload?.company || payload?.business || {};
  const rawItems = source?.items || source?.lineItems || source?.rows || payload?.items || payload?.rows || [];

  const items = rawItems.map((item) => ({
    description: first(item.description, item.product_name, item.itemName, item.name, 'Item'),
    qty: number(first(item.qty, item.quantity, item.count), 0),
    unitPrice: money(first(item.unitPrice, item.unit_price, item.selling_price, item.price, 0)),
    taxRate: number(first(item.taxRate, item.vatRate, item.vat_rate, item.tax_rate), 0),
    discount: money(first(item.discount, item.discount_amount, 0))
  }));

  return {
    type,
    doc: {
      number: first(source?.number, source?.documentNumber, source?.invoiceNumber, source?.quotationNumber, payload?.number),
      date: isoDate(first(source?.date, source?.createdAt, source?.created_at, payload?.date)),
      dueDate: isoDate(first(source?.dueDate, source?.due_date, payload?.dueDate, payload?.due_date)),
      validUntil: isoDate(first(source?.validUntil, source?.valid_until, payload?.validUntil, payload?.valid_until)),
      customer: {
        name: first(customer.name, customer.customer_name, customer.company, 'Walk-in Customer'),
        address: first(customer.address, customer.customer_address),
        phone: first(customer.phone, customer.customer_phone),
        email: first(customer.email, customer.customer_email),
        taxId: first(customer.taxId, customer.tax_id, customer.tax_number, customer.kra_pin)
      },
      items,
      currency: first(source?.currency, payload?.currency, 'KES'),
      notes: first(source?.notes, payload?.notes),
      terms: first(source?.terms, source?.paymentTerms, source?.payment_terms, payload?.terms, payload?.paymentTerms)
    },
    company: {
      name: first(company.name, company.business_name, payload?.companyName, 'Unique Solar Kenya Ltd'),
      address: first(company.address, company.business_address),
      phone: first(company.phone, company.business_phone),
      email: first(company.email, company.business_email),
      taxId: first(company.taxId, company.tax_id, company.taxNumber, company.tax_number, company.pin_number),
      logoUrl: first(company.logoUrl, company.logo_url, company.logo)
    },
    paper
  };
}

async function renderLegacyDocumentPdf(payload, paper) {
  const adapted = adaptLegacyPayload(payload, paper);
  return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company });
}

module.exports = { adaptLegacyPayload, renderLegacyDocumentPdf };
