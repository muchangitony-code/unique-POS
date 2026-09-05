/**
 * Build prefilled Email (mailto) and WhatsApp (wa.me) share links for a document.
 * These open the user's mail client / WhatsApp with a ready-to-send message —
 * automated SMTP/WhatsApp API delivery is intentionally out of scope.
 */
import { COMPANY } from './company';
import { formatCurrency } from './format';

interface ShareDoc {
  kind: 'Quotation' | 'Invoice';
  number: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  total: number;
}

function messageBody(doc: ShareDoc): string {
  const lines = [
    `Dear ${doc.customerName || 'Customer'},`,
    ``,
    `Please find ${doc.kind === 'Invoice' ? 'invoice' : 'quotation'} ${doc.number} from ${COMPANY.name}.`,
    `Total: ${formatCurrency(doc.total)}`,
    ``,
    `Thank you for choosing ${COMPANY.name}. Powering Homes. Empowering Businesses.`,
    ``,
    `${COMPANY.phone} · ${COMPANY.email}`,
  ];
  return lines.join('\n');
}

export function emailDocumentUrl(doc: ShareDoc): string {
  const subject = `${doc.kind} ${doc.number} — ${COMPANY.name}`;
  const to = doc.customerEmail || '';
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody(doc))}`;
}

/** Normalise a Kenyan phone number to international format for wa.me. */
function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = `254${p.slice(1)}`;
  else if (p.startsWith('7') || p.startsWith('1')) p = `254${p}`;
  return p;
}

export function whatsappDocumentUrl(doc: ShareDoc): string {
  const phone = normalizePhone(doc.customerPhone);
  const base = phone ? `https://wa.me/${phone}` : `https://wa.me/`;
  return `${base}?text=${encodeURIComponent(messageBody(doc))}`;
}
