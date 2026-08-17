'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderPdfBuffer } = require('../server/pdf/index.cjs');

const out = path.join(process.cwd(), 'out');
fs.mkdirSync(out, { recursive: true });

const settings = {
  name: 'Unique Solar & General Supplies Limited',
  businessName: 'Unique Solar & General Supplies Limited',
  address: 'Eastern Bypass Kiambu, Kenya',
  phone: '+254 733 573089',
  email: 'info@uniquesolarkenya.co.ke',
  taxPin: 'P052303835W'
};

function payload(type) {
  return {
    settings,
    branch: { name: 'Main Branch' },
    documentType: type === 'invoice' ? 'Invoice' : 'Quotation',
    documentNumber: type === 'invoice' ? 'INV-2026-000005' : 'QUO-2026-000005',
    customer: {
      name: 'Walk-in Customer',
      company: '',
      address: '',
      phone: '',
      email: '',
      taxNumber: ''
    },
    meta: {
      // This is the same nesting used by resolveDocumentPayload() in index.cjs.
      date: '16/08/2026, 09:17:23',
      dueDate: type === 'invoice' ? '—' : '30/08/2026',
      validUntil: type === 'quotation' ? '30/08/2026' : undefined,
      paymentTerms: 'Due on receipt'
    },
    currency: 'KES',
    rows: [
      { productName: 'PDF download smoke-test item', quantity: '2', unitPrice: '2,500.00', taxRate: '16', discount: '0' }
    ]
  };
}

(async () => {
  for (const type of ['invoice', 'quotation']) {
    const pdf = await renderPdfBuffer(payload(type), 'a4');
    if (!Buffer.isBuffer(pdf) || pdf.length < 1000) throw new Error(`${type}: unified PDF renderer returned an empty/invalid buffer`);
    const file = path.join(out, `pdf-download-smoke-${type}.pdf`);
    fs.writeFileSync(file, pdf);
    console.log(`[pdf-download-smoke] generated ${file} (${pdf.length} bytes)`);
  }
})().catch((error) => {
  console.error('[pdf-download-smoke] FAILED:', error.stack || error.message || error);
  process.exit(1);
});
