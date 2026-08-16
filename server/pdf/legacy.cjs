'use strict';
const { renderDocument } = require('./index.cjs');
function asDate(value) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().slice(0, 10); }
function mapLegacy(payload, paper) {
  if (paper && paper !== 'a4') throw new Error('The invoice/quotation PDF API only supports A4 documents');
  const type = String(payload.documentType || payload.type || '').toLowerCase().includes('quotation') ? 'quotation' : 'invoice';
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return {
    type,
    doc: {
      number: payload.documentNumber || 'DOCUMENT', date: asDate(payload.documentDate || payload.date || new Date()), dueDate: asDate(payload.dueDate), validUntil: asDate(payload.validUntil || payload.dueDate),
      customer: { name: payload.customerName || payload.partyName || 'Walk-in Customer', address: payload.customerAddress || payload.customer?.address || '', phone: payload.customerPhone || payload.customer?.phone || '', email: payload.customerEmail || payload.customer?.email || '', taxId: payload.customerTaxNumber || payload.customer?.taxNumber || '' },
      items: rows.map((r) => ({ description: r.description || r.productName || 'Item', qty: r.quantity ?? r.qty ?? 0, unitPrice: r.unitPrice ?? 0, taxRate: r.taxRate ?? 0, discount: r.discount ?? 0 })),
      currency: String(payload.currency || payload.settings?.currency || 'KES'),
      notes: Array.isArray(payload.notesSections) ? payload.notesSections.map((x) => Array.isArray(x) ? x.join(': ') : String(x)).join('\n') : '',
      terms: Array.isArray(payload.termsLines) ? payload.termsLines.join('\n') : ''
    },
    company: { name: payload.company?.name || payload.company?.businessName || payload.settings?.businessName || 'Unique Solar Kenya Ltd', address: payload.company?.address || payload.company?.businessAddress || payload.settings?.businessAddress || '', phone: payload.company?.phone || payload.company?.businessPhone || payload.settings?.businessPhone || '', email: payload.company?.email || payload.company?.businessEmail || payload.settings?.businessEmail || '', taxId: payload.company?.taxPin || payload.settings?.taxPin || payload.settings?.taxNumber || '', logo: payload.company?.logo || payload.settings?.logoUrl || null }
  };
}
async function renderLegacyPdf(payload, paper) { return renderDocument(mapLegacy(payload, paper)); }
module.exports = { renderLegacyPdf };
