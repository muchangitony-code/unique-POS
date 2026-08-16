'use strict';

const TYPES = new Set(['invoice', 'quotation']);
function bad(path, message) { const e = new Error(`${path}: ${message}`); e.statusCode = 400; throw e; }
function str(v, path, required = false) { if (v == null || String(v).trim() === '') { if (required) bad(path, 'is required'); return ''; } return String(v).trim(); }
function dateLike(v, path, required = false) { const s = str(v, path, required); if (!s) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) bad(path, 'must be YYYY-MM-DD'); return s; }
function nonNegativeNumber(v, path, required = false) { if (v == null || v === '') { if (required) bad(path, 'is required'); return 0; } const n = Number(v); if (!Number.isFinite(n) || n < 0) bad(path, 'must be a non-negative number'); return n; }
function normalizeCustomer(c) { if (!c || typeof c !== 'object') bad('customer', 'must be an object'); return { name: str(c.name, 'customer.name', true), address: str(c.address), phone: str(c.phone), email: str(c.email), taxId: str(c.taxId) }; }
function validateDocument(type, doc, company) {
  if (!TYPES.has(type)) bad('type', 'must be invoice or quotation');
  if (!doc || typeof doc !== 'object') bad('doc', 'must be an object');
  if (!company || typeof company !== 'object') bad('company', 'must be an object');
  str(doc.number, 'number', true); dateLike(doc.date, 'date', true);
  type === 'invoice' ? dateLike(doc.dueDate, 'dueDate') : dateLike(doc.validUntil, 'validUntil');
  normalizeCustomer(doc.customer);
  if (!Array.isArray(doc.items) || doc.items.length === 0) bad('items', 'must contain at least one item');
  doc.items.forEach((it, i) => { if (!it || typeof it !== 'object') bad(`items[${i}]`, 'must be an object'); str(it.description, `items[${i}].description`, true); nonNegativeNumber(it.qty, `items[${i}].qty`, true); nonNegativeNumber(it.unitPrice, `items[${i}].unitPrice`, true); nonNegativeNumber(it.taxRate, `items[${i}].taxRate`); nonNegativeNumber(it.discount, `items[${i}].discount`); });
  str(doc.currency, 'currency', true); str(doc.notes); str(doc.terms); str(company.name, 'company.name', true);
}
function normalizeDocument(type, doc, company) {
  return { type, number: String(doc.number).trim(), date: String(doc.date).trim(), dueDate: str(doc.dueDate), validUntil: str(doc.validUntil), customer: normalizeCustomer(doc.customer), items: doc.items.map((it) => ({ description: String(it.description).trim(), qty: Number(it.qty), unitPrice: String(it.unitPrice), taxRate: Number(it.taxRate || 0), discount: String(it.discount == null ? '0' : it.discount), currency: doc.currency })), currency: String(doc.currency).trim().toUpperCase(), notes: str(doc.notes), terms: str(doc.terms), company: { name: str(company.name, 'company.name', true), address: str(company.address), phone: str(company.phone), email: str(company.email), taxId: str(company.taxId), logo: Buffer.isBuffer(company.logo) ? company.logo : (typeof company.logo === 'string' && company.logo.startsWith('data:image/') ? Buffer.from(company.logo.split(',')[1], 'base64') : null) } };
}
module.exports = { validateDocument, normalizeDocument };
