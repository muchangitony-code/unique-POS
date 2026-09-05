/**
 * Print-document utilities for Unique Solar Kenya Ltd.
 * Opens a fresh browser window with fully self-contained HTML/CSS and triggers
 * the system print dialog — no external dependencies.
 */
import { getBranding, brandingForBranch, type ResolvedBranding, type BranchBranding } from './company';

const KES = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });

/** Escape a user-supplied string for safe insertion into HTML to prevent XSS. */
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── Payment details (sourced from Payment Settings, never hard-coded) ────────
export interface PaymentDetails {
  mpesa_paybill?: string | null;
  mpesa_paybill_account?: string | null;
  mpesa_till?: string | null;
  mpesa_buy_goods?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_swift_code?: string | null;
  other_payment_methods?: string | null;
  payment_instructions?: string | null;
}

/** Map a business-settings response into the PaymentDetails used by documents. */
export function toPaymentDetails(s: Partial<PaymentDetails> | null | undefined): PaymentDetails | undefined {
  if (!s) return undefined;
  return {
    mpesa_paybill: s.mpesa_paybill ?? null,
    mpesa_paybill_account: s.mpesa_paybill_account ?? null,
    mpesa_till: s.mpesa_till ?? null,
    mpesa_buy_goods: s.mpesa_buy_goods ?? null,
    bank_name: s.bank_name ?? null,
    bank_branch: s.bank_branch ?? null,
    bank_account_name: s.bank_account_name ?? null,
    bank_account_number: s.bank_account_number ?? null,
    bank_swift_code: s.bank_swift_code ?? null,
    other_payment_methods: s.other_payment_methods ?? null,
    payment_instructions: s.payment_instructions ?? null,
  };
}

/**
 * Merge a branch's own payment details over the company payment fallback.
 * When the branch has no payment details of its own, the company payment
 * settings are used unchanged. Otherwise each field prefers the branch value
 * and falls back to the company value so nothing renders empty.
 */
function branchPaymentOverride(
  base: PaymentDetails | null | undefined,
  branch?: BranchBranding | null,
): PaymentDetails | undefined {
  // Treat whitespace-only branch fields as blank so they fall back to company.
  const c = (v?: string | null): string | null => ((v ?? '').trim() || null);
  const hasBranchPay = Boolean(
    branch && (
      c(branch.paybill_number) || c(branch.paybill_account) || c(branch.till_number) ||
      c(branch.bank_name) || c(branch.bank_account_name) || c(branch.bank_account_number)
    )
  );
  if (!hasBranchPay) return base ?? undefined;
  return {
    mpesa_paybill: c(branch!.paybill_number) || base?.mpesa_paybill || null,
    mpesa_paybill_account: c(branch!.paybill_account) || base?.mpesa_paybill_account || null,
    mpesa_till: c(branch!.till_number) || base?.mpesa_till || null,
    mpesa_buy_goods: base?.mpesa_buy_goods || null,
    bank_name: c(branch!.bank_name) || base?.bank_name || null,
    bank_branch: base?.bank_branch || null,
    bank_account_name: c(branch!.bank_account_name) || base?.bank_account_name || null,
    bank_account_number: c(branch!.bank_account_number) || base?.bank_account_number || null,
    bank_swift_code: base?.bank_swift_code || null,
    other_payment_methods: base?.other_payment_methods || null,
    payment_instructions: base?.payment_instructions || null,
  };
}

/** True when at least one payment method has been configured. */
function hasPayment(p?: PaymentDetails | null): p is PaymentDetails {
  if (!p) return false;
  return Boolean(
    p.mpesa_paybill || p.mpesa_till || p.mpesa_buy_goods ||
    p.bank_name || p.bank_account_number || p.other_payment_methods ||
    p.payment_instructions
  );
}

/** Full payment lines for A4 documents (invoice / quotation). All values escaped. */
function paymentLines(p: PaymentDetails): string {
  const out: string[] = [];
  if (p.mpesa_paybill) out.push(`<p><strong>M-Pesa Paybill:</strong> ${esc(p.mpesa_paybill)}${p.mpesa_paybill_account ? ` &nbsp;·&nbsp; Acc: ${esc(p.mpesa_paybill_account)}` : ''}</p>`);
  if (p.mpesa_till) out.push(`<p><strong>M-Pesa Till:</strong> ${esc(p.mpesa_till)}</p>`);
  if (p.mpesa_buy_goods) out.push(`<p><strong>Buy Goods (Till):</strong> ${esc(p.mpesa_buy_goods)}</p>`);
  if (p.bank_name) out.push(`<p><strong>Bank:</strong> ${[p.bank_name, p.bank_branch].filter(Boolean).map(esc).join(' — ')}</p>`);
  if (p.bank_account_name) out.push(`<p><strong>Account Name:</strong> ${esc(p.bank_account_name)}</p>`);
  if (p.bank_account_number) out.push(`<p><strong>Account No:</strong> ${esc(p.bank_account_number)}</p>`);
  if (p.bank_swift_code) out.push(`<p><strong>SWIFT:</strong> ${esc(p.bank_swift_code)}</p>`);
  if (p.other_payment_methods) out.push(`<p>${esc(p.other_payment_methods)}</p>`);
  if (p.payment_instructions) out.push(`<p style="margin-top:4px">${esc(p.payment_instructions).replace(/\n/g, '<br/>')}</p>`);
  return out.join('');
}

/** Compact payment lines for the narrow receipt footer. All values escaped. */
function receiptPaymentLines(p: PaymentDetails): string {
  const out: string[] = [];
  if (p.mpesa_paybill) out.push(`<p>Paybill: ${esc(p.mpesa_paybill)}${p.mpesa_paybill_account ? ` (Acc ${esc(p.mpesa_paybill_account)})` : ''}</p>`);
  if (p.mpesa_till) out.push(`<p>Till: ${esc(p.mpesa_till)}</p>`);
  if (p.mpesa_buy_goods) out.push(`<p>Buy Goods: ${esc(p.mpesa_buy_goods)}</p>`);
  if (p.bank_name && p.bank_account_number) out.push(`<p>${esc(p.bank_name)}: ${esc(p.bank_account_number)}</p>`);
  if (p.other_payment_methods) out.push(`<p>${esc(p.other_payment_methods)}</p>`);
  if (p.payment_instructions) out.push(`<p>${esc(p.payment_instructions).replace(/\n/g, '<br/>')}</p>`);
  return out.join('');
}

/** Signature + stamp images shown in the "Authorized/Prepared By" block. */
function sigStampMarkup(b: ResolvedBranding): string {
  if (!b.signatureUrl && !b.stampUrl) return '';
  const parts: string[] = [];
  if (b.signatureUrl) parts.push(`<img src="${esc(b.signatureUrl)}" alt="Signature" style="max-height:44px;max-width:160px;object-fit:contain;display:block" />`);
  if (b.stampUrl) parts.push(`<img src="${esc(b.stampUrl)}" alt="Company Stamp" style="max-height:70px;max-width:120px;object-fit:contain;opacity:0.9" />`);
  return `<div style="display:flex;align-items:flex-end;gap:12px;height:74px">${parts.join('')}</div>`;
}

// ─── Shared CSS ──────────────────────────────────────────────────────────────
/** Build the base document CSS using the configured brand colours. */
function fontImports(b: ResolvedBranding): string {
  // Always load Inter (fallback) plus any configured brand fonts.
  const specs = new Set<string>(['Inter:wght@400;500;600;700']);
  if (b.bodyFontGoogle) specs.add(b.bodyFontGoogle);
  if (b.headingFontGoogle) specs.add(b.headingFontGoogle);
  return [...specs].map((s) => `@import url('https://fonts.googleapis.com/css2?family=${s}&display=swap');`).join('\n  ');
}

function baseCss(b: ResolvedBranding): string {
  return `
  ${fontImports(b)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${b.bodyFontStack}; color: #1a202c; background: #fff; font-size: 13px; line-height: 1.5; }
  h1, h2, h3, h4, h5, h6 { font-family: ${b.headingFontStack}; }
  :root {
    --blue: ${b.primaryColor}; --navy: ${b.navyColor}; --gold: ${b.secondaryColor};
    --gold-light: #FEF9E7; --gray: #6B7280; --light: #F8FAFC; --border: #E2E8F0;
  }
  .page { max-width: 794px; margin: 0 auto; padding: 32px 40px; min-height: 1123px; }
  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .company-logo { width: 80px; height: 80px; object-fit: contain; }
  .company-info h2 { font-size: 16px; font-weight: 700; color: var(--navy); }
  .company-info p { font-size: 11.5px; color: var(--gray); margin-top: 2px; }
  .doc-type-badge { background: var(--navy); color: white; text-align: right; padding: 12px 20px; border-radius: 8px; }
  .doc-type-badge h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
  .doc-type-badge p { font-size: 11.5px; color: rgba(255,255,255,0.75); margin-top: 2px; }
  /* Divider */
  .gold-bar { height: 4px; background: linear-gradient(90deg, var(--gold), var(--blue)); border-radius: 2px; margin: 20px 0; }
  /* Meta row */
  .meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .meta-box { background: var(--light); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .meta-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--gray); margin-bottom: 6px; }
  .meta-box p { font-size: 13px; font-weight: 500; color: #1a202c; }
  .meta-box p.small { font-size: 11.5px; color: var(--gray); font-weight: 400; }
  /* Items table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: var(--navy); }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: white; font-weight: 600; }
  thead th:last-child, thead th:nth-last-child(2), thead th:nth-last-child(3) { text-align: right; }
  tbody tr:nth-child(even) { background: var(--light); }
  tbody tr td { padding: 10px 12px; font-size: 12.5px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr td:last-child, tbody tr td:nth-last-child(2), tbody tr td:nth-last-child(3) { text-align: right; }
  /* Totals */
  .totals-row { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { min-width: 280px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .totals-line { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12.5px; border-bottom: 1px solid var(--border); }
  .totals-line:last-child { border-bottom: none; background: var(--navy); color: white; font-size: 14px; font-weight: 700; padding: 12px 16px; }
  /* Info boxes */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .info-box { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .info-box.gold { border-color: var(--gold); background: var(--gold-light); }
  .info-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--gray); margin-bottom: 8px; font-weight: 600; }
  .info-box.gold h3 { color: #92400E; }
  .info-box p { font-size: 12.5px; margin-top: 3px; }
  /* Signatures */
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; }
  .sig-block { }
  .sig-block p { font-size: 11.5px; color: var(--gray); margin-bottom: 6px; }
  .sig-line { border-bottom: 1.5px solid #94a3b8; height: 36px; }
  .sig-block span { font-size: 11px; color: var(--gray); }
  /* Footer */
  .doc-footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); }
  .doc-footer p { font-size: 11.5px; color: var(--gray); }
  .doc-footer strong { color: var(--navy); }
  /* Notes */
  .notes-box { background: var(--light); border-left: 3px solid var(--gold); padding: 10px 14px; border-radius: 0 6px 6px 0; margin-bottom: 20px; }
  .notes-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--gray); margin-bottom: 4px; }
  .notes-box p { font-size: 12.5px; }
  /* Status badge */
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
  .status-paid { background: #D1FAE5; color: #065F46; }
  .status-pending { background: #FEF3C7; color: #92400E; }
  .status-overdue { background: #FEE2E2; color: #991B1B; }
  @media print {
    @page { margin: 12mm 12mm; size: A4; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page { padding: 0; }
  }
`;
}

function openPrintWindow(html: string, title: string, css: string) {
  const pw = window.open('', '_blank', 'width=900,height=700');
  if (!pw) { alert('Please allow pop-ups to print documents.'); return; }
  pw.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title><style>${css}</style></head><body>${html}</body></html>`);
  pw.document.close();
  pw.focus();
  // slight delay so images can load before print dialog
  pw.onload = () => setTimeout(() => { pw.print(); }, 600);
  setTimeout(() => { try { pw.print(); } catch {} }, 1200);
}

// ─── Invoice ─────────────────────────────────────────────────────────────────
export interface PrintInvoice {
  invoice_number: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  created_at: string;
  due_date?: string | null;
  status: string;
  notes?: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    vat_rate: number;
    total: number;
  }>;
  subtotal: number;
  discount_amount?: number;
  tax_amount?: number;
  total: number;
  amount_paid?: number;
  balance_due?: number;
  payment?: PaymentDetails | null;
}

export function printInvoice(inv: PrintInvoice, branch?: BranchBranding | null) {
  const b = brandingForBranch(getBranding(), branch, 'invoice');
  const payment = branchPaymentOverride(inv.payment, branch);
  const logo = b.logoUrl;
  const contactLine = [b.phone, b.phone2].filter(Boolean).join(' / ');
  const statusClass = inv.status === 'paid' ? 'status-paid' : inv.status === 'overdue' ? 'status-overdue' : 'status-pending';

  const itemRows = inv.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.product_name)}</td>
      <td style="text-align:right">${it.quantity}</td>
      <td style="text-align:right">${KES(it.unit_price)}</td>
      <td style="text-align:right">${it.vat_rate}%</td>
      <td style="text-align:right; font-weight:600">${KES(it.total)}</td>
    </tr>`).join('');

  const vat = inv.tax_amount ?? inv.items.reduce((s, it) => s + (it.total * it.vat_rate / (100 + it.vat_rate)), 0);
  const subtotalEx = inv.subtotal ?? (inv.total - vat);
  const invNum = esc(inv.invoice_number);

  const html = `
<div class="page">
  <div class="doc-header">
    <div style="display:flex;gap:16px;align-items:flex-start">
      <img class="company-logo" src="${esc(logo)}" alt="Logo" />
      <div class="company-info">
        <h2>${esc(b.name)}</h2>
        <p>${esc(b.addressLine)}</p>
        <p>Tel: ${esc(contactLine)} &nbsp;|&nbsp; ${esc(b.email)}</p>
        ${b.website ? `<p>${esc(b.website)}</p>` : ''}
        <p>KRA PIN: ${esc(b.kraPin)}${b.vatNumber ? ` &nbsp;·&nbsp; VAT: ${esc(b.vatNumber)}` : ''}</p>
      </div>
    </div>
    <div class="doc-type-badge">
      <h1>TAX INVOICE</h1>
      <p>${invNum}</p>
      <p style="margin-top:6px"><span class="status-badge ${statusClass}">${esc(inv.status).toUpperCase()}</span></p>
    </div>
  </div>
  <div class="gold-bar"></div>

  <div class="meta-row">
    <div class="meta-box">
      <h3>Billed To</h3>
      <p>${esc(inv.customer_name) || 'Walk-in Customer'}</p>
      ${inv.customer_email ? `<p class="small">${esc(inv.customer_email)}</p>` : ''}
      ${inv.customer_phone ? `<p class="small">${esc(inv.customer_phone)}</p>` : ''}
    </div>
    <div class="meta-box">
      <h3>Invoice Details</h3>
      <p>Invoice No: <strong>${invNum}</strong></p>
      <p class="small">Date: ${fmtDate(inv.created_at)}</p>
      ${inv.due_date ? `<p class="small">Due: ${fmtDate(inv.due_date)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>VAT</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-row">
    <div class="totals-box">
      <div class="totals-line"><span>Subtotal (excl. VAT)</span><span>${KES(subtotalEx)}</span></div>
      <div class="totals-line"><span>VAT</span><span>${KES(vat)}</span></div>
      ${inv.discount_amount ? `<div class="totals-line"><span>Discount</span><span>- ${KES(inv.discount_amount)}</span></div>` : ''}
      ${inv.amount_paid ? `<div class="totals-line"><span>Amount Paid</span><span>${KES(inv.amount_paid)}</span></div>` : ''}
      <div class="totals-line"><span>TOTAL DUE</span><span>${KES(inv.balance_due ?? inv.total)}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box gold">
      <h3>Payment Information</h3>
      ${hasPayment(payment) ? paymentLines(payment) : ''}
      <p style="margin-top:${hasPayment(payment) ? '6px' : '0'}"><strong>Account Ref:</strong> ${invNum}</p>
      <p style="margin-top:6px; font-size:11px; color:#92400E">Please quote invoice number as reference</p>
    </div>
    <div class="info-box">
      <h3>Terms &amp; Conditions</h3>
      <p>Payment is due by the date shown above.</p>
      <p>Late payments may attract a penalty.</p>
      <p>Goods remain property of ${esc(b.name)} until fully paid.</p>
      ${b.warrantyText ? `<p style="margin-top:6px"><strong>Warranty:</strong> ${esc(b.warrantyText)}</p>` : ''}
      ${b.returnPolicy ? `<p style="margin-top:6px"><strong>Returns:</strong> ${esc(b.returnPolicy)}</p>` : ''}
    </div>
  </div>

  ${inv.notes ? `<div class="notes-box"><h3>Notes</h3><p>${esc(inv.notes)}</p></div>` : ''}

  <div class="sig-row">
    <div class="sig-block">
      <p>Authorized By</p>
      ${sigStampMarkup(b)}
      <div class="sig-line"></div>
      <span>Name / Signature / Date</span>
    </div>
    <div class="sig-block">
      <p>Received By (Customer)</p>
      <div class="sig-line" style="margin-top:44px"></div>
      <span>Name / Signature / Date</span>
    </div>
  </div>

  <div class="doc-footer">
    <p><strong>${esc(b.name)}</strong> &nbsp;·&nbsp; ${esc(b.addressLine)}</p>
    <p>${esc(contactLine)} &nbsp;·&nbsp; ${esc(b.email)} &nbsp;·&nbsp; KRA PIN: ${esc(b.kraPin)}</p>
    <p style="margin-top:8px; color:var(--blue); font-weight:600">${esc(b.documentFooter || `Thank you for choosing ${b.name}!`)}</p>
  </div>
</div>`;

  openPrintWindow(html, `Invoice ${inv.invoice_number}`, baseCss(b));
}

// ─── Quotation ────────────────────────────────────────────────────────────────
export interface PrintQuotation {
  quotation_number: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  created_at: string;
  valid_until?: string | null;
  status: string;
  notes?: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    vat_rate: number;
    total: number;
  }>;
  subtotal: number;
  total: number;
  payment?: PaymentDetails | null;
}

export function printQuotation(q: PrintQuotation, branch?: BranchBranding | null) {
  const b = brandingForBranch(getBranding(), branch, 'quotation');
  const payment = branchPaymentOverride(q.payment, branch);
  const logo = b.logoUrl;
  const contactLine = [b.phone, b.phone2].filter(Boolean).join(' / ');
  const statusClass = q.status === 'accepted' ? 'status-paid' : q.status === 'expired' || q.status === 'rejected' ? 'status-overdue' : 'status-pending';
  const vat = q.items.reduce((s, it) => s + (it.total * it.vat_rate / (100 + it.vat_rate)), 0);

  const itemRows = q.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.product_name)}</td>
      <td style="text-align:right">${it.quantity}</td>
      <td style="text-align:right">${KES(it.unit_price)}</td>
      <td style="text-align:right">${it.vat_rate}%</td>
      <td style="text-align:right; font-weight:600">${KES(it.total)}</td>
    </tr>`).join('');

  const qNum = esc(q.quotation_number);

  const html = `
<div class="page">
  <div class="doc-header">
    <div style="display:flex;gap:16px;align-items:flex-start">
      <img class="company-logo" src="${esc(logo)}" alt="Logo" />
      <div class="company-info">
        <h2>${esc(b.name)}</h2>
        <p>${esc(b.addressLine)}</p>
        <p>Tel: ${esc(contactLine)} &nbsp;|&nbsp; ${esc(b.email)}</p>
        ${b.website ? `<p>${esc(b.website)}</p>` : ''}
        <p>KRA PIN: ${esc(b.kraPin)}${b.vatNumber ? ` &nbsp;·&nbsp; VAT: ${esc(b.vatNumber)}` : ''}</p>
      </div>
    </div>
    <div class="doc-type-badge" style="background:linear-gradient(135deg,var(--blue),var(--navy))">
      <h1>QUOTATION</h1>
      <p>${qNum}</p>
      <p style="margin-top:6px"><span class="status-badge ${statusClass}">${esc(q.status).toUpperCase()}</span></p>
    </div>
  </div>
  <div class="gold-bar"></div>

  <div class="meta-row">
    <div class="meta-box">
      <h3>Prepared For</h3>
      <p>${esc(q.customer_name) || 'Valued Customer'}</p>
      ${q.customer_email ? `<p class="small">${esc(q.customer_email)}</p>` : ''}
      ${q.customer_phone ? `<p class="small">${esc(q.customer_phone)}</p>` : ''}
    </div>
    <div class="meta-box">
      <h3>Quotation Details</h3>
      <p>Quote No: <strong>${qNum}</strong></p>
      <p class="small">Date: ${fmtDate(q.created_at)}</p>
      ${q.valid_until ? `<p class="small" style="color:#92400E">Valid Until: <strong>${fmtDate(q.valid_until)}</strong></p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>VAT</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-row">
    <div class="totals-box">
      <div class="totals-line"><span>Subtotal (excl. VAT)</span><span>${KES(q.subtotal - vat)}</span></div>
      <div class="totals-line"><span>VAT</span><span>${KES(vat)}</span></div>
      <div class="totals-line"><span>QUOTATION TOTAL</span><span>${KES(q.total)}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h3>Terms &amp; Conditions</h3>
      <p>1. This quotation is valid for the period stated above.</p>
      <p>2. Prices are subject to change without prior notice.</p>
      <p>3. 50% deposit required to confirm order.</p>
      <p>4. Delivery timeline to be confirmed upon order placement.</p>
    </div>
    <div class="info-box gold">
      <h3>To Accept This Quotation</h3>
      <p>Contact us at: <strong>${esc(contactLine)}</strong></p>
      <p>Email: <strong>${esc(b.email)}</strong></p>
      ${hasPayment(payment) ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #F5C842"><h3 style="margin-bottom:6px">Payment Details</h3>${paymentLines(payment)}</div>` : ''}
      <p style="margin-top:6px; font-size:11px;color:#92400E">Quote your quotation number when responding</p>
    </div>
  </div>

  ${q.notes ? `<div class="notes-box"><h3>Notes</h3><p>${esc(q.notes)}</p></div>` : ''}
  ${(b.warrantyText || b.returnPolicy) ? `<div class="notes-box"><h3>Warranty &amp; Returns</h3>${b.warrantyText ? `<p><strong>Warranty:</strong> ${esc(b.warrantyText)}</p>` : ''}${b.returnPolicy ? `<p><strong>Returns:</strong> ${esc(b.returnPolicy)}</p>` : ''}</div>` : ''}

  <div class="sig-row">
    <div class="sig-block">
      <p>Prepared By</p>
      ${sigStampMarkup(b)}
      <div class="sig-line"></div>
      <span>Name / Signature / Date</span>
    </div>
    <div class="sig-block">
      <p>Customer Acceptance</p>
      <div class="sig-line" style="margin-top:44px"></div>
      <span>Name / Signature / Date</span>
    </div>
  </div>

  <div class="doc-footer">
    <p><strong>${esc(b.name)}</strong> &nbsp;·&nbsp; ${esc(b.addressLine)}</p>
    <p>${esc(contactLine)} &nbsp;·&nbsp; ${esc(b.email)} &nbsp;·&nbsp; KRA PIN: ${esc(b.kraPin)}</p>
    <p style="margin-top:8px; color:var(--blue); font-weight:600">${esc(b.documentFooter || `Thank you for considering ${b.name}!`)}</p>
  </div>
</div>`;

  openPrintWindow(html, `Quotation ${esc(q.quotation_number)}`, baseCss(b));
}

// ─── Receipt ─────────────────────────────────────────────────────────────────
export interface PrintReceipt {
  receipt_number: string;
  cashier_name?: string | null;
  customer_name?: string | null;
  created_at: string;
  payment_method: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number; total: number }>;
  subtotal: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  change: number;
  payment?: PaymentDetails | null;
}

export function printReceipt(r: PrintReceipt, branch?: BranchBranding | null) {
  const b = brandingForBranch(getBranding(), branch, 'receipt');
  const payment = branchPaymentOverride(r.payment, branch);
  const logo = b.logoUrl;
  const itemRows = r.items.map(it => `
    <tr>
      <td>${esc(it.product_name)}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:right">${KES(it.unit_price)}</td>
      <td style="text-align:right; font-weight:600">${KES(it.total)}</td>
    </tr>`).join('');

  const pmLabel: Record<string, string> = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank_transfer: 'Bank Transfer', credit: 'Credit' };
  const pmDisplay = esc(pmLabel[r.payment_method] ?? r.payment_method);
  const rcptNum = esc(r.receipt_number);

  const html = `
<style>
  ${fontImports(b)}
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family:${b.bodyFontStack}; background:#fff; color:#1a202c; font-size:12px; }
  h1, h2, h3, h4, h5, h6 { font-family:${b.headingFontStack}; }
  .receipt { max-width:320px; margin:0 auto; padding:20px 16px; }
  .receipt-header { text-align:center; margin-bottom:14px; }
  .receipt-header img { width:64px; height:64px; object-fit:contain; }
  .receipt-header h1 { font-size:14px; font-weight:700; color:${b.navyColor}; margin-top:6px; }
  .receipt-header p { font-size:10.5px; color:#6B7280; }
  .receipt-header .rcpt-no { background:${b.navyColor}; color:white; font-size:11px; font-weight:600; padding:4px 12px; border-radius:20px; display:inline-block; margin-top:8px; }
  .dashed { border-top:1px dashed #CBD5E0; margin:12px 0; }
  table { width:100%; border-collapse:collapse; }
  thead th { font-size:10px; text-transform:uppercase; color:#6B7280; padding:4px 2px; border-bottom:1px solid #E2E8F0; }
  thead th:last-child, thead th:nth-last-child(2) { text-align:right; }
  tbody td { padding:6px 2px; font-size:11.5px; border-bottom:1px solid #F7FAFC; }
  tbody td:last-child, tbody td:nth-last-child(2) { text-align:right; }
  .totals { margin-top:10px; }
  .total-line { display:flex; justify-content:space-between; padding:3px 0; font-size:11.5px; }
  .total-line.grand { font-size:14px; font-weight:700; color:${b.navyColor}; border-top:2px solid ${b.navyColor}; padding-top:8px; margin-top:4px; }
  .total-line.change { color:#065F46; font-weight:600; }
  .payment-pill { display:inline-block; background:${b.secondaryColor}; color:#1a202c; font-size:10px; font-weight:700; padding:3px 10px; border-radius:20px; margin-top:6px; text-transform:uppercase; letter-spacing:0.5px; }
  .footer { text-align:center; margin-top:16px; padding-top:12px; border-top:1px dashed #CBD5E0; }
  .footer p { font-size:10.5px; color:#6B7280; }
  .footer .brand { font-size:11px; font-weight:600; color:${b.navyColor}; margin-top:4px; }
  @media print { @page { size:80mm auto; margin:4mm; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print { display:none; } }
</style>
<div class="receipt">
  <div class="receipt-header">
    <img src="${esc(logo)}" alt="Logo" />
    <h1>${esc(b.name)}</h1>
    <p>${esc(b.addressLine)}</p>
    <p>${esc(b.phone)}</p>
    <span class="rcpt-no">Receipt: ${rcptNum}</span>
  </div>
  <div class="dashed"></div>
  <p style="font-size:10.5px;color:#6B7280;margin-bottom:6px">Date: ${fmtDate(r.created_at)} &nbsp;|&nbsp; Cashier: ${esc(r.cashier_name) || 'Staff'}</p>
  ${r.customer_name ? `<p style="font-size:10.5px;color:#6B7280;margin-bottom:6px">Customer: ${esc(r.customer_name)}</p>` : ''}
  <table>
    <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="dashed"></div>
  <div class="totals">
    <div class="total-line"><span>Subtotal</span><span>${KES(r.subtotal)}</span></div>
    ${r.discount_amount > 0 ? `<div class="total-line"><span>Discount</span><span>- ${KES(r.discount_amount)}</span></div>` : ''}
    <div class="total-line"><span>VAT (incl.)</span><span>—</span></div>
    <div class="total-line grand"><span>TOTAL</span><span>${KES(r.total)}</span></div>
    <div class="total-line" style="margin-top:8px"><span>Paid (${pmDisplay})</span><span>${KES(r.amount_paid)}</span></div>
    ${r.change > 0 ? `<div class="total-line change"><span>Change</span><span>${KES(r.change)}</span></div>` : ''}
    <div style="text-align:center;margin-top:8px"><span class="payment-pill">${pmDisplay}</span></div>
  </div>
  <div class="footer">
    ${hasPayment(payment) ? receiptPaymentLines(payment) : ''}
    <p>KRA PIN: ${esc(b.kraPin)}</p>
    <p style="margin-top:8px">${esc(b.documentFooter || 'Thank you for your business!')}</p>
    <p class="brand">${esc(b.name)}</p>
  </div>
</div>`;

  openPrintWindow(html, `Receipt ${rcptNum}`, '');
}
