import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useGetBranding } from '@workspace/api-client-react';
import { getBranding, setBrandingCache, type ResolvedBranding, type BrandingData } from '@/lib/company';
import { hexToHslTriplet, normalizeHex, darkenHex } from '@/lib/theme';
import { fontStack, loadFont } from '@/lib/fonts';

const HEADING_STYLE_ID = 'brand-heading-font';

/** Apply the configured body/heading fonts app-wide as CSS variables. */
function applyFonts(bodyFont: string | null | undefined, headingFont: string | null | undefined) {
  const root = document.documentElement;
  loadFont(bodyFont);
  loadFont(headingFont);
  // Body font drives the whole app via the existing --app-font-sans variable.
  root.style.setProperty('--app-font-sans', fontStack(bodyFont));
  // Heading font is applied through a runtime style rule (only when set).
  let styleEl = document.getElementById(HEADING_STYLE_ID) as HTMLStyleElement | null;
  if (headingFont) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = HEADING_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `h1,h2,h3,h4,h5,h6{font-family:${fontStack(headingFont)};}`;
  } else if (styleEl) {
    styleEl.textContent = '';
  }
}

interface BrandingContextType {
  branding: ResolvedBranding;
  raw: BrandingData | undefined;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextType | null>(null);

/** Apply the configured brand colours to the document as CSS variables. */
function applyTheme(primary: string | null | undefined, secondary: string | null | undefined) {
  const root = document.documentElement;
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  if (p) {
    const hsl = hexToHslTriplet(p);
    const hslDark = hexToHslTriplet(darkenHex(p, 0.4));
    if (hsl) {
      root.style.setProperty('--primary', hsl);
      root.style.setProperty('--ring', hsl);
      root.style.setProperty('--chart-1', hsl);
    }
    if (hslDark) root.style.setProperty('--sidebar', hslDark);
  }
  if (s) {
    const hsl = hexToHslTriplet(s);
    if (hsl) {
      root.style.setProperty('--accent', hsl);
      root.style.setProperty('--sidebar-primary', hsl);
      root.style.setProperty('--sidebar-ring', hsl);
      root.style.setProperty('--chart-3', hsl);
    }
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetBranding();

  // Feed the module-level cache (used by plain print utilities) synchronously so
  // the resolved branding below reflects the latest data on the same render.
  // This is idempotent and keeps the non-React cache in lockstep with the hook.
  setBrandingCache((data as BrandingData) ?? null);

  // Apply the runtime CSS-variable theme as a side effect.
  useEffect(() => {
    if (data) {
      applyTheme(data.primary_color, data.secondary_color);
      applyFonts(
        (data as BrandingData & { body_font?: string | null }).body_font,
        (data as BrandingData & { heading_font?: string | null }).heading_font,
      );
    }
  }, [data]);

  const value = useMemo<BrandingContextType>(
    () => ({ branding: getBranding(), raw: data as BrandingData | undefined, isLoading }),
    [data, isLoading],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextType {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within a BrandingProvider');
  return ctx;
}
