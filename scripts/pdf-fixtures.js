'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { renderDocument } = require('../server/pdf/stable.cjs');
const out = path.join(process.cwd(), 'out');
fs.mkdirSync(out, { recursive: true });
const company = { name: 'Unique Solar & General Supplies Limited', address: 'Eastern Bypass, Kiambu, Kenya', phone: '+254 733 573089', email: 'info@uniquesolarkenya.co.ke', taxId: 'P052303835W' };
const customer = { name: 'Acme Electrical Supplies', address: 'Industrial Area, Nairobi', phone: '+254 711 111 111', email: 'buyer@example.test', taxId: 'P051111111B' };
function payload(type, overrides = {}) {
  return { type, doc: { number: type === 'invoice' ? 'INV-QA-0024' : 'QTN-QA-0024', date: '2026-08-16', dueDate: '2026-08-30', validUntil: '2026-08-30', customer, items: [{ description: 'Solar cable 6mm²', qty: 2, unitPrice: '2500.00', taxRate: 16, discount: '0' }], currency: 'KES', notes: 'Thank you for your business.', terms: 'Payment is due according to the stated date.', ...overrides }, company };
}
async function write(name, data) { fs.writeFileSync(path.join(out, name), await renderDocument(data)); }
async function main() {
  for (const type of ['invoice', 'quotation']) {
    const prefix = type === 'invoice' ? 'invoice' : 'quotation';
    await write(`${prefix}-one-item.pdf`, payload(type));
    await write(`${prefix}-25-items.pdf`, payload(type, { items: Array.from({ length: 25 }, (_, i) => ({ description: `Electrical component ${i + 1} with a measured wrapping description for pagination`, qty: i + 1, unitPrice: '125.00', taxRate: 16, discount: '0' })) }));
    await write(`${prefix}-long-description.pdf`, payload(type, { items: [{ description: 'A'.repeat(300), qty: 1, unitPrice: '100.00', taxRate: 16, discount: '0' }] }));
    await write(`${prefix}-long-customer.pdf`, payload(type, { customer: { name: 'A Very Long Customer Name For Electrical Solar And General Supplies Trading Company Limited', address: 'Industrial Area, Nairobi', phone: '+254 711 111 111', email: 'buyer@example.test', taxId: 'P051111111B' } }));
    await write(`${prefix}-zero-total.pdf`, payload(type, { items: [{ description: 'Free promotional item', qty: 1, unitPrice: '0.00', taxRate: 0, discount: '0' }] }));
    await write(`${prefix}-large-amount.pdf`, payload(type, { items: [{ description: 'Large equipment package', qty: 1, unitPrice: '1234567.89', taxRate: 0, discount: '0' }] }));
  }
  console.log('[pdf-fixtures] Generated 12 invoice/quotation layout fixtures in out/');
}
main().catch(err => { console.error(err); process.exit(1); });
