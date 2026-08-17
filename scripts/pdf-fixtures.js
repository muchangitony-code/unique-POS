'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { renderDocument } = require('../server/pdf/stable.cjs');
const out = path.join(process.cwd(), 'out');
fs.mkdirSync(out, { recursive: true });
const company = { name: 'Unique Solar Kenya Ltd', address: 'Nairobi, Kenya', phone: '+254 700 000 000', email: 'sales@example.test', taxId: 'P051234567A' };
function base(type, overrides = {}) {
  return { type, doc: {
    number: type === 'invoice' ? 'INV-0024' : 'QUO-0024', date: '2026-08-16', dueDate: '2026-08-30', validUntil: '2026-08-30',
    customer: { name: 'Acme Electrical Supplies', address: 'Industrial Area, Nairobi', phone: '+254 711 111 111', email: 'buyer@example.test', taxId: 'P051111111B' },
    items: [{ description: 'Solar cable 6mm²', qty: 2, unitPrice: '2500.00', taxRate: 16, discount: '0' }], currency: 'KES',
    notes: 'Thank you for your business.', terms: 'Payment is due according to the stated date.', ...overrides
  }, company };
}
async function write(name, payload) { fs.writeFileSync(path.join(out, name), await renderDocument(payload)); }
(async () => {
  await write('invoice-one-item.pdf', base('invoice'));
  await write('quotation-one-item.pdf', base('quotation'));
  await write('invoice-multipage.pdf', base('invoice', { items: Array.from({ length: 40 }, (_, i) => ({ description: `Line item ${i + 1} electrical component with a moderately long description`, qty: i + 1, unitPrice: '125.00', taxRate: 16, discount: '0' })) }));
  await write('invoice-long-description.pdf', base('invoice', { items: [{ description: 'A'.repeat(300), qty: 1, unitPrice: '100.00', taxRate: 16, discount: '0' }] }));
  await write('invoice-minimal-customer.pdf', base('invoice', { customer: { name: 'Walk-in Customer', address: '', phone: '', email: '', taxId: '' } }));
  await write('invoice-zero-total.pdf', base('invoice', { items: [{ description: 'Free promotional item', qty: 1, unitPrice: '0.00', taxRate: 0, discount: '0' }], notes: 'Zero-value document.' }));
  await write('invoice-large-amount.pdf', base('invoice', { items: [{ description: 'Large equipment package', qty: 1, unitPrice: '1234567.89', taxRate: 0, discount: '0' }] }));
  console.log('[pdf-fixtures] Generated 7 PDFs in out/ using stable renderer');
})().catch((err) => { console.error(err); process.exit(1); });
