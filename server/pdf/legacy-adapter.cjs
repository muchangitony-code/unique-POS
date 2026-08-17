'use strict';

const { renderDocument } = require('./clean.cjs');
const { renderReceiptDocument } = require('./receipt.cjs');

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function isoDate(value) {
  if (value === undefined || value === null || value === '' || value === '—' || value === '-') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{4})(?:\D.*)?$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    if (d.getUTCFullYear() === Number(dmy[3]) && d.getUTCMonth() === Number(dmy[2]) - 1 && d.getUTCDate() === Number(dmy[1])) return d.toISOString().slice(0, 10);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function money(value) {
  if (value === undefined || value === null || value === '' || value === '—' || value === '-') return '0';
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : String(value).replace(/,/g, '').replace(/^K(?:ES|Sh)\s*/i, '').trim() || '0';
}

function number(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function objectFirst(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function adaptLegacyPayload(payload, paper) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const meta = objectFirst(root.meta, root.metadata, root.documentMeta, root.document_metadata);
  const source = objectFirst(root.doc, root.document, root.invoice, root.quotation, root);
  const rawType = first(root.type, root.documentType, root.document_type, root.docType, root.kind, source.type, source.documentType, source.document_type, meta.type, meta.documentType);
  const typeText = String(rawType).toLowerCase();
  const type = typeText.includes('quotation') || typeText.includes('quote') ? 'quotation' : 'invoice';

  const customer = objectFirst(source.customer, source.customerDetails, root.customer, root.customerDetails, meta.customer);
  const company = objectFirst(source.company, source.business, root.company, root.business, root.settings);
  const rawItems = first(source.items, source.lineItems, source.line_items, source.rows, source.quotationItems, source.invoiceItems, root.items, root.lineItems, root.line_items, root.rows, root.quotationItems, root.invoiceItems);
  const itemList = Array.isArray(rawItems) ? rawItems : [];

  const items = itemList.map((item) => ({
    description: first(item.description, item.product_name, item.productName, item.itemName, item.name, item.title, 'Item'),
    qty: number(first(item.qty, item.quantity, item.count, item.units), 0),
    unitPrice: money(first(item.unitPrice, item.unit_price, item.selling_price, item.sellingPrice, item.price, item.rate, 0)),
    taxRate: number(first(item.taxRate, item.vatRate, item.vat_rate, item.tax_rate, item.taxPercent, 0), 0),
    discount: money(first(item.discount, item.discount_amount, item.discountAmount, 0))
  }));

  return {
    type,
    doc: {
      number: first(source.number, source.documentNumber, source.document_number, source.invoiceNumber, source.invoice_number, source.quotationNumber, source.quotation_number, source.quoteNumber, source.quote_number, root.number, root.documentNumber, root.invoiceNumber, root.quotationNumber, meta.number, meta.documentNumber, meta.invoiceNumber, meta.quotationNumber),
      date: isoDate(first(source.date, source.createdAt, source.created_at, source.issueDate, source.issue_date, root.date, root.documentDate, root.createdAt, root.created_at, meta.date, meta.documentDate, meta.createdAt, meta.created_at, meta.issueDate, meta.issue_date)),
      dueDate: isoDate(first(source.dueDate, source.due_date, source.paymentDueDate, source.payment_due_date, root.dueDate, root.due_date, meta.dueDate, meta.due_date, meta.paymentDueDate, meta.payment_due_date)),
      validUntil: isoDate(first(source.validUntil, source.valid_until, source.expiryDate, source.expiry_date, root.validUntil, root.valid_until, meta.validUntil, meta.valid_until, meta.expiryDate, meta.expiry_date)),
      customer: {
        name: first(customer.name, customer.customer_name, customer.company, customer.companyName, root.customerName, meta.customerName, 'Walk-in Customer'),
        address: first(customer.address, customer.customer_address, root.customerAddress, meta.customerAddress),
        phone: first(customer.phone, customer.customer_phone, root.customerPhone, meta.customerPhone),
        email: first(customer.email, customer.customer_email, root.customerEmail, meta.customerEmail),
        taxId: first(customer.taxId, customer.tax_id, customer.tax_number, customer.kra_pin, customer.kraPin, root.customerTaxId, meta.customerTaxId)
      },
      items,
      currency: first(source.currency, root.currency, meta.currency, 'KES'),
      notes: first(source.notes, source.note, root.notes, meta.notes),
      terms: first(source.terms, source.paymentTerms, source.payment_terms, root.terms, root.paymentTerms, root.payment_terms, meta.terms, meta.paymentTerms, meta.payment_terms)
    },
    company: {
      name: first(company.name, company.business_name, company.businessName, root.companyName, root.businessName, meta.companyName, 'Unique Solar Kenya Ltd'),
      address: first(company.address, company.business_address, company.businessAddress, root.companyAddress),
      phone: first(company.phone, company.business_phone, company.businessPhone, root.companyPhone),
      email: first(company.email, company.business_email, company.businessEmail, root.companyEmail),
      taxId: first(company.taxId, company.tax_id, company.taxNumber, company.tax_number, company.pin_number, company.kra_pin, company.kraPin, company.taxPin, root.companyTaxId, root.taxPin, meta.companyTaxId, meta.taxPin),
      logoUrl: first(company.logoUrl, company.logo_url, company.logo, company.logoPath, company.logo_path, root.logoUrl, root.logo, meta.logoUrl, meta.logo)
    },
    paper
  };
}

async function renderLegacyDocumentPdf(payload, paper) {
  const adapted = adaptLegacyPayload(payload, paper);
  return renderDocument({ type: adapted.type, doc: adapted.doc, company: adapted.company });
}

async function renderLegacyReceiptPdf(payload, paper) {
  const adapted = adaptLegacyPayload(payload, paper);
  return renderReceiptDocument({ doc: adapted.doc, company: adapted.company, paper: paper === '58mm' ? '58mm' : '80mm' });
}

module.exports = { adaptLegacyPayload, renderLegacyDocumentPdf, renderLegacyReceiptPdf };
