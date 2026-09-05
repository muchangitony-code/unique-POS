/**
 * Central branding authority for the POS. All visual consumers resolve through
 * this module so stale database paths cannot bypass the current brand assets.
 */
import { getApiUrl } from './api';
import { darkenHex, normalizeHex } from './theme';
import { fontStack, googleSpec } from './fonts';

export const COMPANY = {
  name: 'Unique Solar Kenya Ltd',
  tagline: 'Your Trusted Solar Energy Partner',
  address: 'Kamakis Corner, Eastern Bypass',
  city: 'Ruiru, Kiambu County, Kenya',
  phone: '+254 733 873 089',
  email: 'info@uniquesolarkenya.co.ke',
  kraPin: 'P052303835W',
  primaryColor: '#1B4DA5',
  secondaryColor: '#F5A500',
  logoPath: '/logo.jpg',
  stampPath: '/company-stamp.svg',
  signaturePath: '/company-signature.svg',
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
}

export interface BranchBranding {
  name?: string | null; address?: string | null; county?: string | null; phone?: string | null;
  phone2?: string | null; email?: string | null; kra_pin?: string | null; logo_url?: string | null;
  receipt_footer?: string | null; invoice_footer?: string | null; quotation_footer?: string | null;
  paybill_number?: string | null; paybill_account?: string | null; till_number?: string | null;
  bank_name?: string | null; bank_account_name?: string | null; bank_account_number?: string | null;
}

let cache: BrandingData | null = null;
export function setBrandingCache(data: BrandingData | null): void { cache = data; }

const absolute = (path: string): string => {
  try { return new URL(path, window.location.href).href; } catch { return path; }
};

/** Normalize known legacy paths and make all document-window image URLs absolute. */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.trim();
  if (!clean) return null;
  // Earlier commits wrote these names/temporary object references but did not
  // actually commit the binary assets. Route them to the permanent replacements.
  if (clean === '/company-stamp.jpeg') return absolute(COMPANY.stampPath);
  if (clean === '/company-signature.jpeg') return absolute(COMPANY.signaturePath);
  if (clean.startsWith('/objects/uploads/bc678e6-25a2-40')) return absolute(COMPANY.logoPath);
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/objects/')) {
    const rel = `${getApiUrl()}storage${clean}`;
    return absolute(rel);
  }
  return absolute(clean);
}

const assetOrDefault = (value: string | null | undefined, fallback: string): string =>
  resolveAssetUrl(value) || absolute(fallback);

export function getBranding(): ResolvedBranding {
  const b = cache ?? {};
  const primary = normalizeHex(b.primary_color) ?? COMPANY.primaryColor;
  const secondary = normalizeHex(b.secondary_color) ?? COMPANY.secondaryColor;
  return {
    name: b.business_name || COMPANY.name,
    tagline: b.tagline || COMPANY.tagline,
    addressLine: b.business_address || `${COMPANY.address}, ${COMPANY.city}`,
    phone: b.business_phone || COMPANY.phone,
    phone2: b.business_phone2 || '',
    email: b.business_email || COMPANY.email,
    website: b.website || '',
    kraPin: b.tax_number || COMPANY.kraPin,
    vatNumber: b.vat_number || '',
    logoUrl: assetOrDefault(b.logo_url, COMPANY.logoPath),
    primaryColor: primary, secondaryColor: secondary, navyColor: darkenHex(primary, 0.4),
    bodyFontStack: fontStack(b.body_font), headingFontStack: fontStack(b.heading_font),
    bodyFontGoogle: googleSpec(b.body_font), headingFontGoogle: googleSpec(b.heading_font),
    documentFooter: b.document_footer || '', warrantyText: b.warranty_text || '',
    returnPolicy: b.return_policy || '',
    stampUrl: assetOrDefault(b.stamp_url, COMPANY.stampPath),
    signatureUrl: assetOrDefault(b.signature_url, COMPANY.signaturePath),
  };
}

export function brandingForBranch(base: ResolvedBranding, branch: BranchBranding | null | undefined, docType: 'invoice' | 'quotation' | 'receipt'): ResolvedBranding {
  if (!branch) return base;
  const clean = (v?: string | null): string => (v ?? '').trim();
  const addressLine = [clean(branch.address), clean(branch.county)].filter(Boolean).join(', ');
  const footer = clean(docType === 'invoice' ? branch.invoice_footer : docType === 'quotation' ? branch.quotation_footer : branch.receipt_footer);
  return {
    ...base,
    name: clean(branch.name) || base.name,
    addressLine: addressLine || base.addressLine,
    phone: clean(branch.phone) || base.phone,
    phone2: clean(branch.phone2) || base.phone2,
    email: clean(branch.email) || base.email,
    kraPin: clean(branch.kra_pin) || base.kraPin,
    logoUrl: assetOrDefault(clean(branch.logo_url) || null, base.logoUrl),
    documentFooter: footer || base.documentFooter,
  };
}
