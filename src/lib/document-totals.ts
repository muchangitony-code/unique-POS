export interface LineItemInput {
  product_id: number;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;   // per-line discount percentage
  vat_rate?: number;   // per-line VAT percentage
}

export interface ProcessedLine extends LineItemInput {
  discount: number;
  vat_rate: number;
  total: number;        // line total including VAT, after line discount
}

export interface DocumentTotals {
  processedItems: ProcessedLine[];
  subtotal: number;        // net of line discounts, excluding VAT
  taxAmount: number;       // total VAT
  discountAmount: number;  // line discounts + overall manual discount
  total: number;           // subtotal + VAT - manual discount
}

/**
 * Compute authoritative line and document totals.
 * VAT is applied on top of the (post-line-discount) net amount.
 * `manualDiscount` is an absolute amount deducted from the grand total.
 */
export function computeDocumentTotals(items: LineItemInput[], manualDiscount = 0): DocumentTotals {
  let subtotal = 0;
  let taxAmount = 0;
  let lineDiscountTotal = 0;

  const processedItems: ProcessedLine[] = items.map((item) => {
    const discount = Number(item.discount ?? 0);
    const vatRate = Number(item.vat_rate ?? 16);
    const qty = Number(item.quantity);
    const price = Number(item.unit_price);
    const lineSubtotal = qty * price;
    const lineDiscount = (lineSubtotal * discount) / 100;
    const afterDiscount = lineSubtotal - lineDiscount;
    const lineTax = (afterDiscount * vatRate) / 100;
    const lineTotal = afterDiscount + lineTax;
    subtotal += afterDiscount;
    taxAmount += lineTax;
    lineDiscountTotal += lineDiscount;
    return { ...item, discount, vat_rate: vatRate, total: round2(lineTotal) };
  });

  const manual = Math.max(0, Number(manualDiscount) || 0);
  const total = subtotal + taxAmount - manual;

  return {
    processedItems,
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    discountAmount: round2(lineDiscountTotal + manual),
    total: round2(Math.max(0, total)),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
