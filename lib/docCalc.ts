/**
 * Client-side document totals — mirrors the server's computeDocumentTotals so the
 * wizard preview matches what the backend will store. VAT is applied on top of the
 * post-line-discount net; the manual discount is an absolute amount off the total.
 */
export interface DocLine {
  product_id: number;
  product_name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  discount: number; // per-line %
  vat_rate: number; // per-line %
}

export interface DocTotals {
  subtotal: number;       // net of line discounts, excl. VAT
  taxAmount: number;      // total VAT
  lineDiscount: number;   // sum of per-line discounts
  manualDiscount: number; // absolute overall discount
  discountAmount: number; // lineDiscount + manualDiscount
  total: number;          // subtotal + VAT - manualDiscount
}

export function lineTotal(line: DocLine): number {
  const lineSubtotal = line.quantity * line.unit_price;
  const lineDiscount = (lineSubtotal * (line.discount || 0)) / 100;
  const afterDiscount = lineSubtotal - lineDiscount;
  const lineTax = (afterDiscount * (line.vat_rate || 0)) / 100;
  return round2(afterDiscount + lineTax);
}

export function computeTotals(lines: DocLine[], manualDiscount = 0): DocTotals {
  let subtotal = 0;
  let taxAmount = 0;
  let lineDiscount = 0;
  for (const line of lines) {
    const lineSubtotal = line.quantity * line.unit_price;
    const disc = (lineSubtotal * (line.discount || 0)) / 100;
    const afterDiscount = lineSubtotal - disc;
    const tax = (afterDiscount * (line.vat_rate || 0)) / 100;
    subtotal += afterDiscount;
    taxAmount += tax;
    lineDiscount += disc;
  }
  const manual = Math.max(0, Number(manualDiscount) || 0);
  return {
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    lineDiscount: round2(lineDiscount),
    manualDiscount: round2(manual),
    discountAmount: round2(lineDiscount + manual),
    total: round2(Math.max(0, subtotal + taxAmount - manual)),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
