/**
 * Canonical branding contract for every branded POS surface.
 * Company settings are the single visual source of truth. A document may overlay
 * branch identity and payment details, while stamp/signature and visual styling
 * always remain company-level.
 */
import { getApiUrl } from './api';
import { darkenHex, normalizeHex } from './theme';
import { fontStack, googleSpec } from './fonts';

export const COMPANY = {
  name: 'Unique Solar Kenya Ltd', tagline: 'Your Trusted Solar Energy Partner',
  address: 'Kamakis Corner, Eastern Bypass', city: 'Ruiru, Kiambu County, Kenya',
  phone: '+254 733 873 089', email: 'info@uniquesolarkenya.co.ke',
  kraPin: 'P052303835W', mpesa: '+254 733 873 089',
  primaryColor: '#1B4DA5', secondaryColor: '#F5A500',
  logoUrl: () => new URL(`${import.meta.env.BASE_URL}logo.jpg`, window.location.href).href,
} as const;

export interface BrandingData {
  business_name?: string | null; tagline?: string | null; business_address?: string | null;
  business_phone?: string | null; business_phone2?: string | null; business_email?: string | null;
  website?: string | null; logo_url?: string | null; primary_color?: string | null;
  secondary_color?: string | null; body_font?: string | null; heading_font?: string | null;
  tax_number?: string | null; vat_number?: string | null; document_footer?: string | null;
  stamp_url?: string | null; signature_url?: string | null; warranty_text?: string | null;
  return_policy?: string | null;
}

export interface ResolvedBranding {
  name: string; tagline: string; addressLine: string; phone: string; phone2: string;
  email: string; website: string; kraPin: string; vatNumber: string; logoUrl: string;
  primaryColor: string; secondaryColor: string; navyColor: string;
  bodyFontStack: string; headingFontStack: string; bodyFontGoogle: string | null;
  headingFontGoogle: string | null; documentFooter: string; warrantyText: string;
  returnPolicy: string; stampUrl: string; signatureUrl: string;
  paybillNumber: string; paybillAccount: string; tillNumber: string;
  bankName: string; bankAccountName: string; bankAccountNumber: string;
}

export interface BranchBranding {
  id?: number | string | null; name?: string | null; address?: string | null;
  county?: string | null; phone?: string | null; phone2?: string | null;
  email?: string | null; kra_pin?: string | null; logo_url?: string | null;
  receipt_footer?: string | null; invoice_footer?: string | null; quotation_footer?: string | null;
  paybill_number?: string | null; paybill_account?: string | null; till_number?: string | null;
  bank_name?: string | null; bank_account_name?: string | null; bank_account_number?: string | null;
}

export type DocumentType = 'invoice' | 'quotation' | 'receipt';
export type BranchLookup = { get: (id: number | string) => BranchBranding | undefined };

let cache: BrandingData | null = null;
export function setBrandingCache(data: BrandingData | null): void { cache = data; }

const clean = (v?: string | null): string => (v ?? '').trim();

/**
 * Convert every supported branding asset reference into an absolute browser URL.
 * Storage object keys may arrive as /objects/..., objects/..., storage/..., or
 * already-absolute URLs. Draft previews, print windows and PDF renderers then
 * consume the exact same resolved URL instead of relying on document-relative paths.
 */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  const value = clean(path);
  if (!value) return null;
  if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value;

  const api = getApiUrl();
  let relative = value;
  if (value.startsWith('objects/')) relative = `/storage/${value}`;
  else if (value.startsWith('/objects/')) relative = `storage${value}`;
  else if (value.startsWith('/storage/')) relative = value.slice(1);
  else if (value.startsWith('storage/')) relative = value;

  try {
    // Storage assets belong to the API origin. Other site-relative assets use
    // the application origin. This keeps the resolver valid in previews,
    // about:blank print windows and generated PDF/document contexts.
    const base = /^(?:storage\/|\/storage\/)/.test(relative)
      ? new URL(api, window.location.href).href
      : window.location.href;
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/** Company-level canonical branding. */
export function getBranding(): ResolvedBranding {
  const b = cache ?? {};
  const primary = normalizeHex(b.primary_color) ?? COMPANY.primaryColor;
  const secondary = normalizeHex(b.secondary_color) ?? COMPANY.secondaryColor;
  return {
    name: clean(b.business_name) || COMPANY.name,
    tagline: clean(b.tagline) || COMPANY.tagline,
    addressLine: clean(b.business_address) || `${COMPANY.address}, ${COMPANY.city}`,
    phone: clean(b.business_phone) || COMPANY.phone, phone2: clean(b.business_phone2),
    email: clean(b.business_email) || COMPANY.email, website: clean(b.website),
    kraPin: clean(b.tax_number) || COMPANY.kraPin, vatNumber: clean(b.vat_number),
    logoUrl: resolveAssetUrl(clean(b.logo_url) || null) || COMPANY.logoUrl(),
    primaryColor: primary, secondaryColor: secondary, navyColor: darkenHex(primary, 0.4),
    bodyFontStack: fontStack(b.body_font), headingFontStack: fontStack(b.heading_font),
    bodyFontGoogle: googleSpec(b.body_font), headingFontGoogle: googleSpec(b.heading_font),
    documentFooter: clean(b.document_footer), warrantyText: clean(b.warranty_text),
    returnPolicy: clean(b.return_policy), stampUrl: resolveAssetUrl(clean(b.stamp_url) || null) || '',
    signatureUrl: resolveAssetUrl(clean(b.signature_url) || null) || '',
    paybillNumber: '', paybillAccount: '', tillNumber: '', bankName: '', bankAccountName: '', bankAccountNumber: '',
  };
}

/** Canonical branch overlay used by receipts, invoices, quotations, print and PDF. */
export function brandingForBranch(base: ResolvedBranding, branch: BranchBranding | null | undefined, docType: DocumentType): ResolvedBranding {
  if (!branch) return base;
  const addressLine = [clean(branch.address), clean(branch.county)].filter(Boolean).join(', ');
  const footer = clean(docType === 'invoice' ? branch.invoice_footer : docType === 'quotation' ? branch.quotation_footer : branch.receipt_footer);
  return {
    ...base,
    name: clean(branch.name) || base.name, addressLine: addressLine || base.addressLine,
    phone: clean(branch.phone) || base.phone, phone2: clean(branch.phone2) || base.phone2,
    email: clean(branch.email) || base.email, kraPin: clean(branch.kra_pin) || base.kraPin,
    logoUrl: resolveAssetUrl(clean(branch.logo_url) || null) || base.logoUrl,
    documentFooter: footer || base.documentFooter,
    paybillNumber: clean(branch.paybill_number), paybillAccount: clean(branch.paybill_account),
    tillNumber: clean(branch.till_number), bankName: clean(branch.bank_name),
    bankAccountName: clean(branch.bank_account_name), bankAccountNumber: clean(branch.bank_account_number),
  };
}

/** Fail closed for sale receipts: never silently print the wrong branch identity. */
export function resolveSaleBranding(
  sale: { branch_id?: number | string | null }, branchMap: BranchLookup, docType: DocumentType = 'receipt',
): ResolvedBranding {
  const id = sale?.branch_id;
  if (id === null || id === undefined || id === '') {
    throw new Error('Branding contract violation: sale response is missing branch_id. Receipt rendering was blocked to prevent incorrect branch branding.');
  }
  const branch = branchMap.get(id);
  if (!branch) {
    throw new Error(`Branding contract violation: branch ${String(id)} is not available. Refresh branch data before rendering the document.`);
  }
  return brandingForBranch(getBranding(), branch, docType);
}
