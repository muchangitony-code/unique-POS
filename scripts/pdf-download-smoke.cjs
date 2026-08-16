'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderLegacyPdf } = require('../server/pdf/legacy.cjs');

const out = path.join(process.cwd(), 'out');
fs.mkdirSync(out, { recursive: true });

const company = {
  name: 'Unique Solar & General Supplies Limited',
  address: 'Eastern Bypass Kiambu, Kenya',
  phone: '+254 733 573089',
  email: 'info@uniquesolarkenya.co.ke',
  taxPin: 'P052303835W'
};

const payload = {
  documentType: 'invoice',
  documentNumber: 'INV-2026-000005',
  // Deliberately use the same human-readable date shape visible in the POS preview.
  documentDate: '16/08/2026, 09:17:23',
  dueDate: '—',
  customerName: 'Walk-in Customer',
  currency: 'KES',
  rows: [
    { productName: 'PDF download smoke-test item', quantity: '2', unitPrice: '2,500.00', taxRate: '16', discount: '0' }
  ],
  company
};

(async () => {
  const pdf = await renderLegacyPdf(payload, 'a4');
  if (!Buffer.isBuffer(pdf) || pdf.length < 1000) throw new Error('Legacy PDF renderer returned an empty/invalid buffer');
  const file = path.join(out, 'pdf-download-smoke.pdf');
  fs.writeFileSync(file, pdf);
  console.log(`[pdf-download-smoke] generated ${file} (${pdf.length} bytes)`);
})().catch((error) => {
  console.error('[pdf-download-smoke] FAILED:', error.stack || error.message || error);
  process.exit(1);
});
