'use strict';

const { renderDocument } = require('./index.cjs');

function asDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\D.*)?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function moneyValue(value) {
  if (value == null || value === '') return '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = String(value).trim();
  if (!s) return '0';
  const cleaned = s.replace(/[^0-9.-]/g, '');
  return cleaned || '0';
}

function quantityValue(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function mapLegacy(payload, paper) {
  if (paper && paper !== 'a4') throw new Error('The invoice/quotation PDF API only supports A4 documents');
  const source = payload && typeof payload === 'object' ? payload : {};
  const type = String(source.documentType || source.type || '').toLowerCase().includes('quotation') ? 'quotation' : 'invoice';
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

async function renderLegacyPdf(payload, paper) {
  return renderDocument(mapLegacy(payload, paper));
}

module.exports = { renderLegacyPdf, mapLegacy };
