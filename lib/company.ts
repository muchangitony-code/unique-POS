/**
 * Company branding used across all branded documents (quotations, invoices,
 * receipts, sidebar, login, emails). Values are managed by super administrators
 * under Settings → Company Branding and cached here so plain functions such as
 * the print utilities can read the latest branding without a React hook.
 *
 * The COMPANY constants below are fallback defaults only — used before the
 * branding endpoint responds, or when a field has not been configured.
 */
import { getApiUrl } from './api';
import { darkenHex, normalizeHex } from './theme';
import { fontStack, googleSpec } from './fonts';

/** Fallback defaults — Unique Solar Kenya Ltd. */
export const COMPANY = {
  name:    'Unique Solar Kenya Ltd',
  tagline: 'Your Trusted Solar Energy Partner',
  address: 'Kamakis Corner, Eastern Bypass',
  city:    'Ruiru, Kiambu County, Kenya',
  phone:   '+254 733 873 089',
  email:   'info@uniquesolarkenya.co.ke',
  kraPin:  'P052303835W',
  mpesa:   '+254 733 873 089',
  primaryColor:   '#1B4DA5',
  secondaryColor: '#F5A500',
  /** Absolute URL to the public logo, works in both app context and print windows */
  logoUrl: () => new URL(`${import.meta.env.BASE_URL}logo.jpg`, window.location.href).href,
} as const;

/** Shape of the public branding payload returned by GET /settings/branding. */
export interface BrandingData {
  business_name?: string | null;
  tagline?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_phone2?: string | null;
  business_email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  body_font?: string | null;
  heading_font?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  document_footer?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  warranty_text?: string | null;
  return_policy?: string | null;
}

/** Fully-resolved branding with fallbacks applied — safe for direct rendering. */
export interface ResolvedBranding {
  name: string;
  tagline: string;
  addressLine: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  kraPin: string;
  vatNumber: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  navyColor: string;
  /** CSS font-family stacks resolved from the configured brand fonts. */
  bodyFontStack: string;
  headingFontStack: string;
  /** Google Fonts specifiers for the chosen fonts (null when system/default). */
  bodyFontGoogle: string | null;
  headingFontGoogle: string | null;
  documentFooter: string;
  warrantyText: string;
  returnPolicy: string;
  stampUrl: string;
  signatureUrl: string;
}

/**
 * Minimal per-branch identity used to brand a single document. Structurally
 * compatible with the generated `Branch` type, so a full branch record can be
 * passed directly.
 */
export interface BranchBranding {
  name?: string | null;
  address?: string | null;
  county?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  kra_pin?: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
  invoice_footer?: string | null;
  quotation_footer?: string | null;
  paybill_number?: string | null;
  paybill_account?: string | null;
  till_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
}

let cache: BrandingData | null = null;

/** Update the module-level branding cache (called by BrandingProvider). */
export function setBrandingCache(data: BrandingData | null): void {
  cache = data;
}

/**
 * Resolve a stored object path or URL into an absolute, browser-usable URL.
 * Object-storage paths (e.g. `/objects/uploads/xyz`) are served through the API
 * at `/api/storage/objects/…`; absolute URLs are returned unchanged.
 */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/objects/')) {
    // getApiUrl() ends with a trailing slash, e.g. "/api/"
    const rel = `${getApiUrl()}storage${path}`;
    try {
      return new URL(rel, window.location.href).href;
    } catch {
      return rel;
    }
  }
  // A public asset served from the app (e.g. "/logo.jpg")
  try {
    return new URL(path, window.location.href).href;
  } catch {
    return path;
  }
}

/** Merge cached branding with defaults into a fully-resolved branding object. */
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
    logoUrl: resolveAssetUrl(b.logo_url) || COMPANY.logoUrl(),
    primaryColor: primary,
    secondaryColor: secondary,
    navyColor: darkenHex(primary, 0.4),
    bodyFontStack: fontStack(b.body_font),
    headingFontStack: fontStack(b.heading_font),
    bodyFontGoogle: googleSpec(b.body_font),
    headingFontGoogle: googleSpec(b.heading_font),
    documentFooter: b.document_footer || '',
    warrantyText: b.warranty_text || '',
    returnPolicy: b.return_policy || '',
    stampUrl: resolveAssetUrl(b.stamp_url) || '',
    signatureUrl: resolveAssetUrl(b.signature_url) || '',
  };
}

/**
 * Layer a branch's own identity over the company-resolved branding for a single
 * document. Blank branch fields fall back to the company value so nothing
 * renders empty. `docType` selects the branch-specific footer (with the company
 * document footer as fallback). Visual identity (colours, fonts, stamp,
 * signature, warranty, VAT, website) always stays company-level.
 */
export function brandingForBranch(
  base: ResolvedBranding,
  branch: BranchBranding | null | undefined,
  docType: 'invoice' | 'quotation' | 'receipt',
): ResolvedBranding {
  if (!branch) return base;
  // Treat whitespace-only branch fields as blank so they fall back to company.
  const clean = (v?: string | null): string => (v ?? '').trim();
  const addressLine = [clean(branch.address), clean(branch.county)].filter(Boolean).join(', ');
  const footer = clean(
    docType === 'invoice' ? branch.invoice_footer
    : docType === 'quotation' ? branch.quotation_footer
    : branch.receipt_footer,
  );
  return {
    ...base,
    name: clean(branch.name) || base.name,
    addressLine: addressLine || base.addressLine,
    phone: clean(branch.phone) || base.phone,
    phone2: clean(branch.phone2) || base.phone2,
    email: clean(branch.email) || base.email,
    kraPin: clean(branch.kra_pin) || base.kraPin,
    logoUrl: resolveAssetUrl(clean(branch.logo_url) || null) || base.logoUrl,
    documentFooter: footer || base.documentFooter,
  };
}
