'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { renderPdfBuffer, renderZReportPdf } = require('../server/pdf-engine.cjs');

const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });

function makePayload(zero, paper) {
  const rows = Array.from({ length: 64 }, (_, i) => {
    const price = zero ? 0 : i === 0 ? 1234567.89 : 1850 + i * 37.25;
    const quantity = zero ? (i % 4) + 1 : (i % 5) + 1;
    return {
      itemCode: `EL-${String(i + 1).padStart(4, '0')}`,
      description: `Industrial ${i + 1} — Heavy-Duty Solar Flood Light 200W IP66 with Extra-Long Description for Layout Stress Testing`,
      quantity, unit: 'pcs', unitPrice: price, discount: 0, vatRate: 16,
      total: zero ? 0 : price * quantity
    };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    paper, documentType: paper === 'a4' ? 'Tax Invoice' : 'Receipt',
    documentNumber: zero ? 'ZERO-0001' : `STRESS-${paper}`, documentDate: '2026-08-15', dueDate: '2026-08-29', dueDateLabel: 'Due Date', currency: 'KES',
    company: { name: 'Unique Solar Kenya Ltd', address: 'Kenol, Murang’a County, Kenya', phone: '+254 700 123 456', email: 'info@uniquesolarkenyaltd.co.ke', website: 'www.uniquesolarkenyaltd.co.ke', taxPin: 'P051234567A', primaryColor: '#083D6D', secondaryColor: '#F7931E' },
    branchName: 'Main Branch', customerName: 'José Müller — Société Électrique × Nairobi', customerCompany: 'Müller & Fils Électrique Ltd', customerAddress: '12 Waiyaki Way, Nairobi, Kenya', customerPhone: '+254 711 222 333', customerEmail: 'jose@example.test', customerTaxNumber: 'P098765432B',
    salesperson: 'Anthony Muchangi', reference: 'QA / Unicode / 60+ line stress test', paymentTerms: 'Due on receipt', paymentMethod: 'M-PESA', amountPaid: zero ? 0 : subtotal, changeAmount: 0,
    rows, totals: { subtotal, discount: 0, tax: zero ? 0 : subtotal * 0.16, shipping: 0, total: zero ? 0 : subtotal * 1.16 },
    payment: { mpesaPaybill: '400200', mpesaAccount: 'INVOICE-TEST', mpesaTill: '123456', bankName: 'Example Bank', bankBranch: 'Nairobi', bankAccountName: 'Unique Solar Kenya Ltd', bankAccountNumber: '0123456789' },
    notesSections: [['Warranty', 'Warranty applies where specified.'], ['Return Policy', 'Returns subject to standard shop policy.']],
    termsLines: ['Prices are in KES.', 'Goods remain the property of the seller until paid in full.', 'Warranty applies where specified.', 'Returns are subject to our return policy.', 'Errors and Omissions Excepted (E&OE).']
  };
}

(async () => {
  for (const paper of ['a4', '58mm', '80mm']) {
    for (const zero of [false, true]) {
      const pdf = await renderPdfBuffer(makePayload(zero, paper), paper);
      fs.writeFileSync(path.join(out, `${paper}-${zero ? 'zero-total' : 'stress'}.pdf`), pdf);
    }
  }
  const z = await renderZReportPdf({
    documentNumber: 'Z-20260815-001', date: '2026-08-15', currency: 'KES', branchName: 'Main Branch',
    company: { name: 'Unique Solar Kenya Ltd', address: 'Kenol, Murang’a County, Kenya', phone: '+254 700 123 456', email: 'info@uniquesolarkenyaltd.co.ke', primaryColor: '#083D6D', secondaryColor: '#F7931E' },
    totalSales: 9876543.21, totalTransactions: 164, averageOrderValue: 60222.82,
    byPaymentMethod: [{ method: 'M-PESA', amount: 6000000, count: 90 }, { method: 'Cash', amount: 2345678.21, count: 50 }, { method: 'Bank', amount: 530865, count: 24 }],
    dailyBreakdown: [{ date: '2026-08-15', total: 9876543.21, count: 164 }]
  });
  fs.writeFileSync(path.join(out, 'z-report-stress.pdf'), z);
  console.log('Generated PDF stress samples.');
})();
